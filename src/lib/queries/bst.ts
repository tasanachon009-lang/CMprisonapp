import { and, asc, eq, inArray, lte, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { addDays } from "../thai-date";
import { cohortLabel } from "../services/cohorts";
import { relapseIndicator } from "../services/followup";

export type BstFilter = "today" | "week" | "overdue" | "all";

/** งาน บสต./รท.101 ที่ยังไม่ลง ตามช่วง */
export function pendingTasks(db: DB, filter: BstFilter, today: string, system?: string) {
  const conds = [eq(schema.bstTasks.status, "pending")];
  if (system) conds.push(eq(schema.bstTasks.system, system));
  if (filter === "today") conds.push(eq(schema.bstTasks.dueDate, today));
  if (filter === "week") conds.push(lte(schema.bstTasks.dueDate, addDays(today, 7)), sql`${schema.bstTasks.dueDate} >= ${today}`);
  if (filter === "overdue") conds.push(sql`${schema.bstTasks.dueDate} < ${today}`);
  return db
    .select({ t: schema.bstTasks, e: schema.enrollments, inc: schema.incarcerations, p: schema.persons, c: schema.cohorts, course: schema.courses })
    .from(schema.bstTasks)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.bstTasks.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(...conds))
    .orderBy(asc(schema.bstTasks.dueDate))
    .limit(500)
    .all()
    .map((x) => ({ ...x, label: `${x.course.shortName} ${cohortLabel(x.c)}` }));
}

export function taskCounts(db: DB, today: string) {
  const row = db
    .select({
      today: sql<number>`sum(case when ${schema.bstTasks.dueDate} = ${today} then 1 else 0 end)`,
      week: sql<number>`sum(case when ${schema.bstTasks.dueDate} >= ${today} and ${schema.bstTasks.dueDate} <= ${addDays(today, 7)} then 1 else 0 end)`,
      overdue: sql<number>`sum(case when ${schema.bstTasks.dueDate} < ${today} then 1 else 0 end)`,
    })
    .from(schema.bstTasks)
    .where(eq(schema.bstTasks.status, "pending"))
    .get();
  return { today: row?.today ?? 0, week: row?.week ?? 0, overdue: row?.overdue ?? 0 };
}

export function dueFollowups(db: DB, today: string) {
  return db
    .select({ f: schema.followups, e: schema.enrollments, inc: schema.incarcerations, p: schema.persons, c: schema.cohorts, course: schema.courses })
    .from(schema.followups)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.followups.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(eq(schema.followups.status, "pending"), lte(schema.followups.dueDate, addDays(today, 14))))
    .orderBy(asc(schema.followups.dueDate))
    .all();
}

/** % ครบถ้วนรายรุ่น (งานที่ถึงกำหนดแล้ว) + ตัวชี้วัดไม่เสพซ้ำ */
export function bstSummaryByCohort(db: DB, fiscalYear: number, today: string) {
  const cohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohorts.fiscalYear, fiscalYear), sql`(${schema.courses.requiresBst} = 1 or ${schema.courses.requiresRt101} = 1)`)).orderBy(asc(schema.cohorts.startDate)).all();
  return cohorts.map(({ c, course }) => {
    const enrIds = db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, c.id)).all().map((r) => r.id);
    if (!enrIds.length) return { c, course, label: `${course.shortName} ${cohortLabel(c)}`, due: 0, done: 0, pct: null as number | null, excluded: 0, relapse: relapseIndicator([]) };
    const tasks = db.select().from(schema.bstTasks).where(inArray(schema.bstTasks.enrollmentId, enrIds)).all();
    const dueTasks = tasks.filter((t) => (t.status === "done" || t.status === "pending") && (t.dueDate ?? "") <= today);
    const done = dueTasks.filter((t) => t.status === "done").length;
    const fus = db.select().from(schema.followups).where(inArray(schema.followups.enrollmentId, enrIds)).all();
    // ตัวชี้วัด: ผลติดตามล่าสุดที่ทราบต่อคน
    const latest = new Map<number, (typeof fus)[number]>();
    for (const f of fus.filter((x) => x.status === "done" && x.relapse !== "unknown")) {
      const prev = latest.get(f.enrollmentId);
      if (!prev || f.seq > prev.seq) latest.set(f.enrollmentId, f);
    }
    return {
      c, course, label: `${course.shortName} ${cohortLabel(c)}`,
      due: dueTasks.length, done, pct: dueTasks.length ? Math.round((done / dueTasks.length) * 1000) / 10 : null,
      excluded: tasks.filter((t) => t.status === "unfollowable" || t.status === "closed").length,
      relapse: relapseIndicator([...latest.values()]),
    };
  });
}
