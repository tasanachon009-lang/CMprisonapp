/**
 * แบ่งหน้าใบสำคัญรับเงิน (สเปก 11.5C)
 * - หน้าเดียว: แถวรายการ + รวม + ตัวอักษร + ลายเซ็น
 * - หลายหน้า: ท้ายหน้า "ยอดยกไป" ต้นหน้าถัดไป "ยอดยกมา" · ส่วนรวม/ตัวอักษร/ลายเซ็นอยู่หน้าสุดท้ายเสมอ
 * - แถวว่างที่เหลือในหน้าสุดท้ายคงเส้นตาราง (เติมแถวว่าง)
 * ข้อความที่ต้องขึ้น 2 บรรทัดนับเป็น 2 แถว (weightOf — ตอนสร้าง PDF วัดจากความกว้างฟอนต์จริง)
 */
export type VoucherCapacity = { single: number; first: number; middle: number; last: number };
export const VOUCHER_CAPACITY: VoucherCapacity = { single: 13, first: 19, middle: 25, last: 19 };
const LONG_TEXT = 62;

export type VoucherRow = { text: string; amountSatang: number };
export type VoucherPage = { rows: VoucherRow[]; carryIn: number | null; carryOut: number | null; padding: number; isLast: boolean; no: number; of: number };

const defaultWeight = (r: VoucherRow) => (r.text.length > LONG_TEXT ? 2 : 1);

export function paginateVoucher(rows: VoucherRow[], cap: VoucherCapacity = VOUCHER_CAPACITY, weightOf: (r: VoucherRow) => number = defaultWeight): VoucherPage[] {
  const sum = (list: VoucherRow[]) => list.reduce((a, r) => a + weightOf(r), 0);
  const take = (from: number, limit: number) => {
    let used = 0, i = from;
    while (i < rows.length && used + weightOf(rows[i]) <= limit) { used += weightOf(rows[i]); i++; }
    if (i === from && i < rows.length) { used += weightOf(rows[i]); i++; } // แถวเดียวยาวเกินหน้า (ไม่ควรเกิด) — ใส่ไปก่อน
    return { end: i, used };
  };
  const total = sum(rows);
  if (total <= cap.single) return [{ rows, carryIn: null, carryOut: null, padding: cap.single - total, isLast: true, no: 1, of: 1 }];
  const chunks: Array<{ rows: VoucherRow[]; used: number; cap: number }> = [];
  // หน้าแรก: ต้องเหลือให้หน้าสุดท้าย (ที่มีลายเซ็น) อย่างน้อย 1 แถว
  const first = take(0, Math.min(cap.first, total - 1));
  chunks.push({ rows: rows.slice(0, first.end), used: first.used, cap: cap.first });
  let i = first.end;
  while (i < rows.length) {
    const restWeight = sum(rows.slice(i));
    if (restWeight <= cap.last) { chunks.push({ rows: rows.slice(i), used: restWeight, cap: cap.last }); break; }
    // หน้ากลาง: เหลือให้หน้าสุดท้ายอย่างน้อย 1 แถว
    const t = take(i, Math.min(cap.middle, restWeight - 1));
    chunks.push({ rows: rows.slice(i, t.end), used: t.used, cap: cap.middle });
    i = t.end;
  }
  let running = 0;
  return chunks.map((c, k) => {
    const carryIn = k === 0 ? null : running;
    running += c.rows.reduce((a, r) => a + r.amountSatang, 0);
    const isLast = k === chunks.length - 1;
    return { rows: c.rows, carryIn, carryOut: isLast ? null : running, padding: isLast ? Math.max(0, c.cap - c.used) : 0, isLast, no: k + 1, of: chunks.length };
  });
}
