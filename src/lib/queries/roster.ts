import { and, asc, eq, gt, inArray, isNull, lte, or } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { cohortLabel } from "../services/cohorts";

/**
 * ใบรายชื่อนับยอดประจำวัน (ผู้ควบคุม): ตารางกิจกรรมวันนี้ + รายชื่อ เลขประจำตัว รูป แดน
 * ไม่มีคดีละเอียด ไม่มีข้อมูลสุขภาพ ไม่มีผลประเมิน
 */
export function dailyRoster(db: DB, date: string) {
  const sessions = db
    .select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses })
    .from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohortSessions.date, date), isNull(schema.cohortSessions.deletedAt)))
    .orderBy(asc(schema.cohortSessions.startTime))
    .all();
  const cohortIds = Array.from(new Set(sessions.map((x) => x.c.id)));
  const people = cohortIds.length
    ? db
        .select({
          cohortId: schema.enrollments.cohortId,
          incId: schema.incarcerations.id,
          inmateNo: schema.incarcerations.inmateNo,
          zone: schema.incarcerations.zone,
          thumb: schema.incarcerations.thumbPath,
          prefix: schema.persons.prefix,
          firstName: schema.persons.firstName,
          lastName: schema.persons.lastName,
        })
        .from(schema.enrollments)
        .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
        .where(and(
          inArray(schema.enrollments.cohortId, cohortIds),
          inArray(schema.enrollments.status, ["draft", "active", "completed", "dropped"]),
          lte(schema.enrollments.enrolledDate, date),
          or(isNull(schema.enrollments.leftDate), gt(schema.enrollments.leftDate, date)),
          isNull(schema.enrollments.deletedAt),
        ))
        .orderBy(asc(schema.incarcerations.zone), asc(schema.persons.firstName))
        .all()
    : [];
  return cohortIds.map((id) => {
    const list = sessions.filter((x) => x.c.id === id);
    return {
      cohortId: id,
      label: `${list[0].course.shortName} ${cohortLabel(list[0].c)}`,
      sessions: list.map((x) => ({ id: x.s.id, time: `${x.s.startTime}–${x.s.endTime}`, title: x.s.title, location: x.s.location })),
      people: people.filter((p) => p.cohortId === id),
    };
  });
}
