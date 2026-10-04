import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { dueAssessments, formAccess } from "../services/assessments";
import { cohortLabel } from "../services/cohorts";
import type { Permission } from "../auth/permissions";
import { todayISO } from "../thai-date";

/**
 * หน้า "ข้อมูลที่ยังไม่ครบ" (สเปก 19, 22A): ไม่มีรูป · ยังไม่ประเมินก่อนเรียน · ไม่บันทึกเกณฑ์รับเข้า · ไม่มีหลักฐานยินยอม · รุ่นยังไม่ปิด
 * ใช้เฉพาะรุ่นที่ยังไม่ปิด
 */
export function incompleteData(db: DB, can: (p: Permission) => boolean) {
  const open = db
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(sql`${schema.cohorts.status} != 'closed'`, eq(schema.courses.enabled, true), isNull(schema.cohorts.deletedAt)))
    .all();
  const cohortIds = open.map((x) => x.c.id);
  const label = new Map(open.map((x) => [x.c.id, `${x.course.shortName} ${cohortLabel(x.c)}`]));
  const rows = cohortIds.length
    ? db
        .select({ e: schema.enrollments, inc: schema.incarcerations, p: schema.persons })
        .from(schema.enrollments)
        .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
        .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
        .where(and(inArray(schema.enrollments.cohortId, cohortIds), inArray(schema.enrollments.status, ["draft", "active"]), isNull(schema.enrollments.deletedAt)))
        .all()
    : [];
  const person = (r: (typeof rows)[number]) => ({ enrollmentId: r.e.id, personId: r.p.id, name: `${r.p.firstName} ${r.p.lastName}`, inmateNo: r.inc.inmateNo, cohort: label.get(r.e.cohortId) ?? "" });

  const forms = db.select().from(schema.assessmentForms).all();
  const formById = new Map(forms.map((f) => [f.id, f]));
  const preDue = cohortIds.flatMap((id) => dueAssessments(db, id)).filter((d) => d.round === "pre" && formAccess(can, formById.get(d.formId)!).view);
  const byEnr = new Map(rows.map((r) => [r.e.id, r]));

  const noPhone = rows.length
    ? new Set(db.select({ id: schema.contacts.personId }).from(schema.contacts).where(and(inArray(schema.contacts.personId, rows.map((r) => r.p.id)), eq(schema.contacts.kind, "relative"), isNull(schema.contacts.deletedAt))).all().map((x) => x.id))
    : new Set<number>();

  return {
    noPhoto: rows.filter((r) => !r.inc.thumbPath).map(person),
    noConsent: rows.filter((r) => !r.e.consentSigned).map(person),
    noScreening: rows.filter((r) => r.e.screeningScore == null).map(person),
    noBirthDate: rows.filter((r) => !r.p.birthDate).map(person),
    noContact: rows.filter((r) => !noPhone.has(r.p.id)).map(person),
    preAssessment: preDue.map((d) => {
      const r = byEnr.get(d.enrollmentId);
      return { ...(r ? person(r) : { enrollmentId: d.enrollmentId, personId: 0, name: "", inmateNo: "", cohort: "" }), form: d.formName, formCode: d.formCode };
    }),
    cohortsToClose: open.filter((x) => x.c.endDate < todayISO()).map((x) => ({ id: x.c.id, label: label.get(x.c.id)! })),
  };
}

