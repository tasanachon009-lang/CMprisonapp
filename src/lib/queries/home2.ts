import { and, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { dueAssessments, formAccess } from "../services/assessments";
import type { Permission } from "../auth/permissions";
import { cohortLabel } from "../services/cohorts";

function activeCohorts(db: DB) {
  return db
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(sql`${schema.cohorts.status} != 'closed'`, eq(schema.courses.enabled, true), isNull(schema.cohorts.deletedAt)))
    .all();
}

/** แบบประเมินถึงรอบ รายรุ่น (เฉพาะแบบที่ผู้ใช้มีสิทธิ์บันทึก) */
export function dueByCohort(db: DB, can: (p: Permission) => boolean, today: string) {
  const forms = new Map(db.select().from(schema.assessmentForms).all().map((f) => [f.id, f]));
  return activeCohorts(db)
    .map(({ c, course }) => {
      const due = dueAssessments(db, c.id, today).filter((d) => formAccess(can, forms.get(d.formId)!).edit);
      return { id: c.id, label: `${course.shortName} ${cohortLabel(c)}`, pre: due.filter((d) => d.round === "pre").length, post: due.filter((d) => d.round === "post").length };
    })
    .filter((x) => x.pre + x.post > 0);
}

/** สถานพยาบาล: ผลคัดกรองเสี่ยง (30 วัน) ที่ยังไม่มีความเห็นหลังวันประเมิน + รายการส่งต่อที่ยังไม่ปิด */
export function healthQueue(db: DB) {
  const since = new Date(Date.now() - 30 * 86400000);
  const risky = db
    .select({ r: schema.assessmentResults, f: schema.assessmentForms, p: schema.persons, inc: schema.incarcerations })
    .from(schema.assessmentResults)
    .innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.assessmentResults.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.assessmentForms.sensitive, true), eq(schema.assessmentResults.tone, "danger"), gte(schema.assessmentResults.updatedAt, since), inArray(schema.enrollments.status, ["draft", "active"]), isNull(schema.assessmentResults.deletedAt)))
    .orderBy(desc(schema.assessmentResults.updatedAt))
    .all();
  const enrIds = Array.from(new Set(risky.map((x) => x.r.enrollmentId)));
  const notes = enrIds.length ? db.select().from(schema.medicalNotes).where(and(inArray(schema.medicalNotes.enrollmentId, enrIds), isNull(schema.medicalNotes.deletedAt))).all() : [];
  const awaitingNote = risky.filter((x) => !notes.some((n) => n.enrollmentId === x.r.enrollmentId && n.noteDate >= x.r.assessedDate));
  const referrals = db
    .select({ n: schema.medicalNotes, p: schema.persons })
    .from(schema.medicalNotes)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.medicalNotes.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.medicalNotes.referral, true), eq(schema.medicalNotes.referralStatus, "pending"), isNull(schema.medicalNotes.deletedAt)))
    .all();
  return { risky, awaitingNote, referrals };
}
