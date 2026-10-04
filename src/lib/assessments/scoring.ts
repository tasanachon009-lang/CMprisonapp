/**
 * คิดคะแนนและแปลผลแบบประเมิน (สเปก 10, 15, 16A) — ฟังก์ชันล้วน ทดสอบได้
 * เกณฑ์มาจาก "เวอร์ชัน" ของแบบประเมิน ณ วันประเมิน (แช่แข็ง เปลี่ยนเกณฑ์ปีใหม่ไม่กระทบข้อมูลเก่า)
 */

export type Tone = "ok" | "warn" | "danger";
export type Band = { min: number; max: number; label: string; tone: Tone; alert?: { severity: "warning" | "danger"; message: string } };
export type Item = { no: number; text: string; help?: string; reverse?: boolean; correct?: boolean; weight?: number; group?: string };
export type Option = { value: number; label: string };

export type ItemsScoring = {
  method: "sum" | "correct";
  options: Option[];
  /** ข้อกลับคะแนน: ค่าใหม่ = reverseBase − ค่าเดิม (เช่น 5–1 → 6) */
  reverseBase?: number;
  bands: Band[];
};
export type SingleScoring = { options: Option[]; bands?: Band[] };

export type Result = { total: number | null; level: string | null; tone: Tone | null; details: Record<string, unknown>; alerts: Array<{ severity: "warning" | "danger"; message: string }>; errors: string[] };

export function band(bands: Band[] | undefined, total: number): Band | null {
  return bands?.find((b) => total >= b.min && total <= b.max) ?? null;
}

/** แบบรายข้อ: รวมคะแนน (มีข้อกลับคะแนน/น้ำหนัก) หรือ นับข้อที่ตอบถูก */
export function scoreItems(items: Item[], s: ItemsScoring, answers: Record<string, number | null | undefined>): Result {
  const errors: string[] = [];
  const allowed = new Set(s.options.map((o) => o.value));
  let total = 0;
  let missing = 0;
  for (const it of items) {
    const v = answers[String(it.no)];
    if (v == null || Number.isNaN(v)) {
      missing++;
      continue;
    }
    if (!allowed.has(v)) {
      errors.push(`ข้อ ${it.no}: ค่า ${v} อยู่นอกช่วงที่กำหนด`);
      continue;
    }
    if (s.method === "correct") {
      // ตัวเลือก 1 = ถูก (ใช่), 0 = ผิด (ไม่ใช่) เทียบกับเฉลย
      if ((v === 1) === !!it.correct) total += 1;
    } else {
      const val = it.reverse && s.reverseBase != null ? s.reverseBase - v : v;
      total += val * (it.weight ?? 1);
    }
  }
  if (missing) errors.push(`ยังไม่ได้ตอบ ${missing} ข้อ`);
  if (errors.length) return { total: null, level: null, tone: null, details: { missing }, alerts: [], errors };
  const b = band(s.bands, total);
  return { total, level: b?.label ?? null, tone: b?.tone ?? null, details: {}, alerts: b?.alert ? [b.alert] : [], errors };
}

export function scoreSingle(s: SingleScoring, value: number | null | undefined): Result {
  if (value == null) return { total: null, level: null, tone: null, details: {}, alerts: [], errors: ["ยังไม่ได้เลือก"] };
  const opt = s.options.find((o) => o.value === value);
  if (!opt) return { total: null, level: null, tone: null, details: {}, alerts: [], errors: [`ค่า ${value} อยู่นอกช่วง`] };
  const b = band(s.bands, value);
  return { total: value, level: b?.label ?? opt.label, tone: b?.tone ?? null, details: {}, alerts: b?.alert ? [b.alert] : [], errors: [] };
}

// ───────── 2Q → 9Q → 8Q (ลำดับขั้นอัตโนมัติ) ─────────

export const Q9_BANDS: Band[] = [
  { min: 0, max: 6, label: "ไม่มีอาการของโรคซึมเศร้าหรือมีอาการน้อยมาก", tone: "ok" },
  { min: 7, max: 12, label: "มีอาการของโรคซึมเศร้า ระดับน้อย", tone: "warn" },
  { min: 13, max: 18, label: "มีอาการของโรคซึมเศร้า ระดับปานกลาง", tone: "danger" },
  { min: 19, max: 27, label: "มีอาการของโรคซึมเศร้า ระดับรุนแรง", tone: "danger" },
];
export const Q8_BANDS: Band[] = [
  { min: 0, max: 0, label: "ไม่มีแนวโน้มฆ่าตัวตายในปัจจุบัน", tone: "ok" },
  { min: 1, max: 8, label: "มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับน้อย", tone: "warn" },
  { min: 9, max: 16, label: "มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับปานกลาง", tone: "danger" },
  { min: 17, max: 52, label: "มีแนวโน้มที่จะฆ่าตัวตายในปัจจุบัน ระดับรุนแรง", tone: "danger" },
];
/** น้ำหนักคะแนน 8Q ข้อ 1–8 (ตอบ "มี") — ข้อ 3 ถ้ามี ถามต่อ "ควบคุมได้ไหม": ได้ +0 ไม่ได้ +8 */
export const Q8_WEIGHTS = [1, 2, 6, 8, 9, 4, 10, 4];

export type DepressionAnswers = {
  q2: [boolean | null, boolean | null];
  q9?: Array<number | null>;
  q8?: Array<boolean | null>;
  /** ข้อ 3 ของ 8Q: ควบคุมได้ (true) / ไม่ได้ (false) */
  q8control?: boolean | null;
};

/** ขั้นที่ต้องทำต่อ: "2q" | "9q" | "8q" | "done" */
export function depressionStage(a: DepressionAnswers): "2q" | "9q" | "8q" | "done" {
  if (a.q2.some((x) => x == null)) return "2q";
  if (!a.q2.some(Boolean)) return "done";
  if (!a.q9 || a.q9.length < 9 || a.q9.some((x) => x == null)) return "9q";
  const s9 = a.q9.reduce<number>((s, x) => s + (x ?? 0), 0);
  if (s9 < 7) return "done";
  if (!a.q8 || a.q8.length < 8 || a.q8.some((x) => x == null)) return "8q";
  if (a.q8[2] && a.q8control == null) return "8q";
  return "done";
}

export function scoreDepression(a: DepressionAnswers): Result {
  const stage = depressionStage(a);
  if (stage !== "done") return { total: null, level: null, tone: null, details: { stage }, alerts: [], errors: [`ยังทำ${stage.toUpperCase()} ไม่ครบ`] };
  const alerts: Result["alerts"] = [];
  if (!a.q2.some(Boolean)) {
    return { total: 0, level: "2Q ปกติ ไม่เป็นโรคซึมเศร้า", tone: "ok", details: { q2: "normal" }, alerts, errors: [] };
  }
  const s9 = a.q9!.reduce<number>((s, x) => s + (x ?? 0), 0);
  const b9 = band(Q9_BANDS, s9)!;
  const details: Record<string, unknown> = { q2: "positive", q9: s9, q9Level: b9.label };
  if (s9 >= 13) alerts.push({ severity: "warning", message: `9Q = ${s9} (${b9.label}) — พิจารณาส่งพบจิตแพทย์` });
  if (s9 < 7) return { total: s9, level: `9Q: ${b9.label}`, tone: b9.tone, details, alerts, errors: [] };

  let s8 = 0;
  a.q8!.forEach((yes, i) => {
    if (yes) s8 += Q8_WEIGHTS[i];
  });
  if (a.q8![2] && a.q8control === false) s8 += 8;
  const b8 = band(Q8_BANDS, s8)!;
  details.q8 = s8;
  details.q8Level = b8.label;
  if (s8 >= 17) alerts.push({ severity: "danger", message: `เร่งด่วน: 8Q = ${s8} (${b8.label})` });
  else if (s8 >= 1) alerts.push({ severity: "warning", message: `8Q = ${s8} (${b8.label})` });
  const tone: Tone = s8 >= 1 || b9.tone === "danger" ? "danger" : b9.tone;
  return { total: s9, level: `9Q: ${b9.label} · 8Q: ${b8.label}`, tone, details, alerts, errors: [] };
}

/** แนวทางการดูแลตามระดับ 8Q — เป็นคำแนะนำ ไม่ใช่การวินิจฉัย (ตามแนวทางกรมสุขภาพจิตที่อยู่ในสมุด) */
export function q8Guidance(score: number): string {
  if (score >= 17) return "แจ้งสถานพยาบาลทันที ดูแลใกล้ชิดตลอดเวลา ไม่ปล่อยให้อยู่ตามลำพัง จัดสภาพแวดล้อมให้ปลอดภัย และส่งพบแพทย์โดยเร็ว";
  if (score >= 9) return "เฝ้าระวังใกล้ชิด แจ้งสถานพยาบาล ให้การปรึกษา และพิจารณาส่งพบแพทย์";
  if (score >= 1) return "ให้การปรึกษาเบื้องต้น ติดตามอาการอย่างต่อเนื่อง และแจ้งผู้เกี่ยวข้องเฝ้าระวัง";
  return "ไม่มีแนวโน้มในปัจจุบัน — ติดตามตามปกติ";
}

// ───────── สมรรถภาพร่างกาย 5 ฐาน ─────────

export function bmi(weightKg: number | null | undefined, heightCm: number | null | undefined): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiLabel(v: number | null): string {
  if (v == null) return "-";
  if (v < 18.5) return "น้ำหนักน้อย";
  if (v < 23) return "ปกติ";
  if (v < 25) return "น้ำหนักเกิน";
  if (v < 30) return "อ้วนระดับ 1";
  return "อ้วนระดับ 2";
}

export type FitnessAnswers = {
  sbp?: number | null; dbp?: number | null; pulse?: number | null; weight?: number | null; height?: number | null;
  pulseBefore?: number | null; pulseAfter?: number | null; pushups?: number | null; reachCm?: number | null; balanceSec?: number | null;
  /** ผล ผ่าน/ไม่ผ่าน และผู้ประเมินประจำฐาน 1–5 */
  bases?: Array<{ pass: boolean | null; assessor?: string | null }>;
};

export function scoreFitness(a: FitnessAnswers): Result {
  const b = bmi(a.weight, a.height);
  const bases = a.bases ?? [];
  const passed = bases.filter((x) => x?.pass === true).length;
  const done = bases.filter((x) => x?.pass != null).length;
  return {
    total: done ? passed : null,
    level: done ? `ผ่าน ${passed}/5 ฐาน` : null,
    tone: done ? (passed >= 4 ? "ok" : passed >= 2 ? "warn" : "danger") : null,
    details: { bmi: b, bmiLabel: bmiLabel(b) },
    alerts: [],
    errors: done === 5 ? [] : [`บันทึกผลผ่าน/ไม่ผ่านแล้ว ${done}/5 ฐาน`],
  };
}

// ───────── สภาวะร่างกาย/จิตใจแรกรับ (สมุดส่วนที่ 2.1) ─────────

export type ConditionAnswers = {
  exams?: Array<{ date: string; weight?: number | null; height?: number | null; bp?: string | null; pulse?: number | null; disability?: string | null }>;
  physicalHistory?: { has: boolean; diseases?: string; ongoing?: boolean | null };
  psychHistory?: { has: boolean; detail?: string; ongoing?: boolean | null };
  /** fit = เข้าร่วมได้, unfit = ยังเข้าร่วมไม่ได้ */
  opinion?: "fit" | "unfit" | null;
  unfitReasons?: Array<"psych" | "physical">;
  assessorName?: string | null;
};

export function scoreCondition(a: ConditionAnswers): Result {
  if (!a.opinion) return { total: null, level: null, tone: null, details: {}, alerts: [], errors: ["ยังไม่ได้ลงความเห็นผู้ประเมิน"] };
  const fit = a.opinion === "fit";
  return {
    total: fit ? 1 : 0,
    level: fit ? "เข้าร่วมได้" : `ยังเข้าร่วมไม่ได้ (${(a.unfitReasons ?? []).map((r) => (r === "psych" ? "ปัญหาจิตเวช" : "ปัญหากาย")).join(", ") || "ไม่ระบุ"})`,
    tone: fit ? "ok" : "danger",
    details: { opinion: a.opinion },
    alerts: fit ? [] : [{ severity: "warning", message: "ผลประเมินสภาวะกาย/จิต: ยังเข้าร่วมไม่ได้ — ระบบไม่ให้ยืนยันรับเข้า (ยกเว้นผู้ดูแล)" }],
    errors: [],
  };
}
