import { describe, it, expect } from "vitest";
import { paginateVoucher, VOUCHER_CAPACITY } from "@/lib/pay/voucher-pages";

const rows = (n: number, long = false) => Array.from({ length: n }, (_, i) => ({ text: long ? "ก".repeat(70) : `${i + 1}. รายการ`, amountSatang: 100 * (i + 1) }));

describe("แบ่งหน้าใบสำคัญรับเงิน (ยอดยกไป/ยกมา)", () => {
  it("ไม่เกินหน้าเดียว: เติมแถวว่างให้ครบตาราง", () => {
    const p = paginateVoucher(rows(5));
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ isLast: true, carryIn: null, carryOut: null, padding: VOUCHER_CAPACITY.single - 5, of: 1 });
  });

  it("หลายหน้า: ยอดยกไปหน้าก่อน = ยอดยกมาหน้าถัดไป · ผลรวมทุกหน้าเท่าเดิม · หน้าสุดท้ายมีอย่างน้อย 1 แถว", () => {
    const all = rows(70);
    const p = paginateVoucher(all);
    expect(p.length).toBeGreaterThan(2);
    expect(p.flatMap((x) => x.rows)).toEqual(all);
    for (let k = 1; k < p.length; k++) expect(p[k].carryIn).toBe(p[k - 1].carryOut);
    const last = p[p.length - 1];
    expect(last.rows.length).toBeGreaterThan(0);
    expect(last.carryIn! + last.rows.reduce((a, r) => a + r.amountSatang, 0)).toBe(all.reduce((a, r) => a + r.amountSatang, 0));
    expect(p.every((x, i) => x.no === i + 1 && x.of === p.length)).toBe(true);
    expect(p[0].rows.length).toBeLessThanOrEqual(VOUCHER_CAPACITY.first);
  });

  it("เกินหน้าเดียวเล็กน้อย → 2 หน้า (ลายเซ็นอยู่หน้าสุดท้าย)", () => {
    const p = paginateVoucher(rows(VOUCHER_CAPACITY.single + 1));
    expect(p).toHaveLength(2);
    expect(p[1].isLast).toBe(true);
  });

  it("ข้อความยาวนับ 2 แถว", () => {
    expect(paginateVoucher(rows(7, true))).toHaveLength(2);
    expect(paginateVoucher(rows(6, true))).toHaveLength(1);
  });
});
