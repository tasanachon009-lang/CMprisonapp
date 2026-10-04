import { and, asc, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { addDays } from "../thai-date";
import { cohortLabel } from "../services/cohorts";
import { relapseIndicator } from "../services/followup";

/**
 * งาน บสต. และ รท.101 — แยกรายการค้าง/รายงาน/ตัวชี้วัด (สเปก 14)
 * cohortIds = จำกัดเฉพาะรุ่น (ผู้ได้รับมอบหมายรายรุ่น) · ไม่ส่ง = ทั้งหมด
 */
export type BstFilter = "today" | "week" | "overdue" | "all";
export type TaskSystem = "bst" | "rt101";

const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

export function pendingTasks(db: DB, system: TaskSystem, filter: BstFilter, today: string, cohortIds?: number[]) {
  const conds = [eq(schema.bstTasks.status, "pending"), eq(schema.bstTasks.system, system), isNull(schema.enrollments.deletedAt)];
  if (filter === "today") conds.push(eq(schema.bstTasks.dueDate, today));
  if (filter === "week") conds.push(lte(schema.bstTasks.dueDate, addDays(today, 7)), sql`${schema.bstTasks.dueDate} >= ${today}`);
  if (filter === "overdue") conds.push(sql`${schema.bstTasks.dueDate} < ${today}`);
  if (cohortIds) conds.push(inArray(schema.enrollments.cohortId, cohortIds.length ? cohortIds : [-1]));
  return db
    .select({ t: schema.bstTasks, e: schema.enrollments, inc: schema.incarcerations, p: schema.persons, c: schema.cohorts, course: schema.courses })
    .from(schema.bstTasks)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.bstTasks.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(...conds))
    .orderBy(asc(schema.bstTasks.dueDate), asc(schema.persons.firstName))
    .limit(1000)
    .all()
    .map((x) => ({ ...x, label: `${x.course.shortName} ${cohortLabel(x.c)}` }));
}

export function taskCounts(db: DB, system: TaskSystem, today: string) {
  const row = db
    .select({
      total: sql<number>`count(*)`,
      today: sql<number>`sum(case when ${schema.bstTasks.dueDate} = ${today} then 1 else 0 end)`,
      week: sql<number>`sum(case when ${schema.bstTasks.dueDate} >= ${today} and ${schema.bstTasks.dueDate} <= ${addDays(today, 7)} then 1 else 0 end)`,
      overdue: sql<number>`sum(case when ${schema.bstTasks.dueDate} < ${today} then 1 else 0 end)`,
    })
    .from(schema.bstTasks)
    .where(and(eq(schema.bstTasks.status, "pending"), eq(schema.bstTasks.system, system)))
    .get();
  return { total: row?.total ?? 0, today: row?.today ?? 0, week: row?.week ?? 0, overdue: row?.overdue ?? 0 };
}

export function dueFollowups(db: DB, today: string, cohortIds?: number[]) {
  return db
    .select({ f: schema.followups, e: schema.enrollments, inc: schema.incarcerations, p: schema.persons, c: schema.cohorts, course: schema.courses })
    .from(schema.followups)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.followups.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(eq(schema.followups.status, "pending"), lte(schema.followups.dueDate, addDays(today, 14)), cohortIds ? inArray(schema.enrollments.cohortId, cohortIds.length ? cohortIds : [-1]) : undefined))
    .orderBy(asc(schema.followups.dueDate))
    .all();
}

type Task = typeof schema.bstTasks.$inferSelect;
type Followup = typeof schema.followups.$inferSelect;

/**
 * ตัวชี้วัด บสต. ของกลุ่มผู้ลงทะเบียน (สเปก 14.1)
 * - % ลงทะเบียน บสต. ครบ = งาน "ลงทะเบียน" ที่ถึงกำหนดแล้วและลงแล้ว / ที่ถึงกำหนด (ไม่นับติดตามไม่ได้/ปิด/ยกเลิก)
 * - % ติดตามครบ 4 ครั้ง = คนที่ครบกำหนดติดตามครั้งสุดท้ายแล้ว และติดตามครบทุกครั้ง / คนที่ครบกำหนดครั้งสุดท้ายแล้ว (ไม่นับคนที่ติดตามไม่ได้/ปิดการติดตาม)
 * - % ไม่กลับไปเสพซ้ำ (ผลติดตามล่าสุดที่ทราบต่อคน)
 */
export function bstIndicators(tasks: Task[], fus: Followup[], today: string) {
  const reg = tasks.filter((t) => t.system === "bst" && t.step === "register" && (t.status === "done" || t.status === "pending") && (t.dueDate ?? "") <= today);
  const regDone = reg.filter((t) => t.status === "done").length;
  const byEnr = new Map<number, Followup[]>();
  for (const f of fus) byEnr.set(f.enrollmentId, [...(byEnr.get(f.enrollmentId) ?? []), f]);
  let fuEligible = 0, fuComplete = 0, fuExcluded = 0;
  for (const list of byEnr.values()) {
    if (list.some((f) => f.status === "closed" || f.status === "unfollowable")) { fuExcluded++; continue; }
    const last = list.reduce((a, b) => (a.seq > b.seq ? a : b));
    if (last.dueDate > today) continue;
    fuEligible++;
    if (list.every((f) => f.status === "done")) fuComplete++;
  }
  const latest = new Map<number, Followup>();
  for (const f of fus.filter((x) => x.status === "done" && x.relapse !== "unknown")) {
    const prev = latest.get(f.enrollmentId);
    if (!prev || f.seq > prev.seq) latest.set(f.enrollmentId, f);
  }
  const due = tasks.filter((t) => t.system === "bst" && (t.status === "done" || t.status === "pending") && (t.dueDate ?? "") <= today);
  const excludedReasons = new Map<string, number>();
  for (const t of tasks.filter((t) => t.system === "bst" && (t.status === "unfollowable" || t.status === "closed"))) {
    const k = t.reason ?? "ไม่ระบุ";
    excludedReasons.set(k, (excludedReasons.get(k) ?? 0) + 1);
  }
  return {
    register: { done: regDone, due: reg.length, pct: pct(regDone, reg.length) },
    followup4: { complete: fuComplete, eligible: fuEligible, excluded: fuExcluded, pct: pct(fuComplete, fuEligible) },
    allSteps: { done: due.filter((t) => t.status === "done").length, due: due.length, pending: due.filter((t) => t.status === "pending").length, pct: pct(due.filter((t) => t.status === "done").length, due.length) },
    relapse: relapseIndicator([...latest.values()]),
    excludedReasons: [...excludedReasons.entries()].map(([reason, n]) => ({ reason, n })),
  };
}

/** ตัวชี้วัด รท.101: ผู้ครบหลักสูตร vs ลง รท.101 แล้ว (สเปก 14.2) */
export function rt101Indicators(tasks: Task[]) {
  const rt = tasks.filter((t) => t.system === "rt101" && t.step === "record" && t.status !== "cancelled");
  const done = rt.filter((t) => t.status === "done").length;
  return { completed: rt.length, done, pending: rt.length - done, pct: pct(done, rt.length) };
}

function cohortsOfYear(db: DB, fiscalYear: number, system: TaskSystem) {
  const flag = system === "bst" ? schema.courses.requiresBst : schema.courses.requiresRt101;
  return db
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohorts.fiscalYear, fiscalYear), eq(flag, true), isNull(schema.cohorts.deletedAt)))
    .orderBy(asc(schema.courses.sortOrder), asc(schema.cohorts.startDate))
    .all();
}

function dataOf(db: DB, cohortIds: number[]) {
  if (!cohortIds.length) return { enr: [], tasks: [] as Task[], fus: [] as Followup[] };
  const enr = db.select({ id: schema.enrollments.id, cohortId: schema.enrollments.cohortId }).from(schema.enrollments).where(and(inArray(schema.enrollments.cohortId, cohortIds), isNull(schema.enrollments.deletedAt))).all();
  const ids = enr.map((e) => e.id);
  if (!ids.length) return { enr, tasks: [] as Task[], fus: [] as Followup[] };
  return {
    enr,
    tasks: db.select().from(schema.bstTasks).where(inArray(schema.bstTasks.enrollmentId, ids)).all(),
    fus: db.select().from(schema.followups).where(inArray(schema.followups.enrollmentId, ids)).all(),
  };
}

/** รายงานรายรุ่น + รวมรายหลักสูตร + รวมทั้งปีงบ */
export function systemReport(db: DB, system: TaskSystem, fiscalYear: number, today: string) {
  const cohorts = cohortsOfYear(db, fiscalYear, system);
  const { enr, tasks, fus } = dataOf(db, cohorts.map((x) => x.c.id));
  const cohortOfEnr = new Map(enr.map((e) => [e.id, e.cohortId]));
  const tasksOf = (ids: number[]) => tasks.filter((t) => ids.includes(cohortOfEnr.get(t.enrollmentId) ?? -1));
  const fusOf = (ids: number[]) => fus.filter((f) => ids.includes(cohortOfEnr.get(f.enrollmentId) ?? -1));
  const calc = (ids: number[]) => (system === "bst" ? { bst: bstIndicators(tasksOf(ids), fusOf(ids), today), rt101: null } : { bst: null, rt101: rt101Indicators(tasksOf(ids)) });
  const rows = cohorts.map(({ c, course }) => ({ c, course, label: `${course.shortName} ${cohortLabel(c)}`, ...calc([c.id]) }));
  const courses = Array.from(new Map(cohorts.map((x) => [x.course.id, x.course])).values()).map((course) => ({
    course, ...calc(cohorts.filter((x) => x.course.id === course.id).map((x) => x.c.id)),
  }));
  return { rows, courses, total: calc(cohorts.map((x) => x.c.id)) };
}

/** ตัวชี้วัดสรุปสำหรับผู้บริหาร/หน้าแรก (ไม่มีรายชื่อ) */
export function indicatorSummary(db: DB, fiscalYear: number, today: string) {
  return { bst: systemReport(db, "bst", fiscalYear, today).total.bst!, rt101: systemReport(db, "rt101", fiscalYear, today).total.rt101! };
}
