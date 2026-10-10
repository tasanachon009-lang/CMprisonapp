import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { RuleError } from "../errors";
import { isValidISODate, todayISO } from "../thai-date";
import { FAST_PHASES, checkAdvance, phaseDef, phaseStatus, phaseStartDate, type PhaseCode, type PhaseStatus } from "../fast/phases";

/**
 * ระยะการบำบัดของสมาชิกชุมชนบำบัด (สเปก 16): ระยะตามปฏิทินคำนวณอัตโนมัติจากสัปดาห์ของรุ่น
 * ระยะจริงของสมาชิกเลื่อนได้เมื่อมีผู้อนุมัติ (สิทธิ์ tc.approve) พร้อมบันทึกผลการประเมิน — ผู้เรียกตรวจสิทธิ์ก่อน
 */
type Actor = { userId: number; ip?: string | null };

export function isFastCohort(db: DB, cohortId: number) {
  const row = db.select({ code: schema.courses.code }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  return row?.code === "FAST";
}

export function phaseRecordsOf(db: DB, enrollmentIds: number[]) {
  if (!enrollmentIds.length) return [];
  return db.select().from(schema.phaseRecords).where(and(inArray(schema.phaseRecords.enrollmentId, enrollmentIds), isNull(schema.phaseRecords.deletedAt))).orderBy(asc(schema.phaseRecords.startDate), asc(schema.phaseRecords.id)).all();
}

export type MemberPhase = { enrollmentId: number; status: PhaseStatus; records: Array<{ phase: string; startDate: string; approvedBy: number | null; note: string | null }> };

/** สถานะระยะของสมาชิกทุกคนในรุ่น (เฉพาะผู้กำลังอบรม/ครบหลักสูตร) */
export function cohortPhases(db: DB, cohortId: number, today = todayISO()): MemberPhase[] {
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort) return [];
  const enrs = db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["active", "completed"]), isNull(schema.enrollments.deletedAt))).all();
  const recs = phaseRecordsOf(db, enrs.map((e) => e.id));
  return enrs.map((e) => {
    const mine = recs.filter((r) => r.enrollmentId === e.id);
    return { enrollmentId: e.id, status: phaseStatus(cohort.startDate, today, mine.map((r) => r.phase)), records: mine.map((r) => ({ phase: r.phase, startDate: r.startDate, approvedBy: r.approvedBy, note: r.note })) };
  });
}

/** สรุปจำนวนสมาชิกต่อระยะ + จำนวนที่ถึงกำหนดเลื่อนระยะ (ไม่ระบุชื่อ) */
export function phaseSummary(db: DB, cohortId: number, today = todayISO()) {
  const list = cohortPhases(db, cohortId, today);
  return {
    total: list.length,
    byPhase: FAST_PHASES.map((p) => ({ phase: p, n: list.filter((m) => m.status.current.code === p.code).length })),
    due: list.filter((m) => m.status.due).length,
  };
}

/**
 * อนุมัติเลื่อนระยะ (หลายคนพร้อมกันได้): เลื่อนทีละระยะ ไม่ย้อน · วันที่ไม่เป็นอนาคต ·
 * เลื่อนก่อนถึงสัปดาห์ตามปฏิทินต้องระบุเหตุผล · ต้องมีผลการประเมิน/เหตุผลประกอบ
 */
export function advancePhase(db: DB, input: { enrollmentIds: number[]; toPhase: string; date: string; note: string }, actor: Actor) {
  const to = phaseDef(input.toPhase);
  if (!to) throw new RuleError("ไม่พบระยะการบำบัดนี้ กรุณาโหลดหน้าใหม่");
  if (!isValidISODate(input.date)) throw new RuleError("กรุณาเลือกวันที่เลื่อนระยะ");
  if (input.date > todayISO()) throw new RuleError("วันที่เลื่อนระยะต้องไม่เป็นวันในอนาคต");
  const note = input.note.trim();
  if (note.length < 3) throw new RuleError("กรุณาระบุผลการประเมินหรือเหตุผลประกอบการเลื่อนระยะ");
  if (!input.enrollmentIds.length) throw new RuleError("กรุณาเลือกสมาชิกอย่างน้อย 1 คน");
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const done: number[] = [], errors: Array<{ enrollmentId: number; error: string }> = [];
    for (const id of Array.from(new Set(input.enrollmentIds))) {
      const row = tx.select({ e: schema.enrollments, c: schema.cohorts, code: schema.courses.code }).from(schema.enrollments)
        .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
        .where(and(eq(schema.enrollments.id, id), isNull(schema.enrollments.deletedAt))).get();
      if (!row || row.code !== "FAST") { errors.push({ enrollmentId: id, error: "ไม่ใช่สมาชิกชุมชนบำบัด" }); continue; }
      if (!["active", "completed"].includes(row.e.status)) { errors.push({ enrollmentId: id, error: "สมาชิกไม่ได้อยู่ในสถานะกำลังอบรม" }); continue; }
      const mine = phaseRecordsOf(t, [id]);
      const st = phaseStatus(row.c.startDate, input.date, mine.map((r) => r.phase));
      const bad = checkAdvance(st.current.code, to.code);
      if (bad) { errors.push({ enrollmentId: id, error: bad }); continue; }
      if (to.code === "aftercare" && row.e.status !== "completed") { errors.push({ enrollmentId: id, error: "เข้าระยะ After care ได้เมื่อบันทึกครบหลักสูตรแล้ว" }); continue; }
      if (input.date < row.c.startDate) { errors.push({ enrollmentId: id, error: "วันที่เลื่อนระยะอยู่ก่อนวันเริ่มรุ่น" }); continue; }
      const last = mine.at(-1);
      if (last && input.date < last.startDate) { errors.push({ enrollmentId: id, error: "วันที่เลื่อนระยะอยู่ก่อนวันเริ่มระยะปัจจุบัน" }); continue; }
      const early = input.date < phaseStartDate(row.c.startDate, to.code as PhaseCode);
      const rec = tx.insert(schema.phaseRecords).values({ enrollmentId: id, phase: to.code, startDate: input.date, approvedBy: actor.userId, note, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
      writeAudit(tx, { userId: actor.userId, action: "create", entity: "phase", entityId: rec.id, before: { phase: st.current.code }, after: { phase: to.code, date: input.date, early }, note: early ? "เลื่อนก่อนกำหนดตามปฏิทิน" : null, ip: actor.ip ?? null });
      done.push(id);
    }
    return { done, errors };
  });
}

/** ยกเลิกการเลื่อนระยะล่าสุด (บันทึกผิด) — ซ่อนแถว เก็บประวัติใน audit */
export function revertPhase(db: DB, enrollmentId: number, reason: string, actor: Actor) {
  if (reason.trim().length < 3) throw new RuleError("กรุณาระบุเหตุผลที่ยกเลิก");
  const last = phaseRecordsOf(db, [enrollmentId]).at(-1);
  if (!last) throw new RuleError("สมาชิกยังอยู่ระยะ Entry ไม่มีรายการให้ยกเลิก");
  db.update(schema.phaseRecords).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.phaseRecords.id, last.id)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "phase", entityId: last.id, before: { phase: last.phase, date: last.startDate }, note: reason.trim(), ip: actor.ip ?? null });
}

/** งานตั้งเวลา/หน้าแรก: แจ้งผู้ดูแลเมื่อมีสมาชิกถึงกำหนดเลื่อนระยะ (ไม่มีชื่อในข้อความ) */
export function notifyPhaseDue(db: DB, cohortId: number, label: string, today = todayISO()) {
  const s = phaseSummary(db, cohortId, today);
  if (s.due > 0) notify(db, { role: "admin", severity: "info", kind: "tc_phase_due", message: `${label}: มีสมาชิกถึงกำหนดเลื่อนระยะ ${s.due} คน รอประเมินและอนุมัติ`, link: `/cohorts/${cohortId}/tc` });
  return s.due;
}
