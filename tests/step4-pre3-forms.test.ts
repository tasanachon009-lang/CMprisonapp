import { describe, it, expect } from "vitest";
import { FORM_DEFS, formsFor, defaultChannel, isPendingReview, STATUS_SHORT, type FormDef } from "@/lib/assessments/forms";
import { scoreItems, type ItemsScoring } from "@/lib/assessments/scoring";
import { itemDistribution, radarPoints } from "@/lib/assessments/distribution";

const def = (code: string) => FORM_DEFS.find((x) => x.code === code)!;
const sc = (f: FormDef) => f.scoring as unknown as ItemsScoring;
const all = (f: FormDef, v: number) => Object.fromEntries(f.items.map((i) => [String(i.no), v]));

describe("แบบประเมินหลักสูตร 3 วันที่ทำตามสเปก 17 (รอตรวจกับแบบจริง)", () => {
  it("3 วันมี: Rosenberg ฉบับ 3 วัน (ก่อน/หลัง) · ทบทวนสถานภาพ (ก่อน) · ความเครียด และความพึงพอใจ (หลัง) — ไม่ใช้กับหลักสูตรอื่น", () => {
    expect(formsFor("PRE3", "pre").map((f) => f.code).sort()).toEqual(["ROSE3", "STATUS"]);
    expect(formsFor("PRE3", "post").map((f) => f.code).sort()).toEqual(["ROSE3", "SAT3", "STRESS"]);
    for (const c of ["B12", "FAST"]) for (const r of ["pre", "post"]) expect(formsFor(c, r).map((f) => f.code).filter((x) => ["STATUS", "STRESS", "SAT3"].includes(x))).toEqual([]);
    for (const c of ["ROSE3", "STATUS", "STRESS", "SAT3"]) { expect(isPendingReview(c)).toBe(true); expect(def(c).sensitive).toBe(false); }
    expect(isPendingReview("ROSE")).toBe(false);
    // ผู้ต้องขังตอบบนกระดาษ: ความเครียด/ความพึงพอใจ · เจ้าหน้าที่ทำในระบบ: ทบทวนสถานภาพ (สเปก 10.1)
    expect([defaultChannel("STRESS"), defaultChannel("SAT3"), defaultChannel("STATUS")]).toEqual(["paper", "paper", "system"]);
  });

  it("ทบทวนสถานภาพ: 11 ด้านตามสเปก · ค่า −10/−5/0/+5/+10 · รวม −110 ถึง +110 · ไม่ติดป้ายระดับ", () => {
    const f = def("STATUS"), s = sc(f);
    expect(f.items.map((i) => i.text)).toEqual(["อาชีพ", "เพื่อน", "ครอบครัว", "สัมพันธภาพ", "การควบคุมตนเองเมื่ออยากยา", "การควบคุมตนเองเมื่ออยากเหล้า", "คุณค่าในตนเอง", "สุขภาพกาย", "สุขภาพจิต", "ความพึงพอใจทางเพศ", "ความพึงพอใจในชีวิต"]);
    expect(STATUS_SHORT.length).toBe(11);
    expect(s.options.map((o) => o.value)).toEqual([-10, -5, 0, 5, 10]);
    expect(scoreItems(f.items, s, all(f, -10)).total).toBe(-110);
    expect(scoreItems(f.items, s, all(f, 10)).total).toBe(110);
    const mixed = scoreItems(f.items, s, { ...all(f, 0), "1": 10, "2": -5 });
    expect([mixed.total, mixed.level, mixed.errors]).toEqual([5, null, []]);
    expect(scoreItems(f.items, s, { ...all(f, 0), "3": 7 }).errors[0]).toMatch(/นอกช่วง/);
    const partial = all(f, 5);
    delete partial["11"];
    expect(scoreItems(f.items, s, partial).total).toBeNull();
  });

  it("รับรู้ความเครียด: อาการ 11 ข้อ · มี ≥ 2 ข้อ = ควรได้รับการลดความเครียด", () => {
    const f = def("STRESS"), s = sc(f);
    expect(f.items.length).toBe(11);
    const yes = (n: number) => Object.fromEntries(f.items.map((i) => [String(i.no), i.no <= n ? 1 : 0]));
    expect(scoreItems(f.items, s, yes(0)).level).toBe("ไม่ถึงเกณฑ์");
    expect(scoreItems(f.items, s, yes(1)).level).toBe("ไม่ถึงเกณฑ์");
    expect([scoreItems(f.items, s, yes(2)).total, scoreItems(f.items, s, yes(2)).level]).toEqual([2, "ควรได้รับการลดความเครียด"]);
    expect(scoreItems(f.items, s, yes(11)).level).toBe("ควรได้รับการลดความเครียด");
    // ไม่ใช่ข้อมูลสุขภาพ และไม่ส่งแจ้งเตือน (สเปกกำหนดเพียงป้าย)
    expect(scoreItems(f.items, s, yes(11)).alerts).toEqual([]);
  });

  it("ความพึงพอใจ: 9 ข้อ = วิทยากร 3 · สถานที่ 4 · ความเข้าใจ 2 · คะแนน 1–5", () => {
    const f = def("SAT3"), s = sc(f);
    const groups = f.items.reduce<Record<string, number>>((m, i) => ({ ...m, [i.group!]: (m[i.group!] ?? 0) + 1 }), {});
    expect(Object.values(groups)).toEqual([3, 4, 2]);
    expect(s.options.map((o) => o.value).sort()).toEqual([1, 2, 3, 4, 5]);
    expect([scoreItems(f.items, s, all(f, 1)).total, scoreItems(f.items, s, all(f, 5)).total]).toEqual([9, 45]);
  });
});

describe("จำนวนคนต่อคะแนนต่อข้อ และกราฟเรดาร์", () => {
  const f = def("SAT3"), s = sc(f);

  it("นับจำนวนคนต่อคะแนนต่อข้อ · ผลรวมทุกข้อ = จำนวนผู้ตอบ · ค่าเฉลี่ยรายข้อ", () => {
    const d = itemDistribution(f.items, s.options, [all(f, 5), all(f, 4), { ...all(f, 3), "1": 5 }, null, {}]);
    expect(d.respondents).toBe(3); // ชุดว่าง/ไม่มีคำตอบ ไม่นับเป็นผู้ตอบ
    expect(d.rows[0].counts).toEqual({ "5": 2, "4": 1, "3": 0, "2": 0, "1": 0 });
    expect(d.rows[1].counts).toEqual({ "5": 1, "4": 1, "3": 1, "2": 0, "1": 0 });
    expect([d.rows[0].n, d.rows[0].mean, d.rows[1].mean]).toEqual([3, 4.67, 4]);
    expect([d.consistent, d.mismatched]).toEqual([true, []]);
    for (const r of d.rows) expect(Object.values(r.counts).reduce((a, b) => a + b, 0)).toBe(d.respondents);
  });

  it("ข้อที่มีคนเว้นว่างหรือค่านอกช่วง → แจ้งว่าผลรวมไม่เท่าจำนวนผู้ตอบ", () => {
    const skip = all(f, 4);
    delete skip["2"];
    const d = itemDistribution(f.items, s.options, [all(f, 5), skip, { ...all(f, 3), "9": 7 }]);
    expect(d.respondents).toBe(3);
    expect([d.consistent, d.mismatched]).toEqual([false, ["2", "9"]]);
    expect([d.rows[1].n, d.rows[8].n]).toEqual([2, 2]);
  });

  it("เรดาร์: ค่าต่ำสุดอยู่กลางวง ค่าสูงสุดอยู่ขอบ แกนแรกชี้ขึ้น · ค่าว่างอยู่กลางวง", () => {
    const p = radarPoints([10, -10, 0, null], -10, 10, 100, 200, 200);
    expect([p[0].x, p[0].y]).toEqual([200, 100]);
    expect([p[1].x, p[1].y]).toEqual([200, 200]);
    expect([p[2].x, p[2].y]).toEqual([200, 250]); // ค่า 0 = ครึ่งรัศมี ชี้ลง
    expect([p[3].x, p[3].y]).toEqual([200, 200]);
  });
});
