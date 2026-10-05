/**
 * จัดตำแหน่งสระ/วรรณยุกต์ไทยสำหรับ PDF ที่สร้างด้วย pdf-lib (ไม่มีระบบจัดรูปอักษร OpenType)
 * ใช้รูปอักษรสำรองใน Private Use Area แบบ Windows/WTT (U+F700–F71A) ที่มีในฟอนต์ TH Sarabun New
 * กฎเดียวกับ HarfBuzz (hb-ot-shaper-thai: do_thai_pua_shaping):
 * - วรรณยุกต์ที่ไม่มีสระบน → ตัวต่ำ (SD) · หลังพยัญชนะหางสูง ป ฝ ฟ ฬ → เลื่อนซ้าย (SL/SDL)
 * - ญ ฐ ที่มีสระล่าง → ตัดหาง (RD) · ฎ ฏ ที่มีสระล่าง → สระล่างต่ำลง (SD)
 * - วรรณยุกต์ก่อน "ำ" ถือว่ามีสระบน (นิคหิตของ ำ อยู่ข้างบน) → วรรณยุกต์ตัวสูง
 */

type Action = "NOP" | "SD" | "SDL" | "SL" | "RD";

const SD: Record<number, number> = { 0x0e48: 0xf70a, 0x0e49: 0xf70b, 0x0e4a: 0xf70c, 0x0e4b: 0xf70d, 0x0e4c: 0xf70e, 0x0e38: 0xf718, 0x0e39: 0xf719, 0x0e3a: 0xf71a };
const SDL: Record<number, number> = { 0x0e48: 0xf705, 0x0e49: 0xf706, 0x0e4a: 0xf707, 0x0e4b: 0xf708, 0x0e4c: 0xf709 };
const SL: Record<number, number> = {
  0x0e48: 0xf713, 0x0e49: 0xf714, 0x0e4a: 0xf715, 0x0e4b: 0xf716, 0x0e4c: 0xf717,
  0x0e31: 0xf710, 0x0e34: 0xf701, 0x0e35: 0xf702, 0x0e36: 0xf703, 0x0e37: 0xf704, 0x0e47: 0xf712, 0x0e4d: 0xf711,
};
const RD: Record<number, number> = { 0x0e0d: 0xf70f, 0x0e10: 0xf700 };
const MAP: Record<Exclude<Action, "NOP">, Record<number, number>> = { SD, SDL, SL, RD };

type Cons = "NC" | "AC" | "RC" | "DC" | "NONE";
function consType(c: number): Cons {
  if (c === 0x0e1b || c === 0x0e1d || c === 0x0e1f || c === 0x0e2c) return "AC"; // ป ฝ ฟ ฬ
  if (c === 0x0e0d || c === 0x0e10) return "RC"; // ญ ฐ
  if (c === 0x0e0e || c === 0x0e0f) return "DC"; // ฎ ฏ
  if ((c >= 0x0e01 && c <= 0x0e2e) || c === 0x0e24 || c === 0x0e26) return "NC";
  return "NONE";
}
type Mark = "AV" | "BV" | "T" | null;
function markType(c: number): Mark {
  if (c === 0x0e31 || (c >= 0x0e34 && c <= 0x0e37) || c === 0x0e47 || c === 0x0e4d) return "AV";
  if (c >= 0x0e38 && c <= 0x0e3a) return "BV";
  if (c >= 0x0e48 && c <= 0x0e4c) return "T";
  return null;
}

// ตารางสถานะ (AV, BV, T) — ตาม HarfBuzz
type AS = 0 | 1 | 2 | 3;
const ABOVE: Record<AS, Record<"AV" | "BV" | "T", [Action, AS]>> = {
  0: { AV: ["NOP", 3], BV: ["NOP", 0], T: ["SD", 3] },
  1: { AV: ["SL", 2], BV: ["NOP", 1], T: ["SDL", 2] },
  2: { AV: ["NOP", 3], BV: ["NOP", 2], T: ["SL", 3] },
  3: { AV: ["NOP", 3], BV: ["NOP", 3], T: ["NOP", 3] },
};
const ABOVE_START: Record<Cons, AS> = { NC: 0, AC: 1, RC: 0, DC: 0, NONE: 3 };
type BS = 0 | 1 | 2;
const BELOW: Record<BS, Record<"AV" | "BV" | "T", [Action, BS]>> = {
  0: { AV: ["NOP", 0], BV: ["NOP", 2], T: ["NOP", 0] },
  1: { AV: ["NOP", 1], BV: ["RD", 2], T: ["NOP", 1] },
  2: { AV: ["NOP", 2], BV: ["SD", 2], T: ["NOP", 2] },
};
const BELOW_START: Record<Cons, BS> = { NC: 0, AC: 0, RC: 1, DC: 2, NONE: 2 };

/** แปลงข้อความเป็นลำดับรหัสที่ใช้รูปอักษรสำรองแล้ว — hasGlyph ใช้ตรวจว่าฟอนต์มีรูปนั้น (ไม่มี = ใช้ตัวเดิม) */
export function shapeThai(text: string, hasGlyph: (cp: number) => boolean = () => true): string {
  const cps = Array.from(text, (ch) => ch.codePointAt(0)!);
  const out = [...cps];
  let base = -1;
  let above = 3 as AS;
  let below = 2 as BS;
  for (let i = 0; i < cps.length; i++) {
    const c = cps[i];
    const m = markType(c);
    if (!m) {
      base = i;
      const t = consType(c);
      above = ABOVE_START[t];
      below = BELOW_START[t];
      continue;
    }
    const kind = m;
    // วรรณยุกต์ตามด้วย ำ → นิคหิตอยู่ข้างบน ให้ถือเหมือนมีสระบนก่อน (วรรณยุกต์ไม่ลงต่ำ)
    if (kind === "T" && cps[i + 1] === 0x0e33 && above !== 3) above = ABOVE[above].AV[1];
    const [aAct, aNext]: [Action, AS] = ABOVE[above][kind];
    const [bAct, bNext]: [Action, BS] = BELOW[below][kind];
    above = aNext;
    below = bNext;
    for (const act of [aAct, bAct]) {
      if (act === "NOP") continue;
      const idx = act === "RD" ? base : i;
      if (idx < 0) continue;
      const alt = MAP[act][cps[idx]];
      if (alt && hasGlyph(alt)) out[idx] = alt;
    }
  }
  return String.fromCodePoint(...out);
}
