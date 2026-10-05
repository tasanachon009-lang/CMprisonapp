/**
 * แปลงจำนวนเงิน (สตางค์) เป็นข้อความภาษาไทยตามแบบเอกสารราชการ (สเปก 11.5C)
 * เช่น 900000 → "เก้าพันบาทถ้วน" · 150050 → "หนึ่งพันห้าร้อยบาทห้าสิบสตางค์"
 */
const DIGIT = ["ศูนย์", "หนึ่ง", "สอง", "สาม", "สี่", "ห้า", "หก", "เจ็ด", "แปด", "เก้า"];
const UNIT = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"];

/** อ่านเลข 0–999,999 (ไม่มีคำว่าล้าน) — 0 = "" · hasHigher = มีหลักล้านขึ้นไป (หลักหน่วย 1 อ่าน "เอ็ด" เช่น หนึ่งล้านเอ็ด) */
function readBelowMillion(n: number, hasHigher = false): string {
  const s = String(n);
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const d = Number(s[i]);
    const pos = s.length - 1 - i;
    if (d === 0) continue;
    if (pos === 1 && d === 1) out += "สิบ";
    else if (pos === 1 && d === 2) out += "ยี่สิบ";
    else if (pos === 0 && d === 1 && (s.length > 1 || hasHigher)) out += "เอ็ด";
    else out += DIGIT[d] + UNIT[pos];
  }
  return out;
}

/** อ่านจำนวนเต็มไม่จำกัดหลัก (ทุก 6 หลักต่อด้วย "ล้าน") */
export function readNumber(n: number): string {
  if (!Number.isSafeInteger(n) || n < 0) throw new Error("จำนวนเงินไม่ถูกต้อง");
  if (n === 0) return DIGIT[0];
  const parts: string[] = [];
  let rest = n;
  while (rest > 0) {
    const higher = rest >= 1_000_000;
    parts.unshift(readBelowMillion(rest % 1_000_000, higher));
    rest = Math.floor(rest / 1_000_000);
  }
  // ตรงกับ BAHTTEXT: 1,001 = หนึ่งพันเอ็ด · 1,000,001 = หนึ่งล้านเอ็ด · 1,000,000 = หนึ่งล้าน
  return parts.map((p, i) => (i < parts.length - 1 ? `${p}ล้าน` : p)).join("");
}

export function bahtText(satang: number): string {
  if (!Number.isSafeInteger(satang) || satang < 0) throw new Error("จำนวนเงินไม่ถูกต้อง");
  const baht = Math.floor(satang / 100);
  const st = satang % 100;
  if (baht === 0 && st === 0) return "ศูนย์บาทถ้วน";
  const b = baht ? `${readNumber(baht)}บาท` : "";
  return st ? `${b}${readNumber(st)}สตางค์` : `${b}ถ้วน`;
}

/** แยกบาท | สตางค์ สำหรับตารางเอกสาร: 90050 → ["900", "50"] */
export function bahtCols(satang: number): [string, string] {
  return [Math.floor(satang / 100).toLocaleString("th-TH"), String(satang % 100).padStart(2, "0")];
}
