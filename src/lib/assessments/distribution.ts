import type { Item, Option } from "./scoring";

/**
 * จำนวนคนต่อคะแนนต่อข้อ (สเปก 17: แบบประเมินความพึงพอใจ "รายงานเป็นจำนวนคนต่อคะแนนต่อข้อ ตรวจผลรวมเท่าจำนวนผู้เข้าร่วม")
 * ฟังก์ชันล้วน — ใช้ทั้งหน้าแบบประเมินของรุ่นและแบบรายงานผล
 */
export type DistributionRow = { no: number; label: string; text: string; group: string | null; counts: Record<string, number>; n: number; mean: number | null };
export type Distribution = {
  options: Option[];
  rows: DistributionRow[];
  /** จำนวนผู้ตอบแบบ (ชุดคำตอบที่มีอย่างน้อย 1 ข้อ) */
  respondents: number;
  /** ทุกข้อมีผลรวมจำนวนคน = จำนวนผู้ตอบ */
  consistent: boolean;
  /** ข้อที่ผลรวมไม่เท่าจำนวนผู้ตอบ */
  mismatched: string[];
};

export function itemDistribution(items: Item[], options: Option[], answersList: Array<Record<string, number | null | undefined> | null | undefined>): Distribution {
  const allowed = new Set(options.map((o) => o.value));
  const sets = answersList.filter((a): a is Record<string, number> => !!a && items.some((it) => a[String(it.no)] != null));
  const rows = items.map((it) => {
    const counts: Record<string, number> = Object.fromEntries(options.map((o) => [String(o.value), 0]));
    let n = 0, sum = 0;
    for (const a of sets) {
      const v = a[String(it.no)];
      if (v == null || !allowed.has(v)) continue;
      counts[String(v)]++;
      n++;
      sum += v;
    }
    return { no: it.no, label: it.label ?? String(it.no), text: it.text, group: it.group ?? null, counts, n, mean: n ? Math.round((sum / n) * 100) / 100 : null };
  });
  const mismatched = rows.filter((r) => r.n !== sets.length).map((r) => r.label);
  return { options, rows, respondents: sets.length, consistent: mismatched.length === 0, mismatched };
}

/** พิกัดกราฟเรดาร์: ค่า min อยู่กลางวง max อยู่ขอบ — แกนแรกชี้ขึ้น เรียงตามเข็มนาฬิกา */
export function radarPoints(values: Array<number | null>, min: number, max: number, radius: number, cx: number, cy: number) {
  const n = values.length;
  return values.map((v, i) => {
    const t = v == null ? 0 : Math.min(1, Math.max(0, (v - min) / (max - min)));
    const ang = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: Math.round((cx + Math.cos(ang) * radius * t) * 100) / 100, y: Math.round((cy + Math.sin(ang) * radius * t) * 100) / 100, ang };
  });
}
