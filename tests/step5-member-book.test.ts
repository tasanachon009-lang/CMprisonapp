import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveAssessment, dueAssessments, listForms } from "@/lib/services/assessments";
import { advancePhase } from "@/lib/services/fast-phase";
import { FORM_DEFS, formsFor, WHOQOL_DOMAINS, type FormDef } from "@/lib/assessments/forms";
import { scoreItems, type ItemsScoring } from "@/lib/assessments/scoring";
import {
  remainingSentence, generalInfo, saveGeneral, bookMonths, monthHelper, helperSummary, saveMonthlyNote, listNotes,
  addCounselorOpinion, updateCounselorOpinion, deleteCounselorOpinion, missingMonthlyNotes, individualSummary,
} from "@/lib/services/member-book";
import { periodLabel } from "@/lib/fast/book-view";

const def = (code: string) => FORM_DEFS.find((x) => x.code === code)!;
const sc = (f: FormDef) => f.scoring as unknown as ItemsScoring;
const all = (f: FormDef, v: number) => Object.fromEntries(f.items.map((i) => [String(i.no), v]));

describe("แบบประเมินชุมชนบำบัด (สเปก 16B)", () => {
  it("WHOQOL-26: ข้อทางลบ 2, 9, 11 กลับคะแนน · รวม 26–130 · 3 ระดับตรงขอบ", () => {
    const f = def("WHOQOL"), s = sc(f);
    expect(f.items.length).toBe(26);
    expect(f.items.filter((i) => i.reverse).map((i) => i.no)).toEqual([2, 9, 11]);
    // ตอบ "มากที่สุด" (5) ทุกข้อ: บวก 23 × 5 + ลบ 3 × 1 = 118 · ตอบ "ไม่เลย" (1) ทุกข้อ: 23 × 1 + 3 × 5 = 38
    expect(scoreItems(f.items, s, all(f, 5)).total).toBe(118);
    expect(scoreItems(f.items, s, all(f, 1)).total).toBe(38);
    const best = Object.fromEntries(f.items.map((i) => [String(i.no), i.reverse ? 1 : 5])), worst = Object.fromEntries(f.items.map((i) => [String(i.no), i.reverse ? 5 : 1]));
    expect([scoreItems(f.items, s, best).total, scoreItems(f.items, s, best).level]).toEqual([130, "คุณภาพชีวิตดี"]);
    expect([scoreItems(f.items, s, worst).total, scoreItems(f.items, s, worst).level]).toEqual([26, "คุณภาพชีวิตไม่ดี"]);
    const bands = [...s.bands].sort((a, b) => a.min - b.min);
    expect(bands.map((b) => [b.min, b.max])).toEqual([[26, 60], [61, 95], [96, 130]]);
  });

  it("WHOQOL-26 รายด้าน 4 องค์ประกอบตามแบบ · ข้อ 1 และ 26 ไม่อยู่ในด้านใด · เกณฑ์รายด้านครอบคลุมทุกคะแนน", () => {
    const f = def("WHOQOL"), s = sc(f);
    expect(WHOQOL_DOMAINS.map((d) => d.items)).toEqual([[2, 3, 4, 10, 11, 12, 24], [5, 6, 7, 8, 9, 23], [13, 14, 25], [15, 16, 17, 18, 19, 20, 21, 22]]);
    const used = WHOQOL_DOMAINS.flatMap((d) => d.items);
    expect(new Set(used).size).toBe(24);
    expect(used).not.toContain(1);
    expect(used).not.toContain(26);
    for (const d of WHOQOL_DOMAINS) {
      const b = [...d.bands].sort((x, y) => x.min - y.min);
      expect([b[0].min, b.at(-1)!.max]).toEqual([d.items.length, d.items.length * 5]);
      for (let i = 1; i < b.length; i++) expect(b[i].min).toBe(b[i - 1].max + 1);
    }
    // ตอบ 3 ทุกข้อ: ด้านกาย มีข้อกลับ 2 ข้อ (2, 11) → 6−3 = 3 เท่าเดิม → 21
    const r = scoreItems(f.items, s, all(f, 3));
    expect((r.details.domains as Array<{ code: string; score: number; level: string }>).map((d) => [d.code, d.score, d.level])).toEqual([
      ["physical", 21, "คุณภาพชีวิตกลางๆ"], ["psych", 18, "คุณภาพชีวิตกลางๆ"], ["social", 9, "คุณภาพชีวิตกลางๆ"], ["environment", 24, "คุณภาพชีวิตกลางๆ"],
    ]);
    // ข้อ 2 (ทางลบ ด้านกาย) ตอบ "มากที่สุด" = 1 คะแนน
    const d2 = scoreItems(f.items, s, { ...all(f, 3), "2": 5 }).details.domains as Array<{ code: string; score: number }>;
    expect(d2.find((d) => d.code === "physical")!.score).toBe(19);
  });

  it("SCL-90-R: ปิดใช้งานไว้ก่อน · 90 ข้อ 0–4 · คะแนนรวม + GSI + จำนวนข้อ > 0 · ไม่ติดป้ายระดับ · แจ้งเตือนข้อ 15/59 (≥1) และ 63/67 (≥3)", () => {
    const f = def("SCL90"), s = sc(f);
    expect([f.active, f.sensitive, f.category, f.items.length]).toEqual([false, true, "health_mental", 90]);
    const zero = all(f, 0);
    const r0 = scoreItems(f.items, s, zero);
    expect([r0.total, r0.level, r0.details.gsi, r0.details.positive, r0.alerts]).toEqual([0, null, 0, 0, []]);
    const r = scoreItems(f.items, s, { ...zero, "1": 4, "2": 2, "3": 3 });
    expect([r.total, r.details.gsi, r.details.positive, r.level]).toEqual([9, 0.1, 3, null]);
    expect(scoreItems(f.items, s, { ...zero, "15": 1 }).alerts[0]).toMatchObject({ severity: "danger" });
    expect(scoreItems(f.items, s, { ...zero, "59": 2 }).alerts[0].message).toMatch(/8Q.*ข้อ 59/);
    expect(scoreItems(f.items, s, { ...zero, "63": 2, "67": 2 }).alerts).toEqual([]);
    expect(scoreItems(f.items, s, { ...zero, "63": 3 }).alerts[0]).toMatchObject({ severity: "warning" });
    expect(scoreItems(f.items, s, { ...zero, "15": 1, "67": 4 }).alerts.length).toBe(2);
  });

  it("ชุมชนบำบัดใช้: 2Q→9Q→8Q · PMHQ · คัดกรองโรคจิต · ความรู้ · ทัศนคติ · แรงจูงใจ · Rosenberg ฉบับ FAST · WHOQOL · ความก้าวหน้ารายเดือน", () => {
    const pre = formsFor("FAST", "pre").map((f) => f.code);
    for (const c of ["COND", "PMHQ", "DEP", "PSY", "KNOW", "ATT", "MOTIV", "ROSE", "WHOQOL", "SCL90"]) expect(pre).toContain(c);
    expect(pre).not.toContain("ROSE3");
    expect(formsFor("FAST", "monthly").map((f) => f.code)).toEqual(["PROG"]);
    expect(formsFor("B12", "pre").map((f) => f.code)).not.toContain("WHOQOL");
  });
});

describe("สมุดบันทึกความก้าวหน้าของสมาชิก (สเปก 16A)", () => {
  let db: DB;
  let cohortId: number, a: number, b: number, b12Enr: number;
  const actor = { userId: 1, canOverride: false, consentRequired: false };
  const u1 = { userId: 1 }, u2 = { userId: 2 }, admin = { userId: 3, isAdmin: true };
  const can = (() => true) as never;

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    for (const n of ["ที่ปรึกษาหนึ่ง", "ที่ปรึกษาสอง", "หัวหน้า"]) db.insert(schema.users).values({ firstName: n, lastName: "ทดสอบ", passwordHash: "x" }).run();
    const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    cohortId = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1).id;
    const reg = (no: string) => registerEnrollment(db, {
      cohortId, person: { firstName: "สมาชิก", lastName: no, nationalId: null, birthDate: "1990-03-15", gender: "male", maritalStatus: "โสด", education: "มัธยมศึกษาตอนต้น", occupation: "รับจ้าง", familySize: 4 },
      incarceration: { inmateNo: no, prisonerClass: "good", admittedDate: "2025-01-10", offense: "เสพยาเสพติดประเภท 1", sentenceYears: 3, sentenceMonths: 6 },
      drugUse: [{ substance: "meth", ageStarted: 17, frequency: "daily" }],
      intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] },
      confirmAdmission: true, consentSigned: true, consentDate: "2026-07-01", enrolledDate: "2026-07-06", acknowledgeWarnings: true,
    }, actor).enrollment.id;
    a = reg("F-1"); b = reg("F-2");
    const c12 = createCohort(db, { courseId: b12.id, startDate: "2026-09-01" }, 1);
    b12Enr = registerEnrollment(db, { cohortId: c12.id, person: { firstName: "สิบสอง", lastName: "วัน", nationalId: null }, incarceration: { inmateNo: "B-1" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01", acknowledgeWarnings: true }, actor).enrollment.id;
  });

  it("โทษที่เหลือ: คำนวณจากวันรับตัว + กำหนดโทษ · พ้นแล้ว = 0 · ข้อมูลไม่ครบ = ไม่แสดง", () => {
    const inc = { admittedDate: "2025-01-10", sentenceYears: 3, sentenceMonths: 6, sentenceDays: null };
    expect(remainingSentence(inc, "2026-07-06")).toEqual({ years: 2, months: 0, days: 4, releaseDate: "2028-07-10" });
    expect(remainingSentence(inc, "2028-07-09")).toMatchObject({ years: 0, months: 0, days: 1 });
    expect(remainingSentence(inc, "2030-01-01")).toMatchObject({ years: 0, months: 0, days: 0 });
    expect(remainingSentence({ admittedDate: null, sentenceYears: 1, sentenceMonths: null, sentenceDays: null }, "2026-07-06")).toBeNull();
    expect(remainingSentence({ admittedDate: "2025-01-10", sentenceYears: null, sentenceMonths: null, sentenceDays: null }, "2026-07-06")).toBeNull();
  });

  it("ส่วนที่ 1: ดึงจากทะเบียน ไม่กรอกซ้ำ · บันทึกข้อความยาว 2 ช่อง · กันบันทึกทับ · ใช้ได้เฉพาะชุมชนบำบัด", () => {
    const g = generalInfo(db, a, "2026-07-06")!;
    expect([g.gender, g.age, g.maritalStatus, g.education, g.occupation, g.familySize, g.offense]).toEqual(["male", 36, "โสด", "มัธยมศึกษาตอนต้น", "รับจ้าง", 4, "เสพยาเสพติดประเภท 1"]);
    expect(g.drugs).toEqual([expect.objectContaining({ substance: "meth", ageStarted: 17, frequency: "daily" })]);
    expect([g.sentence, g.remaining?.years, g.housingBefore, g.enteredDate]).toEqual([{ years: 3, months: 6, days: null }, 2, "", "2026-07-06"]);
    saveGeneral(db, a, { housingBefore: "  อยู่กับมารดา บ้านเช่า  ", familyBond: "ติดต่อมารดาสม่ำเสมอ" }, u1);
    const g2 = generalInfo(db, a)!;
    expect([g2.housingBefore, g2.familyBond, g2.bookVersion]).toEqual(["อยู่กับมารดา บ้านเช่า", "ติดต่อมารดาสม่ำเสมอ", 1]);
    expect(() => saveGeneral(db, a, { housingBefore: "x", familyBond: "" }, u2, 0)).toThrow(/ถูกแก้ไขโดยผู้ใช้อื่น/);
    saveGeneral(db, a, { housingBefore: "แก้ไข", familyBond: "" }, u2, 1);
    expect(generalInfo(db, a)!.bookVersion).toBe(2);
    expect(() => saveGeneral(db, b12Enr, { housingBefore: "x", familyBond: "" }, u1)).toThrow(/ชุมชนบำบัดเท่านั้น/);
    expect(() => saveGeneral(db, a, { housingBefore: "ก".repeat(5001), familyBond: "" }, u1)).toThrow(/ยาวเกิน/);
  });

  it("ส่วนที่ 3: เดือนที่ต้องบันทึก · 1 บันทึกต่อเดือน (ซ้ำ = แก้ไข) · เดือนนอกช่วงบันทึกไม่ได้", () => {
    const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, a)).get()!;
    const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get()!;
    expect(bookMonths(e, c, "2026-09-20")).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(bookMonths(e, c, "2027-06-01")).toEqual(["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]);
    expect(bookMonths({ ...e, leftDate: "2026-08-10" }, c, "2026-09-20")).toEqual(["2026-07", "2026-08"]);
    expect(periodLabel("2026-07")).toBe("กรกฎาคม 2569");

    const id1 = saveMonthlyNote(db, a, { period: "2026-07", text: "ปรับตัวได้ดี เข้าร่วมกิจกรรมครบ", noteDate: "2026-07-31" }, u1);
    const id2 = saveMonthlyNote(db, a, { period: "2026-07", text: "ปรับตัวได้ดี (แก้ไข)", noteDate: "2026-08-01" }, u2);
    expect(id2).toBe(id1);
    const notes = listNotes(db, a, "monthly");
    expect(notes.map((n) => [n.period, n.text, n.authorId, n.version])).toEqual([["2026-07", "ปรับตัวได้ดี (แก้ไข)", 1, 2]]);
    expect(() => saveMonthlyNote(db, a, { period: "2026-07", text: "ทับ", noteDate: "2026-08-01" }, u1, 1)).toThrow(/ถูกแก้ไขโดยผู้ใช้อื่น/);
    expect(() => saveMonthlyNote(db, a, { period: "2026-05", text: "นอกช่วง", noteDate: "2026-07-31" }, u1)).toThrow(/นอกช่วง/);
    expect(() => saveMonthlyNote(db, a, { period: "2026-13", text: "ผิด", noteDate: "2026-07-31" }, u1)).toThrow(/เดือนไม่ถูกต้อง/);
    expect(() => saveMonthlyNote(db, a, { period: "2026-07", text: " ", noteDate: "2026-07-31" }, u1)).toThrow(/พิมพ์ข้อความ/);
    expect(() => saveMonthlyNote(db, a, { period: "2026-07", text: "อนาคต", noteDate: "2099-01-01" }, u1)).toThrow(/อนาคต/);
    // บันทึกของคนอื่นไม่ปนกัน
    expect(listNotes(db, b, "monthly")).toEqual([]);
  });

  it("ข้อมูลช่วยเขียนของเดือน + แทรกสรุป: % เข้าร่วม (ไม่นับเหตุราชทัณฑ์) · คะแนนพฤติกรรมรายเดือน · บันทึกพฤติกรรม · เลื่อนระยะ", () => {
    const sessions = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().filter((s) => s.takesAttendance && s.date >= "2026-07-06" && s.date <= "2026-07-31").slice(0, 5);
    const st = ["present", "present", "present", "absent", "corrections"];
    sessions.forEach((s, i) => db.insert(schema.attendance).values({ sessionId: s.id, enrollmentId: a, status: st[i] }).run());
    const prog = db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, "PROG")).get()!;
    saveAssessment(db, { enrollmentId: a, formId: prog.id, round: "monthly", period: "2026-07", assessedDate: "2026-07-31", answers: all(def("PROG"), 4) }, { userId: 1, can });
    const inc = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, a)).get()!.incarcerationId;
    db.insert(schema.behaviorNotes).values({ enrollmentId: a, incarcerationId: inc, noteDate: "2026-07-15", tone: "positive", text: "ช่วยงานครัว" }).run();
    db.insert(schema.behaviorNotes).values({ enrollmentId: a, incarcerationId: inc, noteDate: "2026-07-20", tone: "negative", text: "มาสาย" }).run();
    db.insert(schema.behaviorNotes).values({ enrollmentId: a, incarcerationId: inc, noteDate: "2026-08-02", tone: "negative", text: "เดือนอื่น" }).run();
    advancePhase(db, { enrollmentIds: [a], toPhase: "rehab", date: "2026-07-20", note: "ผ่านการประเมิน" }, u1);

    const h = monthHelper(db, a, "2026-07");
    expect(h.attendance).toEqual({ counted: 4, present: 3, pct: 75, corrections: 1 });
    expect(h.progress).toEqual({ total: 108, level: "ดี" });
    expect([h.behavior.positive, h.behavior.negative, h.behavior.observe]).toEqual([1, 1, 0]);
    expect(h.phases).toEqual([{ phase: "rehab", date: "2026-07-20" }]);
    const text = helperSummary(h);
    expect(text).toContain("เข้าร่วมกิจกรรม 75% (3/4 ครั้ง ไม่นับเหตุราชทัณฑ์ 1 ครั้ง)");
    expect(text).toContain("คะแนนประเมินพฤติกรรมประจำเดือน 108 (ดี)");
    expect(text).toContain("เชิงบวก 1 ครั้ง เชิงลบ 1 ครั้ง");
    expect(text).toContain("เลื่อนเข้าระยะ 2. Rehabilitation");
    expect(helperSummary(monthHelper(db, b, "2026-07"))).toBe("");
  });

  it("ส่วนที่ 4: เขียนได้หลายครั้ง ล่าสุดก่อน · แก้/ลบได้เฉพาะของตนหรือผู้ดูแล", () => {
    const o1 = addCounselorOpinion(db, a, { text: "ควรฝึกการควบคุมอารมณ์", noteDate: "2026-07-20" }, u1);
    const o2 = addCounselorOpinion(db, a, { text: "มีความรับผิดชอบมากขึ้น", noteDate: "2026-08-20" }, u2);
    expect(listNotes(db, a, "counselor").map((n) => n.id)).toEqual([o2, o1]);
    expect(() => updateCounselorOpinion(db, o1, { text: "แก้ของคนอื่น", noteDate: "2026-07-20" }, u2)).toThrow(/เฉพาะความเห็นที่ตนเขียน/);
    updateCounselorOpinion(db, o1, { text: "ควรฝึกการควบคุมอารมณ์ต่อเนื่อง", noteDate: "2026-07-21" }, u1);
    updateCounselorOpinion(db, o2, { text: "ผู้ดูแลแก้ได้", noteDate: "2026-08-20" }, admin);
    expect(() => deleteCounselorOpinion(db, o2, u1)).toThrow(/เฉพาะความเห็นที่ตนเขียน/);
    deleteCounselorOpinion(db, o2, u2);
    expect(listNotes(db, a, "counselor").map((n) => [n.id, n.text])).toEqual([[o1, "ควรฝึกการควบคุมอารมณ์ต่อเนื่อง"]]);
    // บันทึกรายเดือนแก้ผ่านช่องทางความเห็นไม่ได้
    const m = saveMonthlyNote(db, a, { period: "2026-07", text: "บันทึกเดือน", noteDate: "2026-07-31" }, u1);
    expect(() => deleteCounselorOpinion(db, m, u1)).toThrow(/ไม่พบความเห็น/);
    expect(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "member_book_note")).all().length).toBe(6);
  });

  it("เตือนสิ้นเดือน: เดือนที่จบแล้วยังไม่เขียน · เดือนปัจจุบันเตือนเมื่อเหลือไม่เกิน 3 วัน", () => {
    expect(missingMonthlyNotes(db, cohortId, "2026-07-20")).toEqual([]);
    expect(missingMonthlyNotes(db, cohortId, "2026-07-29").map((x) => [x.enrollmentId, x.period])).toEqual([[a, "2026-07"], [b, "2026-07"]]);
    saveMonthlyNote(db, a, { period: "2026-07", text: "เขียนแล้ว", noteDate: "2026-07-30" }, u1);
    expect(missingMonthlyNotes(db, cohortId, "2026-08-15").map((x) => [x.enrollmentId, x.period])).toEqual([[b, "2026-07"]]);
    expect(missingMonthlyNotes(db, cohortId, "2026-09-10").length).toBe(3);
  });

  it("Rosenberg ฉบับ FAST เติมระยะการบำบัดและยาเสพติดหลักให้อัตโนมัติ · สรุปผลรายบุคคลก่อน/หลัง", () => {
    const form = (code: string) => db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, code)).get()!;
    const rose = saveAssessment(db, { enrollmentId: a, formId: form("ROSE").id, round: "pre", assessedDate: "2026-07-10", answers: all(def("ROSE"), 3) }, { userId: 1, can });
    expect(rose.result.details).toMatchObject({ phase: "entry", mainDrug: "meth" });
    advancePhase(db, { enrollmentIds: [a], toPhase: "rehab", date: "2026-07-20", note: "ผ่านการประเมิน" }, u1);
    const rose2 = saveAssessment(db, { enrollmentId: a, formId: form("ROSE").id, round: "post", assessedDate: "2026-08-10", answers: all(def("ROSE"), 3) }, { userId: 1, can });
    expect(rose2.result.details).toMatchObject({ phase: "rehab" });
    saveAssessment(db, { enrollmentId: a, formId: form("KNOW").id, round: "pre", assessedDate: "2026-07-08", answers: all(def("KNOW"), 1) }, { userId: 1, can });
    saveAssessment(db, { enrollmentId: a, formId: form("MOTIV").id, round: "pre", assessedDate: "2026-07-08", answers: { value: 2 } }, { userId: 1, can });
    const s = individualSummary(db, a);
    expect(s.knowledge.pre).toMatchObject({ date: "2026-07-08", total: 9 });
    expect([s.knowledge.post, s.attitude.pre, s.motivation.pre?.total, s.progress]).toEqual([null, null, 2, []]);
  });

  it("SCL-90-R ที่ปิดใช้งานไม่ขึ้นเป็นงานประเมินที่ต้องทำ · WHOQOL ขึ้น", () => {
    expect(listForms(db).map((f) => f.code)).not.toContain("SCL90");
    expect(db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, "SCL90")).get()!.active).toBe(false);
    const due = dueAssessments(db, cohortId, "2026-07-06").map((d) => d.formCode);
    expect(due).toContain("WHOQOL");
    expect(due).toContain("ROSE");
    expect(due).not.toContain("SCL90");
  });
});
