import { and, eq, inArray, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { addDays } from "../thai-date";
import { getSetting, lookupLabel } from "../bootstrap";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";

/**
 * บสต./รท.101 และการติดตามหลังบำบัด (สเปก 14)
 * โปรแกรมไม่เชื่อม บสต. โดยตรง — ทำหน้าที่สร้างงาน เตือน และเช็คว่า "ลงแล้ว" หรือยัง
 */

export const SYSTEM_LABEL: Record<string, string> = { bst: "บสต.", rt101: "รท.101" };
export const STEP_LABEL: Record<string, string> = {
  register: "ลงทะเบียน", screen: "คัดกรอง", treat: "บำบัด", discharge: "จำหน่าย (จบกระบวนการ)",
  followup1: "ติดตามครั้งที่ 1", followup2: "ติดตามครั้งที่ 2", followup3: "ติดตามครั้งที่ 3", followup4: "ติดตามครั้งที่ 4",
  record: "บันทึกผ่านการฟื้นฟู",
};
/** ลำดับขั้น บสต. (สเปก 14.1) */
export const BST_STEP_ORDER = ["register", "screen", "treat", "discharge", "followup1", "followup2", "followup3", "followup4"];
export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "ยังไม่ลง", done: "ลงแล้ว", unfollowable: "ติดตามไม่ได้", closed: "ปิดการติดตาม", cancelled: "ยกเลิก",
};
export const DONE_BUTTON_LABEL: Record<string, string> = { bst: "ลง บสต. แล้ว", rt101: "ลง รท.101 แล้ว" };

export type DueDays = { register: number; screen: number; treat: number; discharge: number; followup: number; rt101: number };
const DUE_DEFAULT: DueDays = { register: 7, screen: 7, treat: 7, discharge: 7, followup: 7, rt101: 7 };
const dueDays = (tx: Tx): DueDays => ({ ...DUE_DEFAULT, ...getSetting<Partial<DueDays>>(tx as DB, "bst.dueDays", {}) });

/** เพิ่มเดือนแบบปฏิทิน (31 ม.ค. + 1 เดือน = 28/29 ก.พ.) */
export function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}

type Tx = Pick<DB, "select" | "insert" | "update" | "delete">;

function context(tx: Tx, enrollmentId: number) {
  const e = tx.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollmentId)).get();
  if (!e) throw new RuleError("ไม่พบการลงทะเบียน");
  const course = tx.select().from(schema.courses).where(eq(schema.courses.id, e.courseId)).get()!;
  const cohort = tx.select().from(schema.cohorts).where(eq(schema.cohorts.id, e.cohortId)).get()!;
  return { e, course, cohort };
}

/** เมื่อยืนยันรับเข้า: สร้างงาน บสต. ลงทะเบียน/คัดกรอง/บำบัด (ทำซ้ำได้ ไม่สร้างซ้ำ) — รท.101 ไม่สร้างตอนรับเข้า */
export function ensureIntakeTasks(tx: Tx, enrollmentId: number, userId: number | null) {
  const { e, course, cohort } = context(tx, enrollmentId);
  if (!course.requiresBst) return;
  const due = dueDays(tx);
  const steps: Array<[string, string]> = [
    ["register", addDays(e.enrolledDate, due.register)],
    ["screen", addDays(e.enrolledDate, due.screen)],
    ["treat", addDays(cohort.endDate, due.treat)],
  ];
  for (const [step, dueDate] of steps) {
    tx.insert(schema.bstTasks).values({ enrollmentId, system: "bst", step, dueDate, createdBy: userId, updatedBy: userId }).onConflictDoNothing().run();
  }
}

/** กำหนดการติดตาม (นับจากวันจำหน่าย) + งาน บสต. ติดตาม — ไม่สร้างซ้ำ / ปรับวันของรายการที่ยังรออยู่ */
function scheduleFollowups(tx: Tx, enrollmentId: number, dischargeDate: string, requiresBst: boolean, userId: number | null) {
  const months = getSetting(tx as DB, "followup.months", [1, 3, 6, 12]);
  const due = dueDays(tx);
  months.forEach((m, i) => {
    const dueDate = addMonths(dischargeDate, m);
    const seq = i + 1;
    const f = tx.select().from(schema.followups).where(and(eq(schema.followups.enrollmentId, enrollmentId), eq(schema.followups.seq, seq))).get();
    if (!f) tx.insert(schema.followups).values({ enrollmentId, seq, monthOffset: m, dueDate, createdBy: userId, updatedBy: userId }).run();
    else if (f.status === "pending" && f.dueDate !== dueDate) tx.update(schema.followups).set({ dueDate, updatedBy: userId, updatedAt: new Date() }).where(eq(schema.followups.id, f.id)).run();
    if (!requiresBst) return;
    const step = `followup${seq}`;
    const taskDue = addDays(dueDate, due.followup);
    const t = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, enrollmentId), eq(schema.bstTasks.system, "bst"), eq(schema.bstTasks.step, step))).get();
    if (!t) tx.insert(schema.bstTasks).values({ enrollmentId, system: "bst", step, dueDate: taskDue, createdBy: userId, updatedBy: userId }).run();
    else if (t.status === "pending" && t.dueDate !== taskDue) tx.update(schema.bstTasks).set({ dueDate: taskDue }).where(eq(schema.bstTasks.id, t.id)).run();
  });
}

/**
 * งานที่เกิดเมื่อ "ครบหลักสูตร" (สเปก 14): บสต. จำหน่าย (นับจากวันจบ) + ติดตาม 1/3/6/12 (นับจากวันจำหน่าย)
 * และ รท.101 = 1 งาน (ทุกหลักสูตรที่ตั้ง "ต้องลง รท.101")
 */
export function ensureCompletionTasks(tx: Tx, enrollmentId: number, completedDate: string, userId: number | null) {
  const { course } = context(tx, enrollmentId);
  const due = dueDays(tx);
  if (course.requiresBst) {
    tx.insert(schema.bstTasks).values({ enrollmentId, system: "bst", step: "discharge", dueDate: addDays(completedDate, due.discharge), createdBy: userId, updatedBy: userId }).onConflictDoNothing().run();
  }
  // ก่อนลงจำหน่ายจริง ใช้วันจบหลักสูตรเป็นวันจำหน่ายโดยประมาณ — กด "ลงแล้ว" ที่ขั้นจำหน่ายแล้วระบบนับใหม่จากวันจำหน่ายจริง
  if (course.requiresFollowup) scheduleFollowups(tx, enrollmentId, completedDate, course.requiresBst, userId);
  if (course.requiresRt101) {
    tx.insert(schema.bstTasks).values({ enrollmentId, system: "rt101", step: "record", dueDate: addDays(completedDate, due.rt101), createdBy: userId, updatedBy: userId }).onConflictDoNothing().run();
  }
}

/** บันทึก "ครบหลักสูตร" / "ไม่ผ่าน" ทีละหลายคน — ครบหลักสูตรแล้วสร้างงานจำหน่าย/ติดตาม/รท.101 */
export function completeEnrollments(db: DB, enrollmentIds: number[], status: "completed" | "failed", date: string, actor: { userId: number; ip?: string | null }) {
  return db.transaction((tx) => {
    const done: number[] = [];
    const skipped: Array<{ id: number; reason: string }> = [];
    for (const id of enrollmentIds) {
      const { e } = context(tx, id);
      if (e.status !== "active") {
        skipped.push({ id, reason: e.status === "draft" ? "ยังเป็นร่าง (ยังไม่ยืนยันรับเข้า)" : "ไม่ได้อยู่ระหว่างอบรม" });
        continue;
      }
      tx.update(schema.enrollments).set({ status, leftDate: date, leftReason: null, updatedBy: actor.userId, updatedAt: new Date(), version: e.version + 1 }).where(eq(schema.enrollments.id, id)).run();
      writeAudit(tx, { userId: actor.userId, action: "update", entity: "enrollment", entityId: id, before: { status: e.status }, after: { status, leftDate: date }, ip: actor.ip });
      if (status === "completed") ensureCompletionTasks(tx, id, date, actor.userId);
      done.push(id);
    }
    return { done, skipped };
  });
}
export function markTask(db: DB, taskId: number, doneDate: string | null, actor: { userId: number; ip?: string | null }) {
  db.transaction((tx) => {
    const t = tx.select().from(schema.bstTasks).where(eq(schema.bstTasks.id, taskId)).get();
    if (!t) throw new RuleError("ไม่พบงาน");
    if (doneDate && !["pending", "done"].includes(t.status)) throw new RuleError("งานนี้ไม่ต้องลงแล้ว (ติดตามไม่ได้/ปิดการติดตาม)");
    tx.update(schema.bstTasks)
      .set({ status: doneDate ? "done" : "pending", doneDate, doneBy: doneDate ? actor.userId : null, updatedBy: actor.userId, updatedAt: new Date(), version: t.version + 1 })
      .where(eq(schema.bstTasks.id, taskId))
      .run();
    writeAudit(tx, { userId: actor.userId, action: "update", entity: "bst_task", entityId: taskId, before: { status: t.status }, after: { status: doneDate ? "done" : "pending", doneDate }, ip: actor.ip });
    // ลงจำหน่ายใน บสต. แล้ว → นับกำหนดติดตามใหม่จากวันจำหน่ายจริง (ยกเลิก → กลับไปใช้วันจบหลักสูตร)
    if (t.system === "bst" && t.step === "discharge") {
      const { e, course } = context(tx, t.enrollmentId);
      const base = doneDate ?? e.leftDate;
      if (e.status === "completed" && course.requiresFollowup && base) scheduleFollowups(tx, e.id, base, course.requiresBst, actor.userId);
    }
  });
}
export type FollowupInput = { doneDate: string; method: string; urineResult?: string | null; relapse: "yes" | "no" | "unknown"; occupation?: string | null; note?: string | null; bstRecorded: boolean };

export function recordFollowup(db: DB, followupId: number, input: FollowupInput, actor: { userId: number; ip?: string | null }) {
  return db.transaction((tx) => {
    const f = tx.select().from(schema.followups).where(eq(schema.followups.id, followupId)).get();
    if (!f) throw new RuleError("ไม่พบกำหนดการติดตาม");
    if (f.status === "unfollowable" || f.status === "closed") throw new RuleError("รายการนี้ปิดการติดตามแล้ว");
    tx.update(schema.followups)
      .set({ ...input, status: "done", updatedBy: actor.userId, updatedAt: new Date(), version: f.version + 1 })
      .where(eq(schema.followups.id, followupId))
      .run();
    if (input.bstRecorded) {
      tx.update(schema.bstTasks)
        .set({ status: "done", doneDate: input.doneDate, doneBy: actor.userId, updatedBy: actor.userId, updatedAt: new Date() })
        .where(and(eq(schema.bstTasks.enrollmentId, f.enrollmentId), eq(schema.bstTasks.system, "bst"), eq(schema.bstTasks.step, `followup${f.seq}`), eq(schema.bstTasks.status, "pending")))
        .run();
    }
    writeAudit(tx, { userId: actor.userId, action: "update", entity: "followup", entityId: followupId, before: { status: f.status }, after: input, ip: actor.ip });
  });
}

// ───────── ผลของการออกจากเรือนจำต่องาน บสต./ติดตาม (สเปก 8) ─────────

export type FollowupEffects = {
  tasks: Array<{ id: number; status: string; reason: string | null; dueDate?: string | null }>;
  followups: Array<{ id: number; status: string; reason: string | null }>;
  createdTasks: number[];
};

/**
 * ออกจากเรือนจำ (สเปก 8, 14.3): ปรับงาน บสต. อัตโนมัติ
 * - ออกระหว่างอบรม: งาน บสต. ที่เหลือ = ติดตามไม่ได้ + สร้างงาน "จำหน่าย"
 * - จบหลักสูตรแล้ว: ดึงงานจำหน่ายให้เร็วขึ้น + ติดตามที่เหลือ ปิด/ติดตามต่อ ตามตั้งค่า
 * - งาน รท.101 ของผู้ที่จบหลักสูตรแล้ว **ยังคงอยู่** (ยังต้องลงว่าผ่านการฟื้นฟู)
 */
export function applyReleaseToFollowup(tx: Tx, incarcerationId: number, reasonCode: string, releasedDate: string, actorId: number) {
  const fx: FollowupEffects = { tasks: [], followups: [], createdTasks: [] };
  const actions: string[] = [];
  const label = lookupLabel(tx as DB, "release_reason", reasonCode);
  const policy = getSetting<Record<string, string>>(tx as DB, "release.followupPolicy", {});
  const dischargeDue = addDays(releasedDate, dueDays(tx).discharge);
  const enrs = tx.select().from(schema.enrollments).where(eq(schema.enrollments.incarcerationId, incarcerationId)).all();
  for (const e of enrs) {
    const course = tx.select().from(schema.courses).where(eq(schema.courses.id, e.courseId)).get()!;
    const pendingBst = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, e.id), eq(schema.bstTasks.system, "bst"), eq(schema.bstTasks.status, "pending"))).all();
    const pendingFollow = tx.select().from(schema.followups).where(and(eq(schema.followups.enrollmentId, e.id), eq(schema.followups.status, "pending"))).all();
    const wasOngoing = e.status === "dropped" && e.releaseEventId != null && e.leftDate === releasedDate; // เพิ่งถูกตัดเป็นออกก่อนกำหนดจากการออกครั้งนี้
    const completed = e.status === "completed";
    if (!wasOngoing && !completed) continue;
    if (completed && course.requiresRt101) {
      const rt = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, e.id), eq(schema.bstTasks.system, "rt101"), eq(schema.bstTasks.status, "pending"))).get();
      if (rt) actions.push(`${course.shortName}: งาน รท.101 ยังคงอยู่ (จบหลักสูตรแล้ว ต้องลงว่าผ่านการฟื้นฟู)`);
    }
    if (!course.requiresBst && !pendingFollow.length) continue;

    // งาน บสต. "จำหน่าย"
    if (course.requiresBst) {
      const existing = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, e.id), eq(schema.bstTasks.system, "bst"), eq(schema.bstTasks.step, "discharge"))).get();
      if (existing) {
        if (existing.status === "pending" && existing.dueDate && existing.dueDate > dischargeDue) {
          fx.tasks.push({ id: existing.id, status: existing.status, reason: existing.reason, dueDate: existing.dueDate });
          tx.update(schema.bstTasks).set({ dueDate: dischargeDue, reason: `ออกจากเรือนจำ – ${label}` }).where(eq(schema.bstTasks.id, existing.id)).run();
        }
      } else {
        const row = tx.insert(schema.bstTasks).values({ enrollmentId: e.id, system: "bst", step: "discharge", dueDate: dischargeDue, reason: `ออกจากเรือนจำ – ${label}`, createdBy: actorId }).returning().get();
        fx.createdTasks.push(row.id);
        actions.push(`สร้างงาน บสต. "จำหน่าย" (${course.shortName})`);
      }
    }

    const close = wasOngoing ? "unfollowable" : policy[reasonCode] === "continue" ? null : "closed";
    if (!close) {
      actions.push(`${course.shortName}: ติดตามต่อตามตั้งค่า`);
      continue;
    }
    const why = close === "unfollowable" ? `ติดตามไม่ได้ – ${label}` : `ปิดการติดตาม – ${label}`;
    for (const t of pendingBst.filter((t) => t.step !== "discharge")) {
      fx.tasks.push({ id: t.id, status: t.status, reason: t.reason });
      tx.update(schema.bstTasks).set({ status: close, reason: why, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.bstTasks.id, t.id)).run();
    }
    for (const f of pendingFollow) {
      fx.followups.push({ id: f.id, status: f.status, reason: f.reason });
      tx.update(schema.followups).set({ status: close, reason: why, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.followups.id, f.id)).run();
    }
    if (pendingBst.some((t) => t.step !== "discharge") || pendingFollow.length) actions.push(`${course.shortName}: งาน บสต./ติดตามที่เหลือเปลี่ยนเป็น "${why}"`);
  }
  return { effects: fx, actions };
}
export function revertFollowupEffects(tx: Tx, fx: FollowupEffects | undefined) {
  if (!fx) return;
  for (const t of fx.tasks) tx.update(schema.bstTasks).set({ status: t.status, reason: t.reason, ...(t.dueDate !== undefined ? { dueDate: t.dueDate } : {}) }).where(eq(schema.bstTasks.id, t.id)).run();
  for (const f of fx.followups) tx.update(schema.followups).set({ status: f.status, reason: f.reason }).where(eq(schema.followups.id, f.id)).run();
  if (fx.createdTasks.length) tx.delete(schema.bstTasks).where(and(inArray(schema.bstTasks.id, fx.createdTasks), ne(schema.bstTasks.status, "done"))).run();
}

/** ตัวชี้วัด "ไม่กลับไปเสพซ้ำใน 1 ปี" จากผลติดตามที่ทำได้ */
export function relapseIndicator(rows: Array<{ relapse: string | null; status: string }>) {
  const known = rows.filter((r) => r.status === "done" && (r.relapse === "yes" || r.relapse === "no"));
  const people = known.length;
  const noRelapse = known.filter((r) => r.relapse === "no").length;
  return { people, noRelapse, pct: people ? Math.round((noRelapse / people) * 1000) / 10 : null };
}

