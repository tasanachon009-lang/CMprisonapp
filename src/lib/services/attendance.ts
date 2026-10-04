import { and, asc, eq, inArray, isNull, lte, or, gt } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "./registry";
import { ATTENDANCE_STATUSES, summarizeAttendance, type AttendanceStatus } from "../rules/attendance-rules";

/** รายชื่อที่ต้องเช็คในคาบ: ลงทะเบียนก่อน/ในวันนั้น และยังไม่ออก (ออกวันใด → ตัดตั้งแต่วันนั้น) */
export function sessionRoster(db: DB, sessionId: number) {
  const session = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, sessionId)).get();
  if (!session) throw new RuleError("ไม่พบคาบกิจกรรม");
  const rows = db
    .select({
      enrollmentId: schema.enrollments.id,
      enrollmentStatus: schema.enrollments.status,
      groupNo: schema.enrollments.groupNo,
      incarcerationId: schema.incarcerations.id,
      inmateNo: schema.incarcerations.inmateNo,
      zone: schema.incarcerations.zone,
      thumbPath: schema.incarcerations.thumbPath,
      personId: schema.persons.id,
      prefix: schema.persons.prefix,
      firstName: schema.persons.firstName,
      lastName: schema.persons.lastName,
      searchKey: schema.persons.searchKey,
    })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(
      and(
        eq(schema.enrollments.cohortId, session.cohortId),
        isNull(schema.enrollments.deletedAt),
        lte(schema.enrollments.enrolledDate, session.date),
        inArray(schema.enrollments.status, ["draft", "active", "completed", "dropped", "failed"]),
        or(isNull(schema.enrollments.leftDate), gt(schema.enrollments.leftDate, session.date)),
      ),
    )
    .orderBy(asc(schema.persons.firstName), asc(schema.persons.lastName))
    .all();
  const existing = db.select().from(schema.attendance).where(eq(schema.attendance.sessionId, sessionId)).all();
  const byEnrollment = new Map(existing.map((a) => [a.enrollmentId, a]));
  // ชื่อซ้ำในรุ่นเดียวกัน → ป้าย "ชื่อซ้ำ"
  const nameCount = new Map<string, number>();
  for (const r of rows) nameCount.set(r.searchKey, (nameCount.get(r.searchKey) ?? 0) + 1);
  return {
    session,
    rows: rows.map((r) => ({ ...r, duplicateName: (nameCount.get(r.searchKey) ?? 0) > 1, record: byEnrollment.get(r.enrollmentId) ?? null })),
  };
}

export type AttendanceEntry = { enrollmentId: number; status: AttendanceStatus; correctionsType?: string | null; note?: string | null };

/**
 * บันทึกเช็คชื่อ: ทุกคนในรายชื่อต้องมีผล (ค่าเริ่มต้น "มา")
 * กันเช็คซ้ำ: 1 คาบ 1 คน 1 แถว (unique index) ถ้ามีอยู่แล้วจะอัปเดตพร้อมบันทึกค่าเดิม→ค่าใหม่
 */
export function saveAttendance(
  db: DB,
  sessionId: number,
  entries: AttendanceEntry[],
  actor: { userId: number; isAdmin: boolean; ip?: string | null; source?: string | null },
) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const { session, rows } = sessionRoster(t, sessionId);
    if (session.lockedAt && !actor.isAdmin) throw new RuleError("คาบนี้ถูกล็อกแล้ว (อนุมัติค่าตอบแทนแล้ว) — ติดต่อหัวหน้า/รองเพื่อปลดล็อก");
    if (!session.takesAttendance) throw new RuleError("คาบนี้ไม่ต้องเช็คชื่อ");
    const allowed = new Set(rows.map((r) => r.enrollmentId));
    const now = new Date();
    let created = 0, updated = 0;
    for (const e of entries) {
      if (!allowed.has(e.enrollmentId)) throw new RuleError("มีรายชื่อที่ไม่ได้อยู่ในคาบนี้ (อาจออกจากเรือนจำแล้ว) กรุณาโหลดหน้าใหม่");
      if (!ATTENDANCE_STATUSES.includes(e.status)) throw new RuleError("สถานะการเช็คชื่อไม่ถูกต้อง");
      if (e.status === "corrections" && !e.correctionsType) throw new RuleError("กรุณาระบุประเภทเหตุราชทัณฑ์ (ไปศาล/พบทนาย/ออก รพ./อื่นๆ)");
      const correctionsType = e.status === "corrections" ? e.correctionsType ?? null : null;
      const note = e.note?.trim() || null;
      const prev = rows.find((r) => r.enrollmentId === e.enrollmentId)!.record;
      if (!prev) {
        tx.insert(schema.attendance)
          .values({ sessionId, enrollmentId: e.enrollmentId, status: e.status, correctionsType, note, source: actor.source ?? null, createdBy: actor.userId, updatedBy: actor.userId })
          .run();
        created++;
      } else if (prev.status !== e.status || prev.correctionsType !== correctionsType || prev.note !== note) {
        tx.update(schema.attendance)
          .set({ status: e.status, correctionsType, note, updatedBy: actor.userId, updatedAt: now, version: prev.version + 1 })
          .where(eq(schema.attendance.id, prev.id))
          .run();
        writeAudit(tx, {
          userId: actor.userId, action: "update", entity: "attendance", entityId: prev.id,
          before: { status: prev.status, correctionsType: prev.correctionsType, note: prev.note },
          after: { status: e.status, correctionsType, note }, ip: actor.ip,
        });
        updated++;
      }
    }
    tx.update(schema.cohortSessions)
      .set({ attendanceCheckedAt: session.attendanceCheckedAt ?? now, attendanceCheckedBy: session.attendanceCheckedBy ?? actor.userId, updatedAt: now, updatedBy: actor.userId })
      .where(eq(schema.cohortSessions.id, sessionId))
      .run();
    if (created) {
      writeAudit(tx, { userId: actor.userId, action: "attendance.check", entity: "cohort_session", entityId: sessionId, after: { created }, note: actor.source ?? null, ip: actor.ip });
    }
    return { created, updated };
  });
}

/** สรุปการเข้าร่วมรายคนของรุ่น */
export function cohortAttendanceSummary(db: DB, cohortId: number, passPct: number, targetHours: number) {
  const recs = db
    .select({ enrollmentId: schema.attendance.enrollmentId, status: schema.attendance.status, hours: schema.cohortSessions.hours })
    .from(schema.attendance)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.attendance.sessionId))
    .where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt)))
    .all();
  const by = new Map<number, Array<{ status: AttendanceStatus; hours: number }>>();
  for (const r of recs) {
    if (!by.has(r.enrollmentId)) by.set(r.enrollmentId, []);
    by.get(r.enrollmentId)!.push({ status: r.status as AttendanceStatus, hours: r.hours });
  }
  const out = new Map<number, ReturnType<typeof summarizeAttendance>>();
  for (const [id, list] of by) out.set(id, summarizeAttendance(list, targetHours, passPct));
  return out;
}
