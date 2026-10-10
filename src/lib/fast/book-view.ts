import { THAI_MONTHS } from "../thai-date";
import type { MonthHelper } from "../services/member-book";
import { phaseLabel } from "./phases";

/** ป้ายเดือนของสมุดส่วนที่ 3: "2026-07" → "กรกฎาคม 2569" */
export function periodLabel(period: string) {
  const [y, m] = period.split("-").map(Number);
  return `${THAI_MONTHS[m - 1]} ${y + 543}`;
}

export const FREQUENCY_LABEL: Record<string, string> = { daily: "ทุกวัน", "5-6pw": "5–6 วัน/สัปดาห์", "3-4pw": "3–4 วัน/สัปดาห์", "1-2pw": "1–2 วัน/สัปดาห์", monthly: "รายเดือน" };
export const GENDER_LABEL: Record<string, string> = { male: "ชาย", female: "หญิง", other: "อื่นๆ" };

export const ymd = (v: { years?: number | null; months?: number | null; days?: number | null } | null) =>
  v && (v.years != null || v.months != null || v.days != null) ? `${v.years ?? 0} ปี ${v.months ?? 0} เดือน ${v.days ?? 0} วัน` : "-";

/** บรรทัดข้อมูลช่วยเขียนของเดือน (แสดงข้างช่องบันทึก) */
export function helperLines(h: MonthHelper): string[] {
  const out: string[] = [];
  if (h.attendance.pct != null) out.push(`เข้าร่วม ${h.attendance.pct}% (${h.attendance.present}/${h.attendance.counted} ครั้ง)`);
  if (h.progress?.total != null) out.push(`คะแนนพฤติกรรมเดือนนี้ ${h.progress.total}${h.progress.level ? ` (${h.progress.level})` : ""}`);
  const b = h.behavior;
  if (b.positive + b.negative + b.observe) out.push(`บันทึกพฤติกรรม: เชิงบวก ${b.positive} · เชิงลบ ${b.negative} · สังเกต ${b.observe}`);
  for (const p of h.phases) out.push(`เลื่อนเข้าระยะ ${phaseLabel(p.phase)}`);
  for (const x of h.assignments) out.push(`${x.kind === "position" ? "ตำแหน่ง" : "ทีมงาน"}: ${x.label}`);
  return out;
}
