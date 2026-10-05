import { and, asc, eq, inArray, isNull } from "drizzle-orm";
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

/** สร้างรุ่น + คำนวณวันสิ้นสุด + สร้างตารางจากแม่แบบ หรือคัดลอกจากรุ่นก่อน (สเปก 6, 11.4) */
export function createCohort(
  db: DB,
  input: { courseId: number; number?: number; startDate: string; targetCount?: number | null; location?: string | null; note?: string | null; copyFromCohortId?: number | null },
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

    type Slot = {
      dayNo: number; startTime: string; endTime: string; title: string; category: string | null; hours: number; takesAttendance: boolean;
      location: string | null; topicId: number | null; staff: Array<{ userId: number | null; instructorId: number | null; role: string | null }> | null;
    };
    let slots: Slot[];
    if (input.copyFromCohortId) {
      // คัดลอกจากรุ่นก่อน (สเปก 11.4): วันที่ n ของรุ่นเดิม → วันอบรมที่ n ของรุ่นใหม่ (เลื่อนข้ามวันหยุดให้เอง)
      const src = tx.select().from(schema.cohorts).where(eq(schema.cohorts.id, input.copyFromCohortId)).get();
      if (!src || src.courseId !== course.id) throw new Error("รุ่นต้นแบบต้องเป็นหลักสูตรเดียวกัน");
      const srcSessions = tx.select().from(schema.cohortSessions)
        .where(and(eq(schema.cohortSessions.cohortId, src.id), isNull(schema.cohortSessions.deletedAt), isNull(schema.cohortSessions.makeupOfId)))
        .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime)).all()
        .filter((x) => x.status !== "cancelled");
      const srcDates = Array.from(new Set(srcSessions.map((x) => x.date)));
      const staffRows = srcSessions.length
        ? tx.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, srcSessions.map((x) => x.id)), isNull(schema.sessionStaff.deletedAt))).all()
        : [];
      slots = srcSessions.map((x) => ({
        dayNo: srcDates.indexOf(x.date) + 1, startTime: x.startTime, endTime: x.endTime, title: x.title, category: x.category, hours: x.hours,
        takesAttendance: x.takesAttendance, location: x.location, topicId: x.topicId,
        staff: staffRows.filter((st) => st.sessionId === x.id).map((st) => ({ userId: st.userId, instructorId: st.instructorId, role: st.role })),
      }));
    } else {
      slots = tx.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, course.id))
        .orderBy(asc(schema.courseTemplateSessions.dayNo), asc(schema.courseTemplateSessions.sortOrder)).all()
        .map((t) => ({ dayNo: t.dayNo, startTime: t.startTime, endTime: t.endTime, title: t.title, category: t.category, hours: t.hours, takesAttendance: t.takesAttendance, location: null, topicId: t.topicId, staff: null }));
    }
    // ผู้รับผิดชอบประจำตามคลังหัวข้อ (สเปก 11.3): รายบุคคล = default_staff · ทั้งทีม = เจ้าหน้าที่หลักทุกคน (เอาออกได้)
    const topics = new Map(tx.select().from(schema.activityTopics).where(and(eq(schema.activityTopics.courseId, course.id), isNull(schema.activityTopics.deletedAt))).all().map((x) => [x.id, x]));
    const teamIds = tx.select({ id: schema.users.id }).from(schema.userRoles).innerJoin(schema.users, eq(schema.users.id, schema.userRoles.userId))
      .where(and(eq(schema.userRoles.role, "rehab"), eq(schema.users.status, "active"), isNull(schema.users.deletedAt))).all().map((r) => r.id);
    for (const t of slots) {
      const date = days[t.dayNo - 1];
      if (!date) continue;
      const topic = t.topicId ? topics.get(t.topicId) : undefined;
      const sess = tx.insert(schema.cohortSessions)
        .values({
          cohortId: cohort.id, date, dayNo: t.dayNo, startTime: t.startTime, endTime: t.endTime, title: t.title, category: t.category,
          hours: t.hours, takesAttendance: t.takesAttendance, location: t.location ?? input.location ?? null, topicId: t.topicId ?? null,
          createdBy: userId, updatedBy: userId,
        })
        .returning()
        .get();
      const staff = t.staff
        ?? (topic
          ? topic.staffingType === "team"
            ? teamIds.map((id) => ({ userId: id, instructorId: null as number | null, role: null }))
            : ((topic.defaultStaff as Array<{ userId?: number; instructorId?: number }> | null) ?? []).map((x) => ({ userId: x.userId ?? null, instructorId: x.instructorId ?? null, role: null }))
          : []);
      for (const st of staff) {
        tx.insert(schema.sessionStaff).values({ sessionId: sess.id, userId: st.userId, instructorId: st.instructorId, role: st.role, createdBy: userId, updatedBy: userId }).onConflictDoNothing().run();
      }
    }    writeAudit(tx, { userId, action: "create", entity: "cohort", entityId: cohort.id, after: cohort });
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
