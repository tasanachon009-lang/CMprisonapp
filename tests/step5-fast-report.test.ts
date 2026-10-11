import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { completeEnrollments, markTask } from "@/lib/services/followup";
import { recordReleases } from "@/lib/services/release";
import { saveAssessment } from "@/lib/services/assessments";
import { createRecord } from "@/lib/services/tc-tools";
import { advancePhase } from "@/lib/services/fast-phase";
import { saveTeamReview } from "@/lib/services/tc-house";
import { fastEndReport } from "@/lib/services/fast-report";
import { FORM_DEFS } from "@/lib/assessments/forms";
import { todayISO, addDays } from "@/lib/thai-date";

describe("รายงานสิ้นสุดรุ่นของชุมชนบำบัด (สเปก 16)", () => {
  let db: DB;
  let cohortId: number, ids: number[], b12Cohort: number;
  const actor = { userId: 1, canOverride: false, consentRequired: false };
  const who = { userId: 1 };
  const can = (() => true) as never;
  const def = (code: string) => FORM_DEFS.find((x) => x.code === code)!;
  const all = (code: string, v: number) => Object.fromEntries(def(code).items.map((i) => [String(i.no), v]));
  const form = (code: string) => db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, code)).get()!;
  const start = addDays(todayISO(), -70);

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    b12Cohort = createCohort(db, { courseId: b12.id, startDate: addDays(todayISO(), -400) }, 1).id;
    cohortId = createCohort(db, { courseId: fast.id, startDate: start, targetCount: 30 }, 1).id;
    ids = (["male", "male", "female", "male", "male"] as const).map((gender, i) => registerEnrollment(db, {
      cohortId, person: { firstName: "ชื่อลับ", lastName: `F-${i + 1}`, nationalId: null, birthDate: "1990-03-15", gender }, incarceration: { inmateNo: `F-${i + 1}`, prisonerClass: "good" },
      intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] }, confirmAdmission: true, consentSigned: true, consentDate: start, enrolledDate: start, acknowledgeWarnings: true,
    }, actor).enrollment.id);
  });

  it("ใช้กับชุมชนบำบัดเท่านั้น", () => {
    expect(fastEndReport(db, b12Cohort)).toBeNull();
    expect(fastEndReport(db, 99999)).toBeNull();
  });

  it("ข้อ 1: เข้า / ไม่จบ (สาเหตุ) / จบอยู่ในเรือนจำ / จบปล่อยตัว / คงเหลือ แยกชาย-หญิง และตัวเลขสอดคล้อง", () => {
    const today = todayISO();
    completeEnrollments(db, [ids[0], ids[2]], "completed", addDays(today, -3), who); // จบ 2 คน (ชาย 1 หญิง 1)
    completeEnrollments(db, [ids[1]], "failed", addDays(today, -3), who); // ไม่ผ่าน
    const incOf = (id: number) => db.select().from(schema.enrollments).where(eq(schema.enrollments.id, id)).get()!.incarcerationId;
    recordReleases(db, { incarcerationIds: [incOf(ids[0])], releasedDate: today, reason: "released" }, who); // จบแล้วปล่อยตัว
    recordReleases(db, { incarcerationIds: [incOf(ids[3])], releasedDate: today, reason: "transfer" }, who); // กำลังบำบัด → ออกก่อนกำหนด
    const r = fastEndReport(db, cohortId)!;
    expect(r.members.target).toBe(30);
    expect([r.members.entered, r.members.notCompleted, r.members.completedIn, r.members.completedOut, r.members.remaining]).toEqual([
      { male: 4, female: 1, total: 5 }, { male: 2, female: 0, total: 2 }, { male: 0, female: 1, total: 1 }, { male: 1, female: 0, total: 1 }, { male: 1, female: 0, total: 1 },
    ]);
    expect(r.members.reasons.map((x) => [x.label, x.total]).sort()).toEqual([["ออกจากเรือนจำ (ย้ายเรือนจำ)", 1], ["ไม่ผ่านเกณฑ์", 1]].sort());
    expect(r.consistent).toBe(true);
    const text = JSON.stringify(r, (k, v) => (k === "cohort" || k === "course" ? undefined : v));
    for (const w of ["ชื่อลับ", "F-1", "F-3"]) expect(text).not.toContain(w);
  });

  it("ข้อ 2: ผู้เคยผ่านการบำบัดแล้วกลับมาต้องโทษซ้ำ (บุคคลเดิม การต้องโทษครั้งก่อนเคยครบหลักสูตร)", () => {
    expect(fastEndReport(db, cohortId)!.returnees).toEqual({ male: 0, female: 0, total: 0, byCourse: [] });
    // สมาชิกคนที่ 1 เคยครบหลักสูตร 12 วันในการต้องโทษครั้งก่อน (เลขประจำตัวเดิมคนละเลข)
    const personId = db.select({ p: schema.incarcerations.personId }).from(schema.enrollments).innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).where(eq(schema.enrollments.id, ids[0])).get()!.p;
    const old = db.insert(schema.incarcerations).values({ personId, inmateNo: "OLD-1", releasedDate: addDays(todayISO(), -200) }).returning().get();
    const b12 = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, b12Cohort)).get()!;
    db.insert(schema.enrollments).values({ incarcerationId: old.id, cohortId: b12Cohort, courseId: b12.courseId, status: "completed", enrolledDate: b12.startDate }).run();
    // อีกคน: เคยเข้าแต่ไม่จบ → ไม่นับ
    const p2 = db.select({ p: schema.incarcerations.personId }).from(schema.enrollments).innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).where(eq(schema.enrollments.id, ids[2])).get()!.p;
    const old2 = db.insert(schema.incarcerations).values({ personId: p2, inmateNo: "OLD-2", releasedDate: addDays(todayISO(), -200) }).returning().get();
    db.insert(schema.enrollments).values({ incarcerationId: old2.id, cohortId: b12Cohort, courseId: b12.courseId, status: "dropped", enrolledDate: b12.startDate }).run();
    expect(fastEndReport(db, cohortId)!.returnees).toEqual({ male: 1, female: 0, total: 1, byCourse: [{ label: "12 วัน", n: 1 }] });
  });

  it("ข้อ 3–4: ผลดำเนินงาน 5 ด้านดึงจากข้อมูลที่บันทึกไว้ · บสต./รท.101 เป้า-จริง", () => {
    const d = addDays(start, 3), month = d.slice(0, 7);
    createRecord(db, { enrollmentId: ids[0], recordDate: d, behavior: "มาสาย", kind: "tool", code: "talking_to" }, who);
    createRecord(db, { enrollmentId: ids[1], recordDate: d, behavior: "มาสาย", kind: "violation", code: "late", level: "minor" }, who);
    createRecord(db, { enrollmentId: ids[1], recordDate: d, behavior: "ช่วยงาน", kind: "reward", code: "praise" }, who);
    advancePhase(db, { enrollmentIds: ids.slice(0, 2), toPhase: "rehab", date: addDays(start, 14), note: "ผ่านการประเมิน" }, who);
    saveTeamReview(db, cohortId, { team: "kitchen", weekStart: addDays(start, 7), rating: "good" }, who);
    saveAssessment(db, { enrollmentId: ids[0], formId: form("WHOQOL").id, round: "pre", assessedDate: d, answers: all("WHOQOL", 3) }, { userId: 1, can });
    saveAssessment(db, { enrollmentId: ids[1], formId: form("WHOQOL").id, round: "pre", assessedDate: d, answers: all("WHOQOL", 4) }, { userId: 1, can });
    saveAssessment(db, { enrollmentId: ids[0], formId: form("KNOW").id, round: "pre", assessedDate: d, answers: all("KNOW", 1) }, { userId: 1, can });
    saveAssessment(db, { enrollmentId: ids[0], formId: form("PROG").id, round: "monthly", period: month, assessedDate: d, answers: all("PROG", 2) }, { userId: 1, can });
    saveAssessment(db, { enrollmentId: ids[1], formId: form("PROG").id, round: "monthly", period: month, assessedDate: d, answers: all("PROG", 4) }, { userId: 1, can });
    completeEnrollments(db, [ids[4]], "completed", addDays(todayISO(), -1), who);
    const rt = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.system, "rt101")).all();
    markTask(db, rt[0].id, todayISO(), who);

    const r = fastEndReport(db, cohortId)!;
    const a = r.areas;
    expect(a.discipline.tools.find((x) => x.code === "talking_to")!.n).toBe(1);
    expect([a.discipline.levels.find((x) => x.level === "minor")!.n, a.discipline.rewards.find((x) => x.code === "praise")!.n]).toEqual([1, 1]);
    expect(a.community.phases.filter((p) => p.n > 0).map((p) => [p.label, p.n])).toEqual([["1. Entry", 3], ["2. Rehabilitation", 2]]);
    expect(a.community.teamReviews.find((x) => x.label === "ดี")!.n).toBe(1);
    // คะแนนพฤติกรรมรายเดือน: (54 + 108) / 2 = 81 · ต่ำ 1 คน
    expect(a.community.progress).toEqual([{ period: month, avg: 81, n: 2, low: 1 }]);
    // แม่แบบ: เรียนรู้ 12 หัวข้อ · ครอบครัว 7 ครั้ง — คาบที่ตรงวันหยุดราชการไม่ถูกสร้าง (ขึ้นกับวันที่รันเทสต์)
    const sessions = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
    const planned = (cat: string) => sessions.filter((x) => x.category === cat).length;
    expect(a.psychosocial.learning.planned).toBe(planned("การเรียนรู้แบบมีส่วนร่วม"));
    expect(a.psychosocial.family.planned).toBe(planned("ครอบครัว"));
    expect(a.psychosocial.learning.planned).toBeGreaterThanOrEqual(10);
    expect(a.psychosocial.learning.planned).toBeLessThanOrEqual(12);
    expect(a.psychosocial.family.planned).toBeGreaterThanOrEqual(5);
    expect(a.psychosocial.family.planned).toBeLessThanOrEqual(7);
    expect(a.psychosocial.knowledge).toEqual({ pre: 9, preN: 1, post: null, postN: 0 });
    // WHOQOL ตอบ 3 ทุกข้อ = 78 · ตอบ 4 ทุกข้อ = 23×4 + 3×2 = 98 → เฉลี่ย 88
    expect(a.quality.whoqol).toEqual({ pre: 88, preN: 2, post: null, postN: 0 });
    expect(a.quality.domainsPre.map((x) => x.code)).toEqual(["physical", "psych", "social", "environment"]);
    expect(a.quality.domainsPre[2].avg).toBe(10.5); // สัมพันธภาพทางสังคม 3 ข้อ: (9 + 12) / 2
    expect(a.quality.domainsPost.every((x) => x.avg == null)).toBe(true);
    expect(a.vocational.planned).toBeGreaterThan(0);
    expect(r.records.bst).toMatchObject({ target: 5 });
    expect(r.records.rt101).toEqual({ target: 1, done: 1 });
  });
});
