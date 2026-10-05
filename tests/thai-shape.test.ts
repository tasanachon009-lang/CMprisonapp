import { describe, it, expect } from "vitest";
import { shapeThai } from "@/lib/pdf/thai-shape";

const cps = (s: string) => Array.from(s, (c) => c.codePointAt(0)!.toString(16));

describe("จัดตำแหน่งสระ/วรรณยุกต์ไทยสำหรับ PDF (รูปอักษรสำรอง PUA)", () => {
  it("วรรณยุกต์ไม่มีสระบน → ตัวต่ำ · มีสระบน → คงตัวสูง", () => {
    expect(cps(shapeThai("ก่"))).toEqual(["e01", "f70a"]);
    expect(cps(shapeThai("ที่"))).toEqual(["e17", "e35", "e48"]);
    expect(cps(shapeThai("ผู้"))).toEqual(["e1c", "e39", "f70b"]);
  });

  it("พยัญชนะหางสูง ป ฝ ฟ ฬ: สระบนและวรรณยุกต์เลื่อนซ้าย", () => {
    expect(cps(shapeThai("ป้า"))).toEqual(["e1b", "f706", "e32"]); // ต่ำ+ซ้าย
    expect(cps(shapeThai("ปี่"))).toEqual(["e1b", "f702", "f713"]); // สระซ้าย + วรรณยุกต์สูงซ้าย
    expect(cps(shapeThai("ฟื้น"))).toEqual(["e1f", "f704", "f714", "e19"]);
  });

  it("ญ ฐ มีสระล่าง → ตัดหาง · ฎ ฏ มีสระล่าง → สระล่างต่ำ", () => {
    expect(cps(shapeThai("ญู"))).toEqual(["f70f", "e39"]);
    expect(cps(shapeThai("ฐุ"))).toEqual(["f700", "e38"]);
    expect(cps(shapeThai("ฎุ"))).toEqual(["e0e", "f718"]);
    expect(cps(shapeThai("ญา"))).toEqual(["e0d", "e32"]); // ไม่มีสระล่าง = คงเดิม
  });

  it("วรรณยุกต์ก่อน ำ คงตัวสูง · ข้อความอังกฤษ/ตัวเลขไม่เปลี่ยน · ฟอนต์ไม่มีรูปสำรอง = ใช้ตัวเดิม", () => {
    expect(cps(shapeThai("น้ำ"))).toEqual(["e19", "e49", "e33"]);
    expect(shapeThai("KTB 1,200 บาท")).toBe("KTB 1,200 บาท");
    expect(shapeThai("ป้า", () => false)).toBe("ป้า");
  });
});
