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
  register: "ลงทะเบียน", screen: "คัดกรอง", treat: "บำบัด",
  followup1: "ติดตามครั้งที่ 1", followup2: "ติดตามครั้งที่ 2", followup3: "ติดตามครั้งที่ 3", followup4: "ติดตามครั้งที่ 4",
  discharge: "จบกระบวนการ (จำหน่าย)",
};
export const TASK_STATUS_LABEL: Record<string, string> = {
  pending: "ยังไม่ลง", done: "ลงแล้ว", unfollowable: "ติดตามไม่ได้", closed: "ปิดการติดตาม", cancelled: "ยกเลิก",
};

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

function systems(course: typeof schema.courses.$inferSelect) {
  return [...(course.requiresBst ? ["bst"] : []), ...(course.requiresRt101 ? ["rt101"] : [])];
}

/** เมื่อยืนยันรับเข้า: สร้างงาน ลงทะเบียน/คัดกรอง/บำบัด (ทำซ้ำได้ ไม่สร้างซ้ำ) */
export function ensureIntakeTasks(tx: Tx, enrollmentId: number, userId: number | null) {
  const { e, course, cohort } = context(tx, enrollmentId);
  const due = getSetting(tx as DB, "bst.dueDays", { register: 7, screen: 7, treat: 7, followup: 7, discharge: 7 });
  for (const system of systems(course)) {
    const steps: Array<[string, string]> = [
      ["register", addDays(e.enrolledDate, due.register)],
      ["screen", addDays(e.enrolledDate, due.screen)],
      ["treat", addDays(cohort.endDate, due.treat)],
    ];
    for (const [step, dueDate] of steps) {
      tx.insert(schema.bstTasks).values({ enrollmentId, system, step, dueDate, createdBy: userId, updatedBy: userId }).onConflictDoNothing().run();
    }
  }
}

/**
 * บันทึก "ครบหลักสูตร" / "ไม่ผ่าน" ทีละหลายคน
 * ครบหลักสูตร + หลักสูตรต้องติดตาม → สร้างกำหนดการติดตามเดือนที่ 1 3 6 12 + งาน บสต. ติดตาม/จำหน่าย
 */
export function completeEnrollments(db: DB, enrollmentIds: number[], status: "completed" | "failed", date: string, actor: { userId: number; ip?: string | null }) {
  return db.transaction((tx) => {
    const done: number[] = [];
    const skipped: Array<{ id: number; reason: string }> = [];
    const months = getSetting(tx as unknown as DB, "followup.months", [1, 3, 6, 12]);
    const due = getSetting(tx as unknown as DB, "bst.dueDays", { register: 7, screen: 7, treat: 7, followup: 7, discharge: 7 });
    for (const id of enrollmentIds) {
      const { e, course } = context(tx, id);
      if (e.status !== "active") {
        skipped.push({ id, reason: e.status === "draft" ? "ยังเป็นร่าง (ยังไม่ยืนยันรับเข้า)" : "ไม่ได้อยู่ระหว่างอบรม" });
        continue;
      }
      tx.update(schema.enrollments).set({ status, leftDate: date, leftReason: null, updatedBy: actor.userId, updatedAt: new Date(), version: e.version + 1 }).where(eq(schema.enrollments.id, id)).run();
      writeAudit(tx, { userId: actor.userId, action: "update", entity: "enrollment", entityId: id, before: { status: e.status }, after: { status, leftDate: date }, ip: actor.ip });
      if (status === "completed" && course.requiresFollowup) {
        months.forEach((m, i) => {
          const dueDate = addMonths(date, m);
          tx.insert(schema.followups).values({ enrollmentId: id, seq: i + 1, monthOffset: m, dueDate, createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoNothing().run();
          for (const system of systems(course)) {
            tx.insert(schema.bstTasks).values({ enrollmentId: id, system, step: `followup${i + 1}`, dueDate: addDays(dueDate, due.followup), createdBy: actor.userId }).onConflictDoNothing().run();
          }
        });
        const last = addMonths(date, months[months.length - 1] ?? 12);
        for (const system of systems(course)) {
          tx.insert(schema.bstTasks).values({ enrollmentId: id, system, step: "discharge", dueDate: addDays(last, due.discharge), createdBy: actor.userId }).onConflictDoNothing().run();
        }
      }
      done.push(id);
    }
    return { done, skipped };
  });
}

export function markTask(db: DB, taskId: number, doneDate: string | null, actor: { userId: number; ip?: string | null }) {
  const t = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.id, taskId)).get();
  if (!t) throw new RuleError("ไม่พบงาน");
  if (doneDate && !["pending", "done"].includes(t.status)) throw new RuleError("งานนี้ไม่ต้องลงแล้ว (ติดตามไม่ได้/ปิดการติดตาม)");
  db.update(schema.bstTasks)
    .set({ status: doneDate ? "done" : "pending", doneDate, doneBy: doneDate ? actor.userId : null, updatedBy: actor.userId, updatedAt: new Date(), version: t.version + 1 })
    .where(eq(schema.bstTasks.id, taskId))
    .run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "bst_task", entityId: taskId, before: { status: t.status }, after: { status: doneDate ? "done" : "pending", doneDate }, ip: actor.ip });
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
        .where(and(eq(schema.bstTasks.enrollmentId, f.enrollmentId), eq(schema.bstTasks.step, `followup${f.seq}`), eq(schema.bstTasks.status, "pending")))
        .run();
    }
    writeAudit(tx, { userId: actor.userId, action: "update", entity: "followup", entityId: followupId, before: { status: f.status }, after: input, ip: actor.ip });
  });
}

// ───────── ผลของการออกจากเรือนจำต่องาน บสต./ติดตาม (สเปก 8) ─────────

export type FollowupEffects = {
  tasks: Array<{ id: number; status: string; reason: string | null }>;
  followups: Array<{ id: number; status: string; reason: string | null }>;
  createdTasks: number[];
};

export function applyReleaseToFollowup(tx: Tx, incarcerationId: number, reasonCode: string, releasedDate: string, actorId: number) {
  const fx: FollowupEffects = { tasks: [], followups: [], createdTasks: [] };
  const actions: string[] = [];
  const label = lookupLabel(tx as DB, "release_reason", reasonCode);
  const policy = getSetting<Record<string, string>>(tx as DB, "release.followupPolicy", {});
  const enrs = tx.select().from(schema.enrollments).where(eq(schema.enrollments.incarcerationId, incarcerationId)).all();
  for (const e of enrs) {
    const course = tx.select().from(schema.courses).where(eq(schema.courses.id, e.courseId)).get()!;
    const pendingTasks = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, e.id), eq(schema.bstTasks.status, "pending"))).all();
    const pendingFollow = tx.select().from(schema.followups).where(and(eq(schema.followups.enrollmentId, e.id), eq(schema.followups.status, "pending"))).all();
    const wasOngoing = e.status === "dropped" && e.releaseEventId != null && e.leftDate === releasedDate; // เพิ่งถูกตัดเป็นออกก่อนกำหนดจากการออกครั้งนี้
    const completed = e.status === "completed";
    if (!wasOngoing && !completed) continue;
    if (!course.requiresBst && !course.requiresRt101 && !pendingFollow.length) continue;

    // งาน "บันทึกจำหน่าย"
    for (const system of systems(course)) {
      const existing = tx.select().from(schema.bstTasks).where(and(eq(schema.bstTasks.enrollmentId, e.id), eq(schema.bstTasks.system, system), eq(schema.bstTasks.step, "discharge"))).get();
      if (existing) {
        if (existing.dueDate && existing.dueDate > addDays(releasedDate, 7)) {
          fx.tasks.push({ id: existing.id, status: existing.status, reason: existing.reason });
          tx.update(schema.bstTasks).set({ dueDate: addDays(releasedDate, 7), reason: `ออกจากเรือนจำ – ${label}` }).where(eq(schema.bstTasks.id, existing.id)).run();
        }
      } else {
        const row = tx.insert(schema.bstTasks).values({ enrollmentId: e.id, system, step: "discharge", dueDate: addDays(releasedDate, 7), reason: `ออกจากเรือนจำ – ${label}`, createdBy: actorId }).returning().get();
        fx.createdTasks.push(row.id);
      }
    }
    if (course.requiresBst || course.requiresRt101) actions.push(`สร้างงาน "บันทึกจำหน่าย" ใน บสต./รท.101 (${course.shortName})`);

    const close = wasOngoing ? "unfollowable" : policy[reasonCode] === "continue" ? null : "closed";
    if (!close) {
      actions.push(`${course.shortName}: ติดตามต่อตามตั้งค่า`);
      continue;
    }
    const why = close === "unfollowable" ? `ติดตามไม่ได้ – ${label}` : `ปิดการติดตาม – ${label}`;
    for (const t of pendingTasks.filter((t) => t.step !== "discharge")) {
      fx.tasks.push({ id: t.id, status: t.status, reason: t.reason });
      tx.update(schema.bstTasks).set({ status: close, reason: why, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.bstTasks.id, t.id)).run();
    }
    for (const f of pendingFollow) {
      fx.followups.push({ id: f.id, status: f.status, reason: f.reason });
      tx.update(schema.followups).set({ status: close, reason: why, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.followups.id, f.id)).run();
    }
    if (pendingTasks.length || pendingFollow.length) actions.push(`${course.shortName}: งานติดตามที่เหลือเปลี่ยนเป็น "${why}"`);
  }
  return { effects: fx, actions };
}

export function revertFollowupEffects(tx: Tx, fx: FollowupEffects | undefined) {
  if (!fx) return;
  for (const t of fx.tasks) tx.update(schema.bstTasks).set({ status: t.status, reason: t.reason }).where(eq(schema.bstTasks.id, t.id)).run();
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

