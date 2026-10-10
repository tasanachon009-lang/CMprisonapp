import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveAssessment, dueAssessments } from "@/lib/services/assessments";
import { FORM_DEFS, defaultChannel, formsFor, type FormDef } from "@/lib/assessments/forms";
import { scoreItems, type ItemsScoring } from "@/lib/assessments/scoring";

const def = (code: string) => FORM_DEFS.find((x) => x.code === code)!;
const scoringOf = (f: FormDef) => f.scoring as unknown as ItemsScoring;
/** ตอบทุกข้อด้วยค่าเดียว (ค่าบนกระดาษ ก่อนกลับคะแนน) */
const all = (f: FormDef, v: number) => Object.fromEntries(f.items.map((i) => [String(i.no), v]));
/** ให้ได้คะแนนจริงทุกข้อ = p (กลับค่าให้ข้อเชิงลบ) */
const scoreEach = (f: FormDef, p: number) => Object.fromEntries(f.items.map((i) => [String(i.no), i.reverse ? 5 - p : p]));
/** คำตอบที่ได้คะแนนรวม = total (เริ่มจากทุกข้อได้ 1 แล้วเพิ่มทีละ 1 คะแนนจริง) */
function answersFor(f: FormDef, total: number) {
  const pts = f.items.map(() => 1);
  for (let extra = total - 10, i = 0; extra > 0; i = (i + 1) % 10) if (pts[i] < 4) { pts[i]++; extra--; }
  return Object.fromEntries(f.items.map((it, i) => [String(it.no), it.reverse ? 5 - pts[i] : pts[i]]));
}
function expectContiguous(s: ItemsScoring) {
  const bands = [...s.bands].sort((a, b) => a.min - b.min);
  expect(bands[0].min).toBe(10);
  expect(bands.at(-1)!.max).toBe(40);
  for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBe(bands[i - 1].max + 1);
}

describe("Rosenberg 2 ฉบับ แยกกันในคลัง (สเปก 16B)", () => {
  it("3 วันใช้ ROSE3 เท่านั้น · ชุมชนบำบัดใช้ ROSE เท่านั้น · 12 วันไม่ใช้ · กรอกจากกระดาษทั้งคู่", () => {
    for (const round of ["pre", "post"]) {
      const pre3 = formsFor("PRE3", round).map((x) => x.code);
      expect(pre3).toContain("ROSE3");
      expect(pre3).not.toContain("ROSE");
      const fast = formsFor("FAST", round).map((x) => x.code);
      expect(fast).toContain("ROSE");
      expect(fast).not.toContain("ROSE3");
      expect(formsFor("B12", round).map((x) => x.code).filter((c) => c.startsWith("ROSE"))).toEqual([]);
    }
    expect(defaultChannel("ROSE")).toBe("paper");
    expect(defaultChannel("ROSE3")).toBe("paper");
    expect(def("ROSE").sensitive).toBe(false);
    expect(def("ROSE3").sensitive).toBe(false);
  });

  it("ต่างกันเฉพาะข้อ 8 (ข้อความและทิศทางคะแนน)", () => {
    const a = def("ROSE"), b = def("ROSE3");
    expect(a.items.length).toBe(10);
    expect(b.items.length).toBe(10);
    expect(b.items[7].text).toBe("ฉันอยากจะภาคภูมิใจในตัวเองมากกว่านี้");
    expect(a.items[7].text).not.toBe(b.items[7].text);
    for (const i of [0, 1, 2, 3, 4, 5, 6, 8, 9]) expect([b.items[i].text, !!b.items[i].reverse]).toEqual([a.items[i].text, !!a.items[i].reverse]);
  });
});

describe("Rosenberg ฉบับ 3 วัน (ROSE3 — กรมราชทัณฑ์)", () => {
  const f = def("ROSE3"), s = scoringOf(f);

  it("กลับคะแนนข้อ 2,5,6,8,9", () => {
    expect(f.items.filter((i) => i.reverse).map((i) => i.no)).toEqual([2, 5, 6, 8, 9]);
    // ตอบ "เห็นด้วยอย่างยิ่ง" (4) ทุกข้อ: บวก 5 ข้อ × 4 + ลบ 5 ข้อ × 1 = 25
    expect(scoreItems(f.items, s, all(f, 4)).total).toBe(25);
    expect(scoreItems(f.items, s, all(f, 1)).total).toBe(25);
    // ข้อ 8 "เห็นด้วยอย่างยิ่ง" ได้ 1 คะแนน (ฉบับ FAST ได้ 4)
    const only8 = { ...scoreEach(f, 4), "8": 4 };
    expect(scoreItems(f.items, s, only8).total).toBe(37);
  });

  it("ช่วง 10–40 แปลผล 3 ระดับ: 10–20 ต่ำ / 21–30 ปานกลาง / 31–40 สูง", () => {
    const cases: Array<[number, string]> = [[10, "ต่ำ"], [20, "ต่ำ"], [21, "ปานกลาง"], [30, "ปานกลาง"], [31, "สูง"], [40, "สูง"]];
    for (const [total, label] of cases) {
      const r = scoreItems(f.items, s, answersFor(f, total));
      expect([r.total, r.level]).toEqual([total, label]);
    }
    expect(s.bands.length).toBe(3);
    expectContiguous(s);
  });

  it("ตอบไม่ครบหรือค่านอกช่วง ไม่คิดคะแนน", () => {
    const partial = scoreEach(f, 3);
    delete partial["10"];
    expect(scoreItems(f.items, s, partial).total).toBeNull();
    expect(scoreItems(f.items, s, { ...scoreEach(f, 3), "1": 5 }).errors[0]).toMatch(/นอกช่วง/);
  });
});

describe("Rosenberg ฉบับชุมชนบำบัด FAST (ROSE — แบบฟอร์มจริง ภาพ 10–11)", () => {
  const f = def("ROSE"), s = scoringOf(f);

  it("ข้อเชิงลบ 2,5,6,9 (ข้อ 8 เชิงบวก) · เห็นด้วยอย่างยิ่ง: บวก = 4 ลบ = 1", () => {
    expect(f.items.filter((i) => i.reverse).map((i) => i.no)).toEqual([2, 5, 6, 9]);
    expect(f.items[7].reverse).toBe(false);
    // ตอบ 4 ทุกข้อ: บวก 6 ข้อ × 4 + ลบ 4 ข้อ × 1 = 28 · ตอบ 1 ทุกข้อ: 6 × 1 + 4 × 4 = 22
    expect(scoreItems(f.items, s, all(f, 4)).total).toBe(28);
    expect(scoreItems(f.items, s, all(f, 1)).total).toBe(22);
  });

  it("แปลผล 6 ระดับตรงขอบทุกช่วง พร้อมแนวทางการจัดการ", () => {
    const cases: Array<[number, string]> = [[10, "ต่ำมาก"], [14, "ต่ำมาก"], [15, "ต่ำ"], [19, "ต่ำ"], [20, "ค่อนข้างต่ำ"], [24, "ค่อนข้างต่ำ"], [25, "ปานกลาง"], [29, "ปานกลาง"], [30, "สูง"], [34, "สูง"], [35, "สูงมาก"], [40, "สูงมาก"]];
    for (const [total, label] of cases) {
      const r = scoreItems(f.items, s, answersFor(f, total));
      expect([r.total, r.level]).toEqual([total, label]);
      expect(typeof r.details.guidance).toBe("string");
    }
    expectContiguous(s);
  });

  it("ต่ำ/ต่ำมาก แจ้งเตือน · ระดับอื่นไม่แจ้ง", () => {
    expect(scoreItems(f.items, s, scoreEach(f, 1)).alerts.length).toBe(1);
    expect(scoreItems(f.items, s, scoreEach(f, 3)).alerts.length).toBe(0);
  });
});

describe("อัปเกรดฐานข้อมูลที่ติดตั้งก่อนแยก Rosenberg 2 ฉบับ", () => {
  it("ROSE ย้ายไปชุมชนบำบัด · ผลฉบับเก่าของรุ่น 3 วันถูกซ่อน · งานประเมินของ 3 วันเป็น ROSE3 · ทำครั้งเดียว", () => {
    const db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    const form = (code: string) => db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, code)).get()!;
    const live = (formId: number) => db.select().from(schema.assessmentResults).where(and(eq(schema.assessmentResults.formId, formId), isNull(schema.assessmentResults.deletedAt))).all();
    const can = (() => true) as never;

    // จำลองสภาพก่อนแยก: ROSE ผูกกับ 3 วัน และมีผลที่บันทึกด้วยฉบับเก่า
    db.update(schema.assessmentForms).set({ courseCodes: ["PRE3"] }).where(eq(schema.assessmentForms.code, "ROSE")).run();
    db.delete(schema.settings).where(eq(schema.settings.key, "bootstrap.rose3")).run();
    const pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!;
    const cohort = createCohort(db, { courseId: pre3.id, startDate: "2026-10-05" }, 1);
    const enr = registerEnrollment(db, {
      cohortId: cohort.id, person: { firstName: "ทดสอบ", lastName: "โรเซนเบิร์ก", nationalId: null }, incarceration: { inmateNo: "T-ROSE-1" },
      confirmAdmission: false, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true,
    }, { userId: 1, canOverride: false, consentRequired: false });
    const enrollmentId = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, cohort.id)).get()!.id;
    expect(enr).toBeTruthy();
    saveAssessment(db, { enrollmentId, formId: form("ROSE").id, round: "pre", assessedDate: "2026-10-05", answers: scoreEach(def("ROSE"), 3) }, { userId: 1, can });
    expect(live(form("ROSE").id).length).toBe(1);

    bootstrapReferenceData(db);
    expect(form("ROSE").courseCodes).toEqual(["FAST"]);
    expect(form("ROSE3").courseCodes).toEqual(["PRE3"]);
    expect(live(form("ROSE").id).length).toBe(0);
    const due = dueAssessments(db, cohort.id, "2026-10-05").map((d) => d.formCode);
    expect(due).toContain("ROSE3");
    expect(due).not.toContain("ROSE");

    // ประเมินใหม่ด้วยฉบับ 3 วัน: คะแนนจริงข้อละ 3 = 30 → ปานกลาง (3 ระดับ)
    const r = saveAssessment(db, { enrollmentId, formId: form("ROSE3").id, round: "pre", assessedDate: "2026-10-05", answers: scoreEach(def("ROSE3"), 3) }, { userId: 1, can });
    expect([r.result.total, r.result.level]).toEqual([30, "ปานกลาง"]);

    // รันซ้ำ: ไม่ทับค่าที่ผู้ดูแลตั้งเองภายหลัง
    db.update(schema.assessmentForms).set({ courseCodes: ["FAST", "B12"] }).where(eq(schema.assessmentForms.code, "ROSE")).run();
    bootstrapReferenceData(db);
    expect(form("ROSE").courseCodes).toEqual(["FAST", "B12"]);
    expect(live(form("ROSE3").id).length).toBe(1);
  });
});
