import { and, asc, eq, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { trainingDays, fiscalYearOf } from "../thai-date";
import { writeAudit } from "../audit";

export function cohortLabel(c: { number: number; fiscalYear: number }) {
  return `รุ่นที่ ${c.number}/${c.fiscalYear}`;
}

export function holidaySet(db: DB): Set<string> {
  return new Set(db.select({ d: schema.holidays.date }).from(schema.holidays).all().map((r) => r.d));
}

/** วันอบรมของรุ่น (ข้ามวันหยุดตามตั้งค่าหลักสูตร) */
export function planTrainingDays(db: DB, course: typeof schema.courses.$inferSelect, startDate: string) {
  return trainingDays(startDate, course.durationDays, {
    skipWeekends: course.skipWeekends,
    holidays: course.skipHolidays ? holidaySet(db) : new Set(),
  });
}

export function nextCohortNumber(db: DB, courseId: number, fiscalYear: number) {
  const rows = db
    .select({ n: schema.cohorts.number })
    .from(schema.cohorts)
    .where(and(eq(schema.cohorts.courseId, courseId), eq(schema.cohorts.fiscalYear, fiscalYear), isNull(schema.cohorts.deletedAt)))
    .all();
  return rows.reduce((m, r) => Math.max(m, r.n), 0) + 1;
}

/** สร้างรุ่น + คำนวณวันสิ้นสุด + สร้างตารางจากแม่แบบ (สเปก 6) */
export function createCohort(
  db: DB,
  input: { courseId: number; number?: number; startDate: string; targetCount?: number | null; location?: string | null; note?: string | null },
  userId: number | null,
) {
  return db.transaction((tx) => {
    const course = tx.select().from(schema.courses).where(eq(schema.courses.id, input.courseId)).get();
    if (!course) throw new Error("ไม่พบหลักสูตร");
    const days = planTrainingDays(tx as unknown as DB, course, input.startDate);
    const fiscalYear = fiscalYearOf(days[0]);
    const number = input.number ?? nextCohortNumber(tx as unknown as DB, course.id, fiscalYear);
    const dup = tx
      .select()
      .from(schema.cohorts)
      .where(and(eq(schema.cohorts.courseId, course.id), eq(schema.cohorts.fiscalYear, fiscalYear), eq(schema.cohorts.number, number), isNull(schema.cohorts.deletedAt)))
      .get();
    if (dup) throw new Error(`มี${cohortLabel({ number, fiscalYear })} ของหลักสูตรนี้อยู่แล้ว กรุณาใช้เลขรุ่นอื่น`);

    const cohort = tx
      .insert(schema.cohorts)
      .values({
        courseId: course.id,
        fiscalYear,
        number,
        startDate: days[0],
        endDate: days[days.length - 1],
        status: "planned",
        targetCount: input.targetCount ?? null,
        location: input.location ?? null,
        note: input.note ?? null,
        createdBy: userId,
        updatedBy: userId,
      })
      .returning()
      .get();

    const template = tx
      .select()
      .from(schema.courseTemplateSessions)
      .where(eq(schema.courseTemplateSessions.courseId, course.id))
      .orderBy(asc(schema.courseTemplateSessions.dayNo), asc(schema.courseTemplateSessions.sortOrder))
      .all();
    for (const t of template) {
      const date = days[t.dayNo - 1];
      if (!date) continue;
      tx.insert(schema.cohortSessions)
        .values({
          cohortId: cohort.id,
          date,
          dayNo: t.dayNo,
          startTime: t.startTime,
          endTime: t.endTime,
          title: t.title,
          category: t.category,
          hours: t.hours,
          takesAttendance: t.takesAttendance,
          location: input.location ?? null,
          createdBy: userId,
          updatedBy: userId,
        })
        .run();
    }
    writeAudit(tx, { userId, action: "create", entity: "cohort", entityId: cohort.id, after: cohort });
    return cohort;
  });
}

/** สถานะรุ่นตามวันที่ (ถ้ายังไม่ปิด) */
export function effectiveCohortStatus(c: { status: string; startDate: string; endDate: string }, today: string) {
  if (c.status === "closed") return "closed";
  if (today < c.startDate) return "planned";
  if (today > c.endDate) return "ended";
  return "active";
}

export const COHORT_STATUS_LABEL: Record<string, string> = {
  planned: "ยังไม่เริ่ม",
  active: "กำลังอบรม",
  ended: "อบรมครบแล้ว รอปิดรุ่น",
  closed: "ปิดรุ่นแล้ว",
};
