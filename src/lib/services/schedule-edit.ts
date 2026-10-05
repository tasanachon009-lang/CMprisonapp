import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { getSetting } from "../bootstrap";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { isValidISODate } from "../thai-date";
import { cohortLabel } from "./cohorts";
import { activeStaff, assertEditable, findConflicts, getSession, overlaps, type Conflict } from "./schedule";
import { ensureDutyRoster } from "./duty";

/**
 * แก้ตารางของรุ่น (สเปก 11.4) และตรวจความทับซ้อน (สเปก 22B)
 * - ย้าย/แก้คาบ, เพิ่มคาบ, ยกเลิกคาบ, เปลี่ยนวิทยากรเป็นช่วงวันที่
 * - ตรวจ: วิทยากรสอนซ้อน, สถานที่ใช้ซ้อน, ผู้ต้องขังมีกิจกรรมซ้อน (อยู่ 2 หลักสูตร), วิทยากรเกินที่เบิกได้
 */
type Session = typeof schema.cohortSessions.$inferSelect;
type Actor = { userId: number; ip?: string | null };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export type SessionPatch = { date?: string; startTime?: string; endTime?: string; hours?: number; location?: string | null; title?: string; topicId?: number | null };

/** สถานที่เดียวกันใช้ซ้อนเวลา (ทุกหลักสูตร) */
export function locationConflicts(db: DB, s: Pick<Session, "id" | "date" | "startTime" | "endTime" | "location">): Conflict[] {
  if (!s.location?.trim()) return [];
  return db
    .select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses })
    .from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohortSessions.date, s.date), eq(schema.cohortSessions.location, s.location.trim()), ne(schema.cohortSessions.id, s.id), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled")))
    .all()
    .filter((x) => overlaps(x.s, s))
    .map((x) => ({ sessionId: x.s.id, cohortId: x.c.id, label: `${x.course.shortName} ${cohortLabel(x.c)}`, title: x.s.title, date: x.s.date, startTime: x.s.startTime, endTime: x.s.endTime }));
}

function checkTimes(date: string, start: string, end: string, hours: number) {
  if (!isValidISODate(date)) throw new RuleError("วันที่ไม่ถูกต้อง");
  if (!TIME.test(start) || !TIME.test(end)) throw new RuleError("เวลาต้องเป็นรูปแบบ 09:00");
  if (start >= end) throw new RuleError("เวลาเริ่มต้องก่อนเวลาสิ้นสุด");
  if (!(hours > 0 && hours <= 12)) throw new RuleError("จำนวนชั่วโมงต้องมากกว่า 0 และไม่เกิน 12");
  if (hours > (minutes(end) - minutes(start)) / 60 + 1e-9) throw new RuleError("จำนวนชั่วโมงมากกว่าช่วงเวลาของคาบ — ตรวจเวลาหรือชั่วโมงอีกครั้ง");
}

/** คำเตือนเมื่อย้ายคาบไปเวลานี้: วิทยากรทุกคนในคาบสอนซ้อน / สถานที่ใช้ซ้อน */
export function moveWarnings(db: DB, s: Session): string[] {
  const out: string[] = [];
  for (const st of activeStaff(db, [s.id])) {
    for (const c of findConflicts(db, s, { userId: st.userId, instructorId: st.instructorId, externalName: st.externalName })) {
      out.push(`วิทยากรสอนซ้อน: "${c.title}" (${c.label}) ${c.startTime}–${c.endTime}`);
    }
  }
  for (const c of locationConflicts(db, s)) out.push(`สถานที่ "${s.location}" ใช้ซ้อนกับ "${c.title}" (${c.label}) ${c.startTime}–${c.endTime}`);
  return Array.from(new Set(out));
}

export function updateSession(db: DB, id: number, patch: SessionPatch, actor: Actor, opts: { acknowledge?: boolean } = {}) {
  const prev = getSession(db, id);
  assertEditable(db, prev);
  const next = {
    date: patch.date ?? prev.date, startTime: patch.startTime ?? prev.startTime, endTime: patch.endTime ?? prev.endTime,
    hours: patch.hours ?? prev.hours, location: patch.location === undefined ? prev.location : patch.location?.trim() || null,
    title: patch.title?.trim() || prev.title, topicId: patch.topicId === undefined ? prev.topicId : patch.topicId,
  };
  checkTimes(next.date, next.startTime, next.endTime, next.hours);
  if (prev.attendanceCheckedAt && next.date !== prev.date) throw new RuleError("คาบนี้เช็คชื่อแล้ว ย้ายวันไม่ได้ — ถ้าไม่ได้สอนจริง ให้ยกเลิกคาบแล้วสร้างคาบชดเชย");
  if (next.topicId && next.topicId !== prev.topicId) {
    const t = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.id, next.topicId)).get();
    const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, prev.cohortId)).get()!;
    if (!t || t.courseId !== c.courseId) throw new RuleError("หัวข้อต้องอยู่ในหลักสูตรเดียวกับรุ่น");
    if (!patch.title) next.title = t.name;
  }
  const warnings = moveWarnings(db, { ...prev, ...next });
  if (warnings.length && !opts.acknowledge) throw new RuleError(`${warnings[0]}${warnings.length > 1 ? ` และอีก ${warnings.length - 1} รายการ` : ""} — ตรวจตารางก่อน หรือกด "ยืนยัน" ถ้าตั้งใจ`, undefined, "conflict");
  db.update(schema.cohortSessions).set({ ...next, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.cohortSessions.id, id)).run();
  writeAudit(db, {
    userId: actor.userId, action: "update", entity: "cohort_session", entityId: id,
    before: { date: prev.date, startTime: prev.startTime, endTime: prev.endTime, hours: prev.hours, location: prev.location, title: prev.title, topicId: prev.topicId },
    after: next, note: warnings.length ? `ยืนยันทั้งที่มีความทับซ้อน: ${warnings.join(" | ")}` : null, ip: actor.ip,
  });
  if (next.date !== prev.date) ensureDutyRoster(db, prev.cohortId, actor.userId);
  return { warnings };
}

export function addSession(db: DB, cohortId: number, input: { date: string; startTime: string; endTime: string; hours: number; title?: string; topicId?: number | null; location?: string | null; takesAttendance?: boolean }, actor: Actor) {
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c || c.deletedAt) throw new RuleError("ไม่พบรุ่น");
  if (c.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว แก้ตารางไม่ได้");
  checkTimes(input.date, input.startTime, input.endTime, input.hours);
  let title = input.title?.trim() ?? "";
  let category: string | null = null;
  if (input.topicId) {
    const t = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.id, input.topicId)).get();
    if (!t || t.courseId !== c.courseId) throw new RuleError("หัวข้อต้องอยู่ในหลักสูตรเดียวกับรุ่น");
    title ||= t.name;
    category = t.category;
  }
  if (!title) throw new RuleError("กรุณาเลือกหัวข้อหรือพิมพ์ชื่อกิจกรรม");
  const dates = db.select({ d: schema.cohortSessions.date, n: schema.cohortSessions.dayNo }).from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), eq(schema.cohortSessions.date, input.date))).get();
  const row = db.insert(schema.cohortSessions).values({
    cohortId, date: input.date, dayNo: dates?.n ?? null, startTime: input.startTime, endTime: input.endTime, hours: input.hours, title, category,
    topicId: input.topicId ?? null, location: input.location?.trim() || c.location, takesAttendance: input.takesAttendance ?? true, createdBy: actor.userId, updatedBy: actor.userId,
  }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "cohort_session", entityId: row.id, after: { cohortId, date: input.date, startTime: input.startTime, title }, ip: actor.ip });
  ensureDutyRoster(db, cohortId, actor.userId);
  return row;
}

export function cancelSession(db: DB, id: number, reason: string, actor: Actor) {
  const s = getSession(db, id);
  assertEditable(db, s);
  if (!reason.trim()) throw new RuleError("กรุณาระบุเหตุผลที่ยกเลิกคาบ");
  if (s.attendanceCheckedAt) throw new RuleError("คาบนี้เช็คชื่อแล้ว ยกเลิกไม่ได้ — ถ้าเช็คผิดคาบ ให้แก้ผลเช็คชื่อแทน");
  db.update(schema.cohortSessions).set({ status: "cancelled", updatedBy: actor.userId, updatedAt: new Date(), version: s.version + 1 }).where(eq(schema.cohortSessions.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "session.cancel", entity: "cohort_session", entityId: id, note: reason.trim(), ip: actor.ip });
}

export type Person = { userId?: number | null; instructorId?: number | null };

/**
 * เปลี่ยนวิทยากรเป็นช่วง: "เปลี่ยน ก. เป็น ข. ทุกคาบตั้งแต่ ... ถึง ..." (สเปก 11.4)
 * ข้ามคาบที่ล็อก/ยกเลิก/รุ่นปิด และคาบที่ ข. อยู่แล้ว — รายงานคาบที่ ข. สอนซ้อน (ยังเปลี่ยนให้ แต่แจ้งเตือน)
 */
export function replaceStaffInRange(db: DB, input: { from: Person; to: Person; dateFrom: string; dateTo: string; cohortId?: number | null }, actor: Actor) {
  const { from, to } = input;
  if (!isValidISODate(input.dateFrom) || !isValidISODate(input.dateTo) || input.dateFrom > input.dateTo) throw new RuleError("ช่วงวันที่ไม่ถูกต้อง — วันเริ่มต้องไม่หลังวันสิ้นสุด");
  if (!(from.userId || from.instructorId) || !(to.userId || to.instructorId)) throw new RuleError("กรุณาเลือกทั้งคนเดิมและคนใหม่");
  if ((from.userId && from.userId === to.userId) || (from.instructorId && from.instructorId === to.instructorId)) throw new RuleError("คนเดิมกับคนใหม่เป็นคนเดียวกัน");
  const fromCond = from.userId ? eq(schema.sessionStaff.userId, from.userId) : eq(schema.sessionStaff.instructorId, from.instructorId!);
  const rows = db
    .select({ st: schema.sessionStaff, s: schema.cohortSessions, c: schema.cohorts })
    .from(schema.sessionStaff)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.sessionStaff.sessionId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .where(and(fromCond, isNull(schema.sessionStaff.deletedAt), isNull(schema.cohortSessions.deletedAt), gte(schema.cohortSessions.date, input.dateFrom), lte(schema.cohortSessions.date, input.dateTo), input.cohortId ? eq(schema.cohortSessions.cohortId, input.cohortId) : undefined))
    .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime))
    .all();
  const done: number[] = [];
  const skipped: Array<{ sessionId: number; title: string; date: string; reason: string }> = [];
  const conflicts: string[] = [];
  return db.transaction((tx) => {
    for (const { st, s, c } of rows) {
      const why = c.status === "closed" ? "รุ่นปิดแล้ว" : s.lockedAt ? "คาบล็อกแล้ว (อนุมัติค่าตอบแทน)" : s.status === "cancelled" ? "คาบถูกยกเลิก" : null;
      if (why) { skipped.push({ sessionId: s.id, title: s.title, date: s.date, reason: why }); continue; }
      const already = activeStaff(tx as unknown as DB, [s.id]).some((x) => (to.userId ? x.userId === to.userId : x.instructorId === to.instructorId));
      if (already) {
        // คนใหม่อยู่ในคาบแล้ว → เอาคนเดิมออกอย่างเดียว
        tx.update(schema.sessionStaff).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.sessionStaff.id, st.id)).run();
      } else {
        tx.update(schema.sessionStaff).set({ userId: to.userId ?? null, instructorId: to.instructorId ?? null, externalName: null, updatedBy: actor.userId, updatedAt: new Date(), version: st.version + 1 }).where(eq(schema.sessionStaff.id, st.id)).run();
      }
      for (const cf of findConflicts(tx as unknown as DB, s, to)) conflicts.push(`${s.date} ${s.startTime} "${s.title}" ซ้อนกับ "${cf.title}" (${cf.label})`);
      done.push(s.id);
    }
    writeAudit(tx, { userId: actor.userId, action: "schedule.replace_staff", entity: "session_staff", entityId: done.join(",") || null, before: from, after: { to, dateFrom: input.dateFrom, dateTo: input.dateTo, cohortId: input.cohortId ?? null, replaced: done.length, skipped: skipped.length }, ip: actor.ip });
    return { replaced: done.length, skipped, conflicts };
  });
}

/** วิทยากรเกินจำนวนที่เบิกได้ตามลักษณะกิจกรรม (สเปก 11.1) — เฉพาะหัวข้อที่เบิกได้ */
export function payableOverage(db: DB, sessions: Session[]) {
  const max = getSetting<Record<string, number>>(db, "pay.maxPayableByType", { lecture: 1, panel: 5, group: 2, practice: 2, other: 1 });
  const topicIds = Array.from(new Set(sessions.map((s) => s.topicId).filter((x): x is number => !!x)));
  const topics = new Map(topicIds.length ? db.select().from(schema.activityTopics).where(inArray(schema.activityTopics.id, topicIds)).all().map((t) => [t.id, t]) : []);
  const staff = activeStaff(db, sessions.map((s) => s.id));
  const out = new Map<number, { count: number; limit: number; type: string }>();
  for (const s of sessions) {
    const t = s.topicId ? topics.get(s.topicId) : undefined;
    if (!t?.payable || s.status === "cancelled") continue;
    const limit = max[t.activityType] ?? 1;
    const count = staff.filter((x) => x.sessionId === s.id).length;
    if (count > limit) out.set(s.id, { count, limit, type: t.activityType });
  }
  return out;
}

/** ผู้ต้องขังคนเดียวมีกิจกรรมซ้อนเวลา (ลงทะเบียน 2 หลักสูตรพร้อมกัน) ในช่วงวันที่ */
export function inmateOverlaps(db: DB, from: string, to: string) {
  const enr = db.select({ e: schema.enrollments }).from(schema.enrollments).where(and(inArray(schema.enrollments.status, ["draft", "active"]), isNull(schema.enrollments.deletedAt))).all().map((x) => x.e);
  const byInc = new Map<number, typeof enr>();
  for (const e of enr) byInc.set(e.incarcerationId, [...(byInc.get(e.incarcerationId) ?? []), e]);
  const multi = [...byInc.values()].filter((l) => new Set(l.map((x) => x.cohortId)).size > 1);
  if (!multi.length) return [];
  const cohortIds = Array.from(new Set(multi.flatMap((l) => l.map((x) => x.cohortId))));
  const sess = db.select().from(schema.cohortSessions).where(and(inArray(schema.cohortSessions.cohortId, cohortIds), gte(schema.cohortSessions.date, from), lte(schema.cohortSessions.date, to), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled"))).all();
  const out: Array<{ incarcerationId: number; a: Session; b: Session }> = [];
  for (const l of multi) {
    const mine = sess.filter((s) => l.some((e) => e.cohortId === s.cohortId));
    for (let i = 0; i < mine.length; i++) for (let j = i + 1; j < mine.length; j++) {
      if (mine[i].cohortId !== mine[j].cohortId && mine[i].date === mine[j].date && overlaps(mine[i], mine[j])) out.push({ incarcerationId: l[0].incarcerationId, a: mine[i], b: mine[j] });
    }
  }
  return out;
}
