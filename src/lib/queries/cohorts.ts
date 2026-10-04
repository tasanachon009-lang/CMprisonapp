import { and, asc, eq, isNull, sql, desc } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";

export function getCourseByCode(db: DB, code: string) {
  return db.select().from(schema.courses).where(eq(schema.courses.code, code.toUpperCase())).get() ?? null;
}

export function listCourses(db: DB) {
  const courses = db.select().from(schema.courses).where(isNull(schema.courses.deletedAt)).orderBy(asc(schema.courses.sortOrder)).all();
  const stats = db
    .select({
      courseId: schema.cohorts.courseId,
      runningCohorts: sql<number>`count(distinct case when ${schema.cohorts.status} = 'active' then ${schema.cohorts.id} end)`,
      activePeople: sql<number>`count(case when ${schema.enrollments.status} = 'active' then 1 end)`,
    })
    .from(schema.cohorts)
    .leftJoin(schema.enrollments, and(eq(schema.enrollments.cohortId, schema.cohorts.id), isNull(schema.enrollments.deletedAt)))
    .where(isNull(schema.cohorts.deletedAt))
    .groupBy(schema.cohorts.courseId)
    .all();
  const by = new Map(stats.map((s) => [s.courseId, s]));
  return courses.map((c) => ({ ...c, runningCohorts: by.get(c.id)?.runningCohorts ?? 0, activePeople: by.get(c.id)?.activePeople ?? 0 }));
}

export function cohortsOfCourse(db: DB, courseId: number, fiscalYear: number) {
  const rows = db
    .select()
    .from(schema.cohorts)
    .where(and(eq(schema.cohorts.courseId, courseId), eq(schema.cohorts.fiscalYear, fiscalYear), isNull(schema.cohorts.deletedAt)))
    .orderBy(asc(schema.cohorts.number))
    .all();
  return rows.map((c) => ({ ...c, counts: enrollmentCounts(db, c.id) }));
}

export function fiscalYearsOfCourse(db: DB, courseId: number) {
  return db
    .selectDistinct({ fy: schema.cohorts.fiscalYear })
    .from(schema.cohorts)
    .where(and(eq(schema.cohorts.courseId, courseId), isNull(schema.cohorts.deletedAt)))
    .orderBy(desc(schema.cohorts.fiscalYear))
    .all()
    .map((r) => r.fy);
}

export function enrollmentCounts(db: DB, cohortId: number) {
  const rows = db
    .select({ status: schema.enrollments.status, n: sql<number>`count(*)` })
    .from(schema.enrollments)
    .where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.enrollments.deletedAt)))
    .groupBy(schema.enrollments.status)
    .all();
  const by: Record<string, number> = Object.fromEntries(rows.map((r) => [r.status, r.n]));
  const total = rows.reduce((s, r) => s + r.n, 0);
  return { total, draft: by.draft ?? 0, active: by.active ?? 0, completed: by.completed ?? 0, dropped: by.dropped ?? 0, withdrawn: by.withdrawn ?? 0, failed: by.failed ?? 0 };
}

export function getCohort(db: DB, id: number) {
  const row = db
    .select({ cohort: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohorts.id, id), isNull(schema.cohorts.deletedAt)))
    .get();
  return row ?? null;
}

export function cohortSessions(db: DB, cohortId: number) {
  return db
    .select()
    .from(schema.cohortSessions)
    .where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt)))
    .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime))
    .all();
}

/** รายชื่อในรุ่น พร้อมประวัติหลักสูตรอื่น/กลับมาต้องโทษซ้ำ */
export function cohortRoster(db: DB, cohortId: number) {
  const rows = db
    .select({
      enrollment: schema.enrollments,
      inc: schema.incarcerations,
      person: schema.persons,
    })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.enrollments.deletedAt)))
    .orderBy(asc(schema.persons.firstName), asc(schema.persons.lastName))
    .all();
  if (!rows.length) return [];
  const personIds = rows.map((r) => r.person.id);
  // ประวัติทุกหลักสูตรของบุคคลเหล่านี้
  const history = db
    .select({
      personId: schema.incarcerations.personId,
      incarcerationId: schema.incarcerations.id,
      enrollmentId: schema.enrollments.id,
      courseShort: schema.courses.shortName,
      status: schema.enrollments.status,
    })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(sql`${schema.incarcerations.personId} in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})`, isNull(schema.enrollments.deletedAt)))
    .all();
  // การต้องโทษครั้งแรกของแต่ละคน — ถ้าลงทะเบียนนี้อยู่ในการต้องโทษหลังจากนั้น = กลับมาต้องโทษซ้ำ
  const firstInc = db
    .select({ personId: schema.incarcerations.personId, first: sql<number>`min(${schema.incarcerations.id})` })
    .from(schema.incarcerations)
    .where(sql`${schema.incarcerations.personId} in (${sql.join(personIds.map((id) => sql`${id}`), sql`, `)})`)
    .groupBy(schema.incarcerations.personId)
    .all();
  const firstOf = new Map(firstInc.map((r) => [r.personId, r.first]));
  const nameCount = new Map<string, number>();
  for (const r of rows) nameCount.set(r.person.searchKey, (nameCount.get(r.person.searchKey) ?? 0) + 1);
  return rows.map((r) => ({
    ...r,
    otherCourses: Array.from(new Set(history.filter((h) => h.personId === r.person.id && h.enrollmentId !== r.enrollment.id && h.status === "completed").map((h) => h.courseShort))),
    isReturnee: r.inc.id > (firstOf.get(r.person.id) ?? r.inc.id),
    duplicateName: (nameCount.get(r.person.searchKey) ?? 0) > 1,
  }));
}
