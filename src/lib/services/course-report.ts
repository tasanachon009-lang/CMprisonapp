import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { lookupLabel } from "../bootstrap";
import { cohortReport } from "./budget";
import { referralSummary, usesHealthReferral } from "./health-referral";

/**
 * แบบรายงานผลการดำเนินงานและการใช้จ่ายงบประมาณของรุ่น (สเปก 18.4, 13.4, 14.3)
 * ตัวเลขรวมเท่านั้น ไม่มีชื่อผู้ต้องขัง — ทุกตัวเลขดึงจากข้อมูลที่บันทึกไว้แล้ว (ไม่กรอกซ้ำ สเปก 22A)
 */
type Count = { male: number; female: number; total: number };
const count = (rows: Array<{ gender: string | null }>): Count => {
  const female = rows.filter((r) => r.gender === "female").length;
  return { male: rows.length - female, female, total: rows.length };
};

export function courseReport(db: DB, cohortId: number) {
  const row = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  if (!row) return null;
  const { c, course } = row;

  // 1) ผู้เข้ารับการอบรม — "เข้า" = ยืนยันรับเข้าแล้ว (ไม่นับร่างและถอนตัวก่อนเริ่ม)
  const enr = db.select({ e: schema.enrollments, gender: schema.persons.gender })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.enrollments.deletedAt))).all();
  const entered = enr.filter((x) => ["active", "completed", "dropped", "failed"].includes(x.e.status));
  const completed = entered.filter((x) => x.e.status === "completed");
  const notCompleted = entered.filter((x) => x.e.status === "dropped" || x.e.status === "failed");
  const remaining = entered.filter((x) => x.e.status === "active");
  const reasons = new Map<string, number>();
  for (const x of notCompleted) {
    const label = x.e.status === "failed" ? "ไม่ผ่านเกณฑ์" : x.e.leftReason ? lookupLabel(db, "drop_reason", x.e.leftReason) : "ไม่ระบุสาเหตุ";
    reasons.set(label, (reasons.get(label) ?? 0) + 1);
  }
  const people = {
    target: c.targetCount ?? null,
    entered: count(entered), completed: count(completed), notCompleted: count(notCompleted), remaining: count(remaining),
    reasons: Array.from(reasons, ([label, n]) => ({ label, n })),
    draft: enr.filter((x) => x.e.status === "draft").length,
  };
  // ตรวจความสอดคล้อง (สเปก 22A): เข้า = จบ + ไม่จบ + คงเหลือ
  const consistent = people.entered.total === people.completed.total + people.notCompleted.total + people.remaining.total;

  // 2) กิจกรรมและวิทยากร
  const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt))).all();
  const planned = sessions.filter((s) => s.status !== "cancelled" && !s.makeupOfId);
  const done = planned.filter((s) => s.taughtAt);
  const staff = planned.length ? db.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, planned.map((s) => s.id)), isNull(schema.sessionStaff.deletedAt))).all().filter((x) => x.didTeach) : [];
  const insIds = Array.from(new Set(staff.map((x) => x.instructorId).filter((x): x is number => x != null)));
  const ins = insIds.length ? db.select().from(schema.instructors).where(inArray(schema.instructors.id, insIds)).all() : [];
  const externalIns = ins.filter((i) => i.kind === "external");
  const internalUsers = new Set(staff.filter((x) => x.userId != null).map((x) => x.userId));
  const external = [
    ...externalIns.map((i) => ({ name: `${i.prefix ?? ""}${i.firstName ?? ""} ${i.lastName ?? ""}`.trim(), organization: i.organization ?? "" })),
    ...Array.from(new Set(staff.filter((x) => !x.instructorId && x.externalName?.trim()).map((x) => x.externalName!.trim()))).map((name) => ({ name, organization: "" })),
  ];
  const activity = {
    planned: planned.length, done: done.length, cancelled: sessions.filter((s) => s.status === "cancelled").length,
    hoursPlanned: planned.reduce((t, s) => t + s.hours, 0), hoursDone: done.reduce((t, s) => t + s.hours, 0), hoursTarget: course.totalHours,
    internal: internalUsers.size, external,
  };

  // 3) ผลการประเมิน (เฉลี่ยรายแบบ ก่อน/หลัง — ไม่รวมแบบสุขภาพ)
  const forms = db.select().from(schema.assessmentForms).where(and(eq(schema.assessmentForms.active, true), isNull(schema.assessmentForms.deletedAt))).all()
    .filter((f) => (f.courseCodes as string[]).includes(course.code) && !f.sensitive && f.kind === "items").sort((a, b) => a.sortOrder - b.sortOrder);
  const ids = entered.map((x) => x.e.id);
  const results = ids.length && forms.length
    ? db.select().from(schema.assessmentResults).where(and(inArray(schema.assessmentResults.enrollmentId, ids), inArray(schema.assessmentResults.formId, forms.map((f) => f.id)), isNull(schema.assessmentResults.deletedAt))).all()
    : [];
  const avg = (formId: number, round: string) => {
    const v = results.filter((r) => r.formId === formId && r.round === round && r.total != null).map((r) => r.total!);
    return { n: v.length, avg: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null };
  };
  const assessments = forms.map((f) => ({
    code: f.code, name: f.shortName, rounds: f.rounds as string[],
    pre: (f.rounds as string[]).includes("pre") ? avg(f.id, "pre") : null,
    post: (f.rounds as string[]).includes("post") ? avg(f.id, "post") : null,
    // จำนวนคนต่อระดับ (ผลรอบล่าสุดของแบบนั้น)
    levels: (() => {
      const round = (f.rounds as string[]).includes("post") ? "post" : "pre";
      const m = new Map<string, number>();
      for (const r of results.filter((x) => x.formId === f.id && x.round === round && x.level)) m.set(r.level!, (m.get(r.level!) ?? 0) + 1);
      return Array.from(m, ([label, n]) => ({ label, n }));
    })(),
  }));

  // 4) การนำเข้าข้อมูล บสต. / รท.101 (เป้าหมาย/ดำเนินการจริง — แยกสองบรรทัด สเปก 14.3)
  const tasks = ids.length ? db.select().from(schema.bstTasks).where(and(inArray(schema.bstTasks.enrollmentId, ids), isNull(schema.bstTasks.deletedAt))).all().filter((t) => t.status !== "cancelled") : [];
  const reg = (system: string, step: string) => { const t = tasks.filter((x) => x.system === system && x.step === step); return { target: t.length, done: t.filter((x) => x.status === "done").length }; };
  const records = {
    bst: course.requiresBst ? reg("bst", "register") : null,
    rt101: course.requiresRt101 ? { ...reg("rt101", "record"), target: Math.max(reg("rt101", "record").target, people.completed.total) } : null,
  };

  return {
    cohort: c, course, people, consistent, activity, assessments, records,
    referral: usesHealthReferral(course.code) ? referralSummary(db, cohortId) : null,
    budget: cohortReport(db, cohortId),
  };
}
export type CourseReport = NonNullable<ReturnType<typeof courseReport>>;
