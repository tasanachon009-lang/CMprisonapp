import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { getSetting } from "../bootstrap";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { cohortLabel } from "./cohorts";

/**
 * วิทยากรหลายคนต่อคาบ (สเปก 11.4) — ส่วนตาราง: เพิ่ม/เอาออก, ตรวจจำนวนสูงสุด, ตรวจชนเวลาทุกคน
 * (คำนวณ/แบ่งค่าตอบแทนอยู่ในขั้น 3)
 */
export const STAFF_ROLE_LABEL: Record<string, string> = { lead: "วิทยากรหลัก", co: "วิทยากรร่วม" };

type Session = typeof schema.cohortSessions.$inferSelect;
export type StaffInput = { userId?: number | null; externalName?: string | null; role?: "lead" | "co" | null };
export type Conflict = { sessionId: number; cohortId: number; label: string; title: string; date: string; startTime: string; endTime: string };

/** จำนวนวิทยากรสูงสุดของคาบ — Infinity = ทั้งทีม (ไม่จำกัด) */
export function maxStaffOf(db: DB, s: Pick<Session, "maxStaff">) {
  const n = s.maxStaff ?? getSetting<number>(db, "schedule.defaultMaxStaff", 2);
  return n === 0 ? Infinity : n;
}

const normName = (x: string) => x.trim().replace(/\s+/g, " ");
const overlaps = (a: { startTime: string; endTime: string }, b: { startTime: string; endTime: string }) => a.startTime < b.endTime && b.startTime < a.endTime;

function getSession(db: DB, id: number) {
  const s = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.id, id), isNull(schema.cohortSessions.deletedAt))).get();
  if (!s) throw new RuleError("ไม่พบคาบนี้");
  return s;
}

function assertEditable(db: DB, s: Session) {
  const c = db.select({ status: schema.cohorts.status }).from(schema.cohorts).where(eq(schema.cohorts.id, s.cohortId)).get();
  if (c?.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว แก้ตารางไม่ได้");
  if (s.lockedAt) throw new RuleError("คาบนี้ล็อกแล้ว (อนุมัติค่าตอบแทนแล้ว) — ถ้าต้องแก้ ให้ผู้ดูแลปลดล็อกก่อน");
  if (s.status === "cancelled") throw new RuleError("คาบนี้ถูกยกเลิกแล้ว");
}

/** คาบอื่นในวันเดียวกันที่เวลาซ้อนกัน และคนนี้เป็นวิทยากรอยู่ (ทุกรุ่น ทุกหลักสูตร) */
export function findConflicts(db: DB, s: Pick<Session, "id" | "date" | "startTime" | "endTime">, who: StaffInput): Conflict[] {
  const whoCond = who.userId
    ? eq(schema.sessionStaff.userId, who.userId)
    : who.externalName
      ? sql`lower(trim(${schema.sessionStaff.externalName})) = ${normName(who.externalName).toLowerCase()}`
      : null;
  if (!whoCond) return [];
  return db
    .select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses })
    .from(schema.sessionStaff)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.sessionStaff.sessionId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(
      whoCond,
      isNull(schema.sessionStaff.deletedAt),
      isNull(schema.cohortSessions.deletedAt),
      ne(schema.cohortSessions.status, "cancelled"),
      eq(schema.cohortSessions.date, s.date),
      ne(schema.cohortSessions.id, s.id),
    ))
    .all()
    .filter((x) => overlaps(x.s, s))
    .map((x) => ({ sessionId: x.s.id, cohortId: x.c.id, label: `${x.course.shortName} ${cohortLabel(x.c)}`, title: x.s.title, date: x.s.date, startTime: x.s.startTime, endTime: x.s.endTime }));
}

export function activeStaff(db: DB, sessionIds: number[]) {
  if (!sessionIds.length) return [];
  return db.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, sessionIds), isNull(schema.sessionStaff.deletedAt))).all();
}

/** เพิ่มวิทยากรในคาบ — ชนเวลาต้องกดยืนยัน (acknowledgeConflict) และบันทึกเหตุผลในประวัติ */
export function addStaff(db: DB, sessionId: number, input: StaffInput, actor: { userId: number; ip?: string | null }, opts: { acknowledgeConflict?: boolean } = {}) {
  const s = getSession(db, sessionId);
  assertEditable(db, s);
  const externalName = input.externalName ? normName(input.externalName) : null;
  if (!input.userId === !externalName) throw new RuleError("กรุณาเลือกเจ้าหน้าที่ หรือพิมพ์ชื่อวิทยากรภายนอก (อย่างใดอย่างหนึ่ง)");
  if (externalName && externalName.length > 200) throw new RuleError("ชื่อวิทยากรยาวเกินไป");
  if (input.role && !["lead", "co"].includes(input.role)) throw new RuleError("บทบาทไม่ถูกต้อง");
  if (input.userId) {
    const u = db.select().from(schema.users).where(eq(schema.users.id, input.userId)).get();
    if (!u || u.status !== "active" || u.deletedAt) throw new RuleError("ไม่พบเจ้าหน้าที่ หรือบัญชีถูกระงับ");
  }
  const current = activeStaff(db, [sessionId]);
  if (current.some((x) => (input.userId ? x.userId === input.userId : x.externalName && normName(x.externalName).toLowerCase() === externalName!.toLowerCase()))) {
    throw new RuleError("คนนี้อยู่ในคาบนี้แล้ว");
  }
  const max = maxStaffOf(db, s);
  if (current.length >= max) throw new RuleError(`คาบนี้มีวิทยากรได้สูงสุด ${max} คน — เอาคนเดิมออกก่อน หรือให้ผู้ดูแลปรับจำนวนสูงสุดของหัวข้อ`, undefined, "max_staff");
  const conflicts = findConflicts(db, s, { userId: input.userId, externalName });
  if (conflicts.length && !opts.acknowledgeConflict) {
    const c = conflicts[0];
    throw new RuleError(`สอนซ้อนเวลา: มีคาบ "${c.title}" (${c.label}) เวลา ${c.startTime}–${c.endTime} วันเดียวกันอยู่แล้ว${conflicts.length > 1 ? ` และอีก ${conflicts.length - 1} คาบ` : ""} — ตรวจตารางก่อน หรือกด "ยืนยันเพิ่ม" ถ้าตั้งใจ`, undefined, "conflict");
  }
  const row = db.insert(schema.sessionStaff).values({ sessionId, userId: input.userId ?? null, externalName, role: input.role ?? null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, {
    userId: actor.userId, action: "create", entity: "session_staff", entityId: row.id,
    after: { sessionId, userId: input.userId ?? null, externalName, role: input.role ?? null },
    note: conflicts.length ? `ยืนยันเพิ่มทั้งที่ชนเวลา ${conflicts.length} คาบ` : null, ip: actor.ip,
  });
  return { row, conflicts };
}

export function removeStaff(db: DB, staffId: number, actor: { userId: number; ip?: string | null }) {
  const st = db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.id, staffId), isNull(schema.sessionStaff.deletedAt))).get();
  if (!st) throw new RuleError("ไม่พบรายชื่อนี้ในคาบ (อาจถูกเอาออกไปแล้ว)");
  assertEditable(db, getSession(db, st.sessionId));
  db.update(schema.sessionStaff).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.sessionStaff.id, staffId)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "session_staff", entityId: staffId, before: { sessionId: st.sessionId, userId: st.userId, externalName: st.externalName, role: st.role }, ip: actor.ip });
  return st;
}

export function setStaffRole(db: DB, staffId: number, role: "lead" | "co" | null, actor: { userId: number; ip?: string | null }) {
  const st = db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.id, staffId), isNull(schema.sessionStaff.deletedAt))).get();
  if (!st) throw new RuleError("ไม่พบรายชื่อนี้ในคาบ");
  if (role && !["lead", "co"].includes(role)) throw new RuleError("บทบาทไม่ถูกต้อง");
  assertEditable(db, getSession(db, st.sessionId));
  db.update(schema.sessionStaff).set({ role, updatedBy: actor.userId, updatedAt: new Date(), version: st.version + 1 }).where(eq(schema.sessionStaff.id, staffId)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "session_staff", entityId: staffId, before: { role: st.role }, after: { role }, ip: actor.ip });
}

/** ปัญหาในตาราง (สเปก 11.4 "ตรวจ"): ไม่มีผู้รับผิดชอบ, เกินจำนวน, สอนซ้อนเวลา — ทำกับทุกคนในคาบ */
export function scheduleIssues(db: DB, sessions: Session[]) {
  const staff = activeStaff(db, sessions.map((s) => s.id));
  const out = new Map<number, { noStaff: boolean; overMax: number | null; conflicts: Array<{ staffId: number; with: Conflict[] }> }>();
  for (const s of sessions) {
    if (s.status === "cancelled") continue;
    const mine = staff.filter((x) => x.sessionId === s.id);
    const max = maxStaffOf(db, s);
    const conflicts = mine.map((x) => ({ staffId: x.id, with: findConflicts(db, s, { userId: x.userId, externalName: x.externalName }) })).filter((x) => x.with.length);
    out.set(s.id, { noStaff: mine.length === 0, overMax: mine.length > max ? max : null, conflicts });
  }
  return { staff, issues: out };
}
