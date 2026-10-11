import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { lookupLabel } from "../bootstrap";
import { courseReport } from "./course-report";
import { phaseSummary } from "./fast-phase";
import { recordSummary } from "./tc-tools";
import { teamReviews, RATING_LABEL, tcLookups } from "./tc-house";
import { WHOQOL_DOMAINS } from "../assessments/forms";

/**
 * รายงานสิ้นสุดรุ่นของชุมชนบำบัด FAST (สเปก 16 "รายงานสิ้นสุดรุ่น (ตามแบบกรมฯ)") — ตัวเลขรวม ไม่มีชื่อผู้ต้องขัง
 * 1 จำนวนสมาชิกชาย/หญิง · 2 ผู้เคยบำบัดแล้วกลับมาต้องโทษซ้ำ · 3 ผลดำเนินงาน 5 ด้าน · 4 บสต./รท.101 · 5 งบประมาณ · 6 ปัญหา ข้อเสนอแนะ
 */
type Count = { male: number; female: number; total: number };
const count = (rows: Array<{ gender: string | null }>): Count => {
  const female = rows.filter((r) => r.gender === "female").length;
  return { male: rows.length - female, female, total: rows.length };
};
const avg = (v: number[]) => (v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null);

export function fastEndReport(db: DB, cohortId: number) {
  const base = courseReport(db, cohortId);
  if (!base || base.course.code !== "FAST") return null;

  // ── 1) จำนวนสมาชิก: เข้า / ไม่จบ (สาเหตุ) / จบอยู่ในเรือนจำ / จบปล่อยตัว / คงเหลือ
  const rows = db.select({ e: schema.enrollments, inc: schema.incarcerations, gender: schema.persons.gender, personId: schema.persons.id })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.enrollments.deletedAt))).all();
  const entered = rows.filter((x) => ["active", "completed", "dropped", "failed"].includes(x.e.status));
  const notCompleted = entered.filter((x) => x.e.status === "dropped" || x.e.status === "failed");
  const completed = entered.filter((x) => x.e.status === "completed");
  const completedIn = completed.filter((x) => !x.inc.releasedDate), completedOut = completed.filter((x) => !!x.inc.releasedDate);
  const remaining = entered.filter((x) => x.e.status === "active");
  const reasons = new Map<string, Count>();
  for (const x of notCompleted) {
    const label = x.e.status === "failed" ? "ไม่ผ่านเกณฑ์" : x.inc.releasedDate && x.inc.releaseReason ? `ออกจากเรือนจำ (${lookupLabel(db, "release_reason", x.inc.releaseReason)})` : x.e.leftReason ? lookupLabel(db, "drop_reason", x.e.leftReason) : "ไม่ระบุสาเหตุ";
    const c = reasons.get(label) ?? { male: 0, female: 0, total: 0 };
    if (x.gender === "female") c.female++; else c.male++;
    c.total++;
    reasons.set(label, c);
  }
  const members = {
    target: base.cohort.targetCount ?? null,
    entered: count(entered), notCompleted: count(notCompleted), completedIn: count(completedIn), completedOut: count(completedOut), remaining: count(remaining),
    reasons: Array.from(reasons, ([label, c]) => ({ label, ...c })),
  };
  const consistent = members.entered.total === members.notCompleted.total + members.completedIn.total + members.completedOut.total + members.remaining.total;

  // ── 2) ผู้เคยบำบัดแล้วกลับมาต้องโทษซ้ำ: บุคคลเดียวกันเคยครบหลักสูตรใดในการต้องโทษครั้งก่อน
  const personIds = Array.from(new Set(entered.map((x) => x.personId)));
  const prior = personIds.length
    ? db.select({ personId: schema.incarcerations.personId, incId: schema.incarcerations.id, courseId: schema.enrollments.courseId }).from(schema.enrollments)
      .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
      .where(and(inArray(schema.incarcerations.personId, personIds), eq(schema.enrollments.status, "completed"), isNull(schema.enrollments.deletedAt), ne(schema.enrollments.cohortId, cohortId))).all()
    : [];
  const returnees = entered.filter((x) => prior.some((p) => p.personId === x.personId && p.incId !== x.inc.id));
  const courseNames = new Map(db.select().from(schema.courses).all().map((c) => [c.id, c.shortName]));
  const returnBy = new Map<string, number>();
  for (const x of returnees) for (const cid of new Set(prior.filter((p) => p.personId === x.personId && p.incId !== x.inc.id).map((p) => p.courseId))) returnBy.set(courseNames.get(cid) ?? "-", (returnBy.get(courseNames.get(cid) ?? "-") ?? 0) + 1);

  // ── 3) ผลดำเนินงาน 5 ด้าน
  const ids = entered.map((x) => x.e.id);
  const forms = new Map(db.select().from(schema.assessmentForms).all().map((f) => [f.code, f]));
  const results = ids.length ? db.select().from(schema.assessmentResults).where(and(inArray(schema.assessmentResults.enrollmentId, ids), isNull(schema.assessmentResults.deletedAt))).all() : [];
  const of = (code: string, round: string) => results.filter((r) => r.formId === forms.get(code)?.id && r.round === round && r.total != null);
  const prePost = (code: string) => { const pre = of(code, "pre"), post = of(code, "post"); return { pre: avg(pre.map((r) => r.total!)), preN: pre.length, post: avg(post.map((r) => r.total!)), postN: post.length }; };
  // คะแนนพฤติกรรมรายเดือน (ความก้าวหน้า 27 ข้อ): เฉลี่ยต่อเดือน
  const monthly = of("PROG", "monthly");
  const progress = Array.from(new Set(monthly.map((r) => r.period))).sort().map((period) => { const v = monthly.filter((r) => r.period === period); return { period, avg: avg(v.map((r) => r.total!)), n: v.length, low: v.filter((r) => r.tone === "danger").length }; });
  // WHOQOL รายด้าน (เฉลี่ย ก่อน/หลัง)
  const domainAvg = (round: string) => WHOQOL_DOMAINS.map((d) => ({ code: d.code, name: d.name, avg: avg(of("WHOQOL", round).map((r) => ((r.details as { domains?: Array<{ code: string; score: number }> } | null)?.domains ?? []).find((x) => x.code === d.code)?.score).filter((v): v is number => v != null)) }));

  const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt))).all().filter((s) => s.status !== "cancelled" && !s.makeupOfId);
  const sess = (pred: (s: (typeof sessions)[number]) => boolean) => { const l = sessions.filter(pred); return { planned: l.length, done: l.filter((s) => s.taughtAt).length, hours: l.filter((s) => s.taughtAt).reduce((t, s) => t + s.hours, 0) }; };
  const att = ids.length ? db.select({ status: schema.attendance.status }).from(schema.attendance).where(inArray(schema.attendance.enrollmentId, ids)).all().filter((a) => a.status !== "corrections") : [];
  const reviews = teamReviews(db, cohortId, 100000);
  const teams = tcLookups(db, "tc_team");

  const areas = {
    discipline: recordSummary(db, cohortId),
    community: {
      phases: phaseSummary(db, cohortId).byPhase.map((p) => ({ label: `${p.phase.no}. ${p.phase.name}`, n: p.n })),
      morning: sess((s) => s.title === "กลุ่มประชุมเช้า"),
      progress,
      teamReviews: Object.keys(RATING_LABEL).map((k) => ({ label: RATING_LABEL[k], n: reviews.filter((r) => r.rating === k).length })),
      teamCount: teams.filter((t) => t.active).length,
    },
    psychosocial: {
      learning: sess((s) => s.category === "การเรียนรู้แบบมีส่วนร่วม"),
      family: sess((s) => s.category === "ครอบครัว"),
      attendancePct: att.length ? Math.round((att.filter((a) => a.status === "present").length / att.length) * 100) : null,
      knowledge: prePost("KNOW"), attitude: prePost("ATT"), motivation: prePost("MOTIV"),
    },
    quality: { whoqol: prePost("WHOQOL"), domainsPre: domainAvg("pre"), domainsPost: domainAvg("post"), selfEsteem: prePost("ROSE") },
    vocational: sess((s) => /วิชาชีพ|บ้านกึ่งวิถี/.test(s.title)),
  };

  return { cohort: base.cohort, course: base.course, members, consistent, returnees: { ...count(returnees), byCourse: Array.from(returnBy, ([label, n]) => ({ label, n })) }, areas, records: base.records, budget: base.budget, activity: base.activity };
}
export type FastEndReport = NonNullable<ReturnType<typeof fastEndReport>>;
