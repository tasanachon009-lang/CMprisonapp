import { addDays, weekdayOf } from "../thai-date";

/**
 * ชุมชนบำบัด FAST Model: 5 ระยะ (สเปก 16) — ฟังก์ชันล้วน ทดสอบได้
 * 1 Entry สัปดาห์ 1–2 · 2 Rehabilitation 3–16 · 3 Re-entry 17–20 · 4 Halfway house 21–24 · 5 After care 1 ปี (เดือน 1, 3, 6, 12)
 */
export type PhaseCode = "entry" | "rehab" | "reentry" | "halfway" | "aftercare";
export type PhaseDef = { code: PhaseCode; no: number; name: string; nameTh: string; fromWeek: number; toWeek: number | null; desc: string };

export const FAST_WEEKS = 24;
export const FAST_PHASES: PhaseDef[] = [
  { code: "entry", no: 1, name: "Entry", nameTh: "ระยะแรกรับ", fromWeek: 1, toWeek: 2, desc: "สัปดาห์ที่ 1–2" },
  { code: "rehab", no: 2, name: "Rehabilitation", nameTh: "ระยะฟื้นฟูสมรรถภาพ", fromWeek: 3, toWeek: 16, desc: "สัปดาห์ที่ 3–16" },
  { code: "reentry", no: 3, name: "Re-entry", nameTh: "ระยะกลับสู่สังคม", fromWeek: 17, toWeek: 20, desc: "สัปดาห์ที่ 17–20" },
  { code: "halfway", no: 4, name: "Halfway house", nameTh: "ระยะบ้านกึ่งวิถี", fromWeek: 21, toWeek: 24, desc: "สัปดาห์ที่ 21–24" },
  { code: "aftercare", no: 5, name: "After care", nameTh: "ระยะติดตามหลังการรักษา", fromWeek: 25, toWeek: null, desc: "1 ปี (เดือนที่ 1, 3, 6, 12)" },
];
export const phaseDef = (code: string) => FAST_PHASES.find((p) => p.code === code) ?? null;
export const phaseLabel = (code: string) => { const p = phaseDef(code); return p ? `${p.no}. ${p.name}` : code; };

const monday = (iso: string) => { const wd = weekdayOf(iso); return addDays(iso, wd === 0 ? -6 : 1 - wd); };
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/** สัปดาห์ที่เท่าไรของรุ่น (สัปดาห์ที่ 1 = สัปดาห์ของวันเริ่ม) · ก่อนเริ่ม = 0 */
export function weekOf(cohortStart: string, date: string): number {
  if (date < cohortStart) return 0;
  return Math.floor(daysBetween(monday(cohortStart), date) / 7) + 1;
}

/** ระยะตามปฏิทินของรุ่น ณ วันที่กำหนด (ก่อนเริ่ม = null · หลังสัปดาห์ที่ 24 = After care) */
export function scheduledPhase(cohortStart: string, date: string): PhaseDef | null {
  const w = weekOf(cohortStart, date);
  if (w < 1) return null;
  return FAST_PHASES.find((p) => w >= p.fromWeek && (p.toWeek == null || w <= p.toWeek)) ?? null;
}

/** วันแรกของแต่ละระยะตามปฏิทินของรุ่น */
export function phaseStartDate(cohortStart: string, code: PhaseCode): string {
  const p = phaseDef(code)!;
  return p.fromWeek === 1 ? cohortStart : addDays(monday(cohortStart), (p.fromWeek - 1) * 7);
}

export type PhaseStatus = {
  /** ระยะจริงของสมาชิก (ตามการอนุมัติ) */
  current: PhaseDef;
  /** ระยะตามปฏิทินของรุ่น */
  scheduled: PhaseDef | null;
  week: number;
  /** ถึงกำหนดเลื่อนระยะแล้วแต่ยังไม่ได้อนุมัติ → ระยะถัดไป */
  due: PhaseDef | null;
  /** เลื่อนเร็วกว่าปฏิทิน */
  ahead: boolean;
};

/** สถานะระยะของสมาชิก: ระยะจริง = ระยะล่าสุดที่อนุมัติ (ยังไม่มี = Entry) เทียบกับระยะตามปฏิทิน */
export function phaseStatus(cohortStart: string, date: string, approved: string[]): PhaseStatus {
  const maxNo = approved.reduce((m, c) => Math.max(m, phaseDef(c)?.no ?? 0), 1);
  const current = FAST_PHASES.find((p) => p.no === maxNo)!;
  const scheduled = scheduledPhase(cohortStart, date);
  const due = scheduled && scheduled.no > current.no ? FAST_PHASES.find((p) => p.no === current.no + 1)! : null;
  return { current, scheduled, week: weekOf(cohortStart, date), due, ahead: !!scheduled && current.no > scheduled.no };
}

/** ตรวจการเลื่อนระยะ: ต้องเลื่อนทีละระยะ ไม่ย้อน · คืนข้อความผิดพลาด (null = ผ่าน) */
export function checkAdvance(currentCode: string, toCode: string): string | null {
  const cur = phaseDef(currentCode), to = phaseDef(toCode);
  if (!cur || !to) return "ไม่พบระยะการบำบัดนี้ กรุณาโหลดหน้าใหม่";
  if (to.no <= cur.no) return `สมาชิกอยู่ระยะ ${cur.name} แล้ว ไม่สามารถเลื่อนย้อนหรือซ้ำระยะเดิม`;
  if (to.no !== cur.no + 1) return `ต้องเลื่อนทีละระยะ: ระยะถัดจาก ${cur.name} คือ ${FAST_PHASES.find((p) => p.no === cur.no + 1)!.name}`;
  return null;
}
