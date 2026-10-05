import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { isValidISODate } from "../thai-date";

/**
 * ผู้รับผิดชอบประจำวันของรุ่น (สเปก 22B) — วันละ 1 คน จากกลุ่ม A
 * ค่าเริ่มต้นหมุนเวียนตามรายชื่อ (ลำดับในหน้าผู้ใช้) · กำหนดเองได้ · ใช้ตัดสินว่าใครบันทึกแทนวิทยากรภายนอก
 */

/** กลุ่ม A = เจ้าหน้าที่หลัก (ไม่รวมหัวหน้า/รอง — ถ้าไม่มีเลยจึงรวม) */
export function dutyCandidates(db: DB) {
  const rows = db
    .select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName, role: schema.userRoles.role, sort: schema.users.sortOrder })
    .from(schema.users)
    .innerJoin(schema.userRoles, eq(schema.userRoles.userId, schema.users.id))
    .where(and(eq(schema.users.status, "active"), isNull(schema.users.deletedAt)))
    .orderBy(asc(schema.users.sortOrder), asc(schema.users.id))
    .all();
  const byUser = new Map<number, { id: number; name: string; roles: string[] }>();
  for (const r of rows) {
    const u = byUser.get(r.id) ?? { id: r.id, name: `${r.f} ${r.l}`, roles: [] };
    u.roles.push(r.role);
    byUser.set(r.id, u);
  }
  const rehab = [...byUser.values()].filter((u) => u.roles.includes("rehab"));
  const groupA = rehab.filter((u) => !u.roles.includes("admin"));
  return (groupA.length ? groupA : rehab).map(({ id, name }) => ({ id, name }));
}

function cohortDates(db: DB, cohortId: number) {
  const rows = db
    .select({ date: schema.cohortSessions.date })
    .from(schema.cohortSessions)
    .where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled")))
    .all();
  return Array.from(new Set(rows.map((r) => r.date))).sort();
}

export function dutyMap(db: DB, cohortId: number) {
  const rows = db.select().from(schema.dutyOfficers).where(and(eq(schema.dutyOfficers.cohortId, cohortId), isNull(schema.dutyOfficers.deletedAt))).all();
  return new Map(rows.map((r) => [r.date, r]));
}

/** เติมผู้รับผิดชอบให้วันที่ยังไม่มี (หมุนเวียนตามลำดับวันของรุ่น) — ไม่แตะวันที่กำหนดไว้แล้ว */
export function ensureDutyRoster(db: DB, cohortId: number, actorId: number | null = null) {
  const people = dutyCandidates(db);
  if (!people.length) return 0;
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort || cohort.status === "closed") return 0;
  const have = dutyMap(db, cohortId);
  const dates = cohortDates(db, cohortId);
  // เริ่มคนละตำแหน่งในแต่ละรุ่น เพื่อไม่ให้คนแรกในรายชื่อรับทุกรุ่นพร้อมกัน
  const offset = cohortId % people.length;
  let n = 0;
  dates.forEach((date, i) => {
    if (have.has(date)) return;
    db.insert(schema.dutyOfficers).values({ cohortId, date, userId: people[(i + offset) % people.length].id, source: "auto", createdBy: actorId, updatedBy: actorId }).onConflictDoNothing().run();
    n++;
  });
  return n;
}

export function setDutyOfficer(db: DB, cohortId: number, date: string, userId: number, actor: { userId: number; ip?: string | null }) {
  if (!isValidISODate(date)) throw new RuleError("วันที่ไม่ถูกต้อง");
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort) throw new RuleError("ไม่พบรุ่น");
  if (cohort.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว แก้ไม่ได้");
  if (!dutyCandidates(db).some((u) => u.id === userId)) throw new RuleError("ผู้รับผิดชอบประจำวันต้องเป็นเจ้าหน้าที่หลัก (กลุ่ม A) — เลือกจากรายชื่อ");
  const prev = dutyMap(db, cohortId).get(date);
  if (prev) {
    db.update(schema.dutyOfficers).set({ userId, source: "manual", updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.dutyOfficers.id, prev.id)).run();
  } else {
    db.insert(schema.dutyOfficers).values({ cohortId, date, userId, source: "manual", createdBy: actor.userId, updatedBy: actor.userId }).run();
  }
  writeAudit(db, { userId: actor.userId, action: "update", entity: "duty_officer", entityId: cohortId, before: prev ? { date, userId: prev.userId } : null, after: { date, userId }, ip: actor.ip });
}

/** รุ่นที่ฉันเป็นผู้รับผิดชอบประจำวันในวันที่กำหนด */
export function myDutyCohorts(db: DB, userId: number, date: string) {
  return db
    .select({ cohortId: schema.dutyOfficers.cohortId })
    .from(schema.dutyOfficers)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.dutyOfficers.cohortId))
    .where(and(eq(schema.dutyOfficers.userId, userId), eq(schema.dutyOfficers.date, date), isNull(schema.dutyOfficers.deletedAt), ne(schema.cohorts.status, "closed")))
    .all()
    .map((r) => r.cohortId);
}

/** ผู้รับผิดชอบของ (รุ่น, วันที่) หลายคู่พร้อมกัน → key `${cohortId}:${date}` */
export function dutyLookup(db: DB, cohortIds: number[]) {
  if (!cohortIds.length) return new Map<string, number>();
  const rows = db.select().from(schema.dutyOfficers).where(and(inArray(schema.dutyOfficers.cohortId, cohortIds), isNull(schema.dutyOfficers.deletedAt))).all();
  return new Map(rows.map((r) => [`${r.cohortId}:${r.date}`, r.userId]));
}
