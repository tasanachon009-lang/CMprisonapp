import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { FORM_DEFS, defaultChannel } from "@/lib/assessments/forms";
import { scoreItems, type ItemsScoring, type Item } from "@/lib/assessments/scoring";
import { maxScore, individualPrePost } from "@/lib/assessments/prepost";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveAssessment, getForm } from "@/lib/services/assessments";

const def = (code: string) => FORM_DEFS.find((f) => f.code === code)!;

describe("เนื้อหาแบบประเมินตามแบบฟอร์มจริง (docs/forms/source)", () => {
  it("ไม่เหลือข้อความตัวยึด \"ข้อ n (พิมพ์…)\"", () => {
    for (const f of FORM_DEFS) for (const it of f.items) expect(it.text).not.toMatch(/พิมพ์ข้อความ/);
  });
  it("จำนวนข้อ: PMHQ 24 · คัดกรองโรคจิต 11 (คนใกล้ชิด 8 + ผู้ป่วย 3) · ความรู้ 15 · ทัศนคติ 21 · ความก้าวหน้า 27 ข้อ 10 ด้าน", () => {
    expect(def("PMHQ").items.length).toBe(24);
    const psy = def("PSY").items;
    expect([psy.length, psy.filter((i) => i.group === "จากสัมภาษณ์คนใกล้ชิด").length, psy.filter((i) => i.group === "จากสัมภาษณ์ผู้ป่วย").length]).toEqual([11, 8, 3]);
    expect(psy.every((i) => i.help && i.help.length > 10)).toBe(true);
    expect(def("KNOW").items.length).toBe(15);
    expect(def("ATT").items.length).toBe(21);
    const prog = def("PROG").items;
    expect(prog.length).toBe(27);
    expect(new Set(prog.map((i) => i.group)).size).toBe(10);
    expect(prog[0].label).toBe("1.1");
    expect(prog[26].label).toBe("10.3");
  });
  it("ความรู้: เฉลยข้อถูก 1,2,4,7,8,11,12,13,15 · ตอบถูกทุกข้อได้ 15", () => {
    const f = def("KNOW");
    expect(f.items.filter((i) => i.correct).map((i) => i.no)).toEqual([1, 2, 4, 7, 8, 11, 12, 13, 15]);
    const perfect = Object.fromEntries(f.items.map((i) => [String(i.no), i.correct ? 1 : 0]));
    expect(scoreItems(f.items, f.scoring as unknown as ItemsScoring, perfect).total).toBe(15);
  });
  it("ทัศนคติ: ป้าย มากที่สุด…น้อยที่สุด · ข้อ (−) กลับคะแนน · ตอบดีที่สุดได้ 105 = ระดับสูง", () => {
    const f = def("ATT");
    const s = f.scoring as unknown as ItemsScoring;
    expect(s.options.map((o) => o.label)).toEqual(["มากที่สุด", "มาก", "ปานกลาง", "น้อย", "น้อยที่สุด"]);
    expect(f.items.filter((i) => i.reverse).map((i) => i.no)).toEqual([1, 2, 7, 8, 9, 12, 13, 15, 16, 17]);
    const best = Object.fromEntries(f.items.map((i) => [String(i.no), i.reverse ? 1 : 5]));
    expect(scoreItems(f.items, s, best)).toMatchObject({ total: 105, level: "สูง" });
  });
  it("PMHQ: ป้าย ไม่เลย/บางครั้ง/ค่อนข้างบ่อย/บ่อยมาก · ≥ 29 มีปัญหา", () => {
    const f = def("PMHQ");
    const s = f.scoring as unknown as ItemsScoring;
    expect(s.options.map((o) => o.label)).toEqual(["ไม่เลย", "บางครั้ง", "ค่อนข้างบ่อย", "บ่อยมาก"]);
    const a = Object.fromEntries(f.items.map((i) => [String(i.no), i.no <= 14 ? 2 : 0])); // 28
    expect(scoreItems(f.items, s, a).level).toBe("ปกติ");
    a["24"] = 1;
    expect(scoreItems(f.items, s, a).level).toBe("มีปัญหาสุขภาพจิต");
  });
  it("ช่องทางเริ่มต้น: แบบที่ผู้ต้องขังตอบเอง = กระดาษ / แบบสัมภาษณ์ = ทำในระบบ", () => {
    expect(["PMHQ", "KNOW", "ATT", "MOTIV", "TEMP"].map(defaultChannel)).toEqual(Array(5).fill("paper"));
    expect(["DEP", "PSY", "COND", "PROG", "FIT"].map(defaultChannel)).toEqual(Array(5).fill("system"));
  });
  it("คะแนนเต็มสำหรับกราฟ", () => {
    expect(maxScore("items", def("ATT").items, def("ATT").scoring)).toBe(105);
    expect(maxScore("items", def("KNOW").items, def("KNOW").scoring)).toBe(15);
    expect(maxScore("items", def("PROG").items, def("PROG").scoring)).toBe(135);
    expect(maxScore("single", [], def("TEMP").scoring)).toBe(10);
    expect(maxScore("condition", [], {})).toBeNull();
  });
});

describe("อัปเดตเนื้อหาให้ฐานข้อมูลที่ติดตั้งแล้ว", () => {
  let db: DB;
  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
  });
  const latestOf = (code: string) => {
    const form = db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, code)).get()!;
    return db.select().from(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.formId, form.id)).orderBy(desc(schema.assessmentFormVersions.version)).get()!;
  };
  const makeOld = (code: string, note: string) => {
    const form = db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, code)).get()!;
    db.delete(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.formId, form.id)).run();
    db.insert(schema.assessmentFormVersions).values({ formId: form.id, version: 1, items: [{ no: 1, text: "ข้อ 1 (พิมพ์ข้อความจากคู่มือ)" }], scoring: def(code).scoring, effectiveFrom: "2000-01-01", note }).run();
  };

  it("เวอร์ชันค่าเริ่มต้นเดิม → สร้างเวอร์ชันใหม่ที่มีข้อความจริง (ทำซ้ำได้ ไม่สร้างซ้ำ)", () => {
    bootstrapReferenceData(db);
    makeOld("KNOW", "ค่าเริ่มต้นจากสเปก");
    bootstrapReferenceData(db);
    bootstrapReferenceData(db);
    const v = latestOf("KNOW");
    expect(v.version).toBe(2);
    expect((v.items as Item[])[0].text).toBe("การใช้ยาเสพติดมีผลกับสมองส่วนคิดและสมองส่วนอยาก");
    expect(v.effectiveFrom).toBe("2000-01-01");
  });
  it("ผู้ดูแลแก้แบบเองแล้ว → ไม่ทับ", () => {
    bootstrapReferenceData(db);
    makeOld("ATT", "ใส่ข้อความตามคู่มือปี 2569");
    bootstrapReferenceData(db);
    expect(latestOf("ATT").version).toBe(1);
  });
});

describe("ช่องทางการกรอก + กราฟรายบุคคลแยกการลงทะเบียน", () => {
  it("บันทึกช่องทาง/ที่เก็บกระดาษ · ทำในระบบไม่เก็บที่เก็บกระดาษ · กราฟไม่รวมข้ามการลงทะเบียน", () => {
    const db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    const c = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, 1);
    const reg = (no: string) => registerEnrollment(db, { cohortId: c.id, person: { firstName: "ทดสอบ", lastName: no, nationalId: null }, incarceration: { inmateNo: no }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01" }, { userId: 1, canOverride: false, consentRequired: true }).enrollment.id;
    const e1 = reg("X-1"), e2 = reg("X-2");
    const temp = getForm(db, "TEMP")!;
    const actor = { userId: 1, can: (() => true) as never };
    saveAssessment(db, { enrollmentId: e1, formId: temp.id, round: "pre", assessedDate: "2026-09-01", answers: { value: 4 }, paperLocation: "แฟ้มรุ่น ช่อง 1" }, actor);
    saveAssessment(db, { enrollmentId: e1, formId: temp.id, round: "post", assessedDate: "2026-09-12", answers: { value: 8 }, channel: "system", paperLocation: "ไม่ควรเก็บ" }, actor);
    saveAssessment(db, { enrollmentId: e2, formId: temp.id, round: "pre", assessedDate: "2026-09-01", answers: { value: 2 } }, actor);
    const rows = db.select().from(schema.assessmentResults).all();
    expect(rows.find((r) => r.round === "pre" && r.enrollmentId === e1)).toMatchObject({ channel: "paper", paperLocation: "แฟ้มรุ่น ช่อง 1" });
    expect(rows.find((r) => r.round === "post")).toMatchObject({ channel: "system", paperLocation: null });
    const results = rows.map((r) => ({ r, f: { id: temp.id, shortName: temp.shortName, kind: temp.kind, sortOrder: temp.sortOrder } }));
    const max = new Map([[temp.id, 10]]);
    expect(individualPrePost(results, e1, max)).toEqual([{ label: "อุณหภูมิใจ", max: 10, pre: 4, post: 8, preN: 1, postN: 1 }]);
    expect(individualPrePost(results, e2, max)[0]).toMatchObject({ pre: 2, post: null });
    expect(() => saveAssessment(db, { enrollmentId: e2, formId: temp.id, round: "post", assessedDate: "2026-09-12", answers: { value: 5 }, channel: "fax" }, actor)).toThrow(/ช่องทาง/);
  });
});
