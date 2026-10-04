import { describe, it, expect } from "vitest";
import { scoreDepression, depressionStage, scoreItems, bmi, scoreCondition, q8Guidance, type ItemsScoring } from "@/lib/assessments/scoring";
import { FORM_DEFS } from "@/lib/assessments/forms";
import { computeResult } from "@/lib/assessments/compute";

const def = (code: string) => FORM_DEFS.find((f) => f.code === code)!;
const all = (n: number, v: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [String(i + 1), v]));

describe("2Q → 9Q → 8Q", () => {
  it("2Q ไม่มีทั้งคู่ = ปกติ จบ", () => {
    expect(depressionStage({ q2: [false, false] })).toBe("done");
    const r = scoreDepression({ q2: [false, false] });
    expect(r.tone).toBe("ok");
    expect(r.alerts).toEqual([]);
  });
  it("2Q มีข้อใด → ต้องทำ 9Q", () => {
    expect(depressionStage({ q2: [true, false] })).toBe("9q");
  });
  it("9Q < 7 จบที่ 9Q", () => {
    const r = scoreDepression({ q2: [true, false], q9: [1, 1, 1, 1, 1, 1, 0, 0, 0] });
    expect(r.total).toBe(6);
    expect(r.tone).toBe("ok");
  });
  it("9Q ≥ 7 → ต้องทำ 8Q; ≥ 13 เตือนส่งพบจิตแพทย์", () => {
    const q9 = [2, 2, 2, 2, 2, 2, 1, 0, 0]; // 13
    expect(depressionStage({ q2: [true, true], q9 })).toBe("8q");
    const r = scoreDepression({ q2: [true, true], q9, q8: [false, false, false, false, false, false, false, false] });
    expect(r.total).toBe(13);
    expect(r.alerts.some((a) => a.message.includes("จิตแพทย์"))).toBe(true);
    expect(r.details.q8).toBe(0);
  });
  it("8Q ข้อ 3 มี → ต้องถามควบคุมได้ไหม; ไม่ได้ +8", () => {
    const base = { q2: [true, true] as [boolean, boolean], q9: [1, 1, 1, 1, 1, 1, 1, 0, 0] };
    const q8 = [true, false, true, false, false, false, false, false];
    expect(depressionStage({ ...base, q8 })).toBe("8q");
    expect(scoreDepression({ ...base, q8, q8control: true }).details.q8).toBe(7); // 1+6
    const r = scoreDepression({ ...base, q8, q8control: false });
    expect(r.details.q8).toBe(15); // 1+6+8
    expect(r.alerts.find((a) => a.message.startsWith("8Q"))?.severity).toBe("warning");
  });
  it("8Q ≥ 17 = แจ้งเตือนเร่งด่วนสีแดง", () => {
    const r = scoreDepression({ q2: [true, true], q9: [3, 3, 3, 0, 0, 0, 0, 0, 0], q8: [true, true, true, true, false, false, false, false], q8control: true });
    expect(r.details.q8).toBe(17);
    expect(r.alerts.some((a) => a.severity === "danger")).toBe(true);
    expect(q8Guidance(17)).toContain("ทันที");
  });
});

describe("แบบรายข้อ", () => {
  it("PMHQ: 0–28 ปกติ / ≥ 29 มีปัญหา + แจ้งเตือน", () => {
    const f = def("PMHQ");
    expect(computeResult("items", f.items, f.scoring, { ...all(24, 1), "1": 3, "2": 3 }).level).toBe("ปกติ"); // 28
    const r = computeResult("items", f.items, f.scoring, { ...all(24, 1), "1": 3, "2": 3, "3": 2 }); // 29
    expect(r.level).toBe("มีปัญหาสุขภาพจิต");
    expect(r.alerts.length).toBe(1);
  });
  it("ความรู้ 15 ข้อ: นับข้อที่ตอบตรงเฉลย", () => {
    const f = def("KNOW");
    const perfect = Object.fromEntries(f.items.map((i) => [String(i.no), i.correct ? 1 : 0]));
    expect(computeResult("items", f.items, f.scoring, perfect).total).toBe(15);
    expect(computeResult("items", f.items, f.scoring, all(15, 1)).total).toBe(9); // ตอบ "ถูก" ทุกข้อ ได้เฉพาะข้อที่เฉลยว่าถูก
  });
  it("ทัศนคติ 21 ข้อ: ข้อเชิงลบกลับคะแนน", () => {
    const f = def("ATT");
    // ตอบ 5 ทุกข้อ: ข้อบวก 11 ข้อ ×5 = 55 + ข้อลบ 10 ข้อ ×1 = 10 → 65 ปานกลาง
    const r = computeResult("items", f.items, f.scoring, all(21, 5));
    expect(r.total).toBe(65);
    expect(r.level).toBe("ปานกลาง");
  });
  it("ความก้าวหน้า: 99 = ปานกลาง, 100 = ดี (ไม่ซ้อนกัน)", () => {
    const f = def("PROG");
    const a = all(27, 4); // 108
    expect(computeResult("items", f.items, f.scoring, a).level).toBe("ดี");
    const b = { ...all(27, 4), "1": 1, "2": 1, "3": 1 }; // 108-9 = 99
    expect(computeResult("items", f.items, f.scoring, b).level).toBe("ปานกลาง");
  });
  it("ค่านอกช่วง/ตอบไม่ครบ → ไม่คิดผล", () => {
    const s: ItemsScoring = { method: "sum", options: [{ value: 0, label: "0" }, { value: 1, label: "1" }], bands: [] };
    const items = [{ no: 1, text: "" }, { no: 2, text: "" }];
    expect(scoreItems(items, s, { "1": 5, "2": 1 }).errors[0]).toContain("นอกช่วง");
    expect(scoreItems(items, s, { "1": 1 }).errors[0]).toContain("ยังไม่ได้ตอบ 1 ข้อ");
  });
});

describe("อื่นๆ", () => {
  it("BMI", () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(null, 175)).toBeNull();
  });
  it("สภาวะกาย/จิต: ยังเข้าร่วมไม่ได้ → แจ้งเตือน", () => {
    expect(scoreCondition({ opinion: "unfit", unfitReasons: ["psych"] }).tone).toBe("danger");
    expect(scoreCondition({ opinion: "fit" }).alerts).toEqual([]);
  });
});
