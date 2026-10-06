import { describe, it, expect } from "vitest";
import { FORM_DEFS, defaultChannel, formsFor } from "@/lib/assessments/forms";
import { scoreItems, type ItemsScoring } from "@/lib/assessments/scoring";

const f = FORM_DEFS.find((x) => x.code === "ROSE")!;
const s = f.scoring as unknown as ItemsScoring;
/** ตอบทุกข้อด้วยค่าเดียว (ค่าบนกระดาษ ก่อนกลับคะแนน) */
const all = (v: number) => Object.fromEntries(f.items.map((i) => [String(i.no), v]));
/** ให้ได้คะแนนจริงทุกข้อ = p (กลับค่าให้ข้อเชิงลบ) */
const scoreEach = (p: number) => Object.fromEntries(f.items.map((i) => [String(i.no), i.reverse ? 5 - p : p]));

describe("Rosenberg Self-Esteem (ขั้น 4 — แบบฟอร์มจริง ภาพ 10–11)", () => {
  it("10 ข้อ · ข้อเชิงลบ 2,5,6,9 (ข้อ 8 เชิงบวกตามแบบจริง) · หลักสูตร 3 วัน ก่อน/หลัง · กรอกจากกระดาษ", () => {
    expect(f.items.length).toBe(10);
    expect(f.items.filter((i) => i.reverse).map((i) => i.no)).toEqual([2, 5, 6, 9]);
    expect(f.items[7].reverse).toBe(false);
    expect(formsFor("PRE3", "pre").map((x) => x.code)).toContain("ROSE");
    expect(formsFor("PRE3", "post").map((x) => x.code)).toContain("ROSE");
    expect(formsFor("B12", "pre").map((x) => x.code)).not.toContain("ROSE");
    expect(defaultChannel("ROSE")).toBe("paper");
    expect(f.sensitive).toBe(false);
  });

  it("ข้อเชิงบวก เห็นด้วยอย่างยิ่ง = 4 · ข้อเชิงลบ เห็นด้วยอย่างยิ่ง = 1", () => {
    // ตอบ "เห็นด้วยอย่างยิ่ง" (4) ทุกข้อ: บวก 6 ข้อ × 4 + ลบ 4 ข้อ × 1 = 28
    expect(scoreItems(f.items, s, all(4)).total).toBe(28);
    // ตอบ "ไม่เห็นด้วยอย่างยิ่ง" (1) ทุกข้อ: 6 × 1 + 4 × 4 = 22
    expect(scoreItems(f.items, s, all(1)).total).toBe(22);
  });

  it("ช่วง 10–40 และแปลผล 6 ระดับตรงขอบทุกช่วง พร้อมแนวทางการจัดการ", () => {
    expect(scoreItems(f.items, s, scoreEach(4)).total).toBe(40);
    expect(scoreItems(f.items, s, scoreEach(1)).total).toBe(10);
    const cases: Array<[number, string]> = [[10, "ต่ำมาก"], [14, "ต่ำมาก"], [15, "ต่ำ"], [19, "ต่ำ"], [20, "ค่อนข้างต่ำ"], [24, "ค่อนข้างต่ำ"], [25, "ปานกลาง"], [29, "ปานกลาง"], [30, "สูง"], [34, "สูง"], [35, "สูงมาก"], [40, "สูงมาก"]];
    for (const [total, label] of cases) {
      // เริ่มจากทุกข้อได้ 1 แล้วเพิ่มทีละ 1 คะแนนจริง
      const pts = f.items.map(() => 1);
      for (let extra = total - 10, i = 0; extra > 0; i = (i + 1) % 10) if (pts[i] < 4) { pts[i]++; extra--; }
      const ans = Object.fromEntries(f.items.map((it, i) => [String(it.no), it.reverse ? 5 - pts[i] : pts[i]]));
      const r = scoreItems(f.items, s, ans);
      expect([r.total, r.level]).toEqual([total, label]);
      expect(typeof r.details.guidance).toBe("string");
    }
    // ไม่มีช่องว่าง/ซ้อนระหว่างช่วง
    const bands = [...s.bands].sort((a, b) => a.min - b.min);
    expect(bands[0].min).toBe(10);
    expect(bands.at(-1)!.max).toBe(40);
    for (let i = 1; i < bands.length; i++) expect(bands[i].min).toBe(bands[i - 1].max + 1);
  });

  it("ต่ำ/ต่ำมาก แจ้งเตือน · ระดับอื่นไม่แจ้ง · ตอบไม่ครบหรือค่านอกช่วง ไม่คิดคะแนน", () => {
    expect(scoreItems(f.items, s, scoreEach(1)).alerts.length).toBe(1);
    expect(scoreItems(f.items, s, scoreEach(3)).alerts.length).toBe(0);
    const partial = scoreEach(3);
    delete partial["10"];
    expect(scoreItems(f.items, s, partial).total).toBeNull();
    expect(scoreItems(f.items, s, { ...scoreEach(3), "1": 5 }).errors[0]).toMatch(/นอกช่วง/);
  });
});
