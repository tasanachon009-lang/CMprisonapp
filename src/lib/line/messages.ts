import { createHash } from "node:crypto";
import type { DB } from "../db";
import { calendarSessions } from "../queries/calendar";
import { holidaySet } from "../services/cohorts";
import { addDays, formatThaiDate, THAI_WEEKDAYS, weekdayOf } from "../thai-date";

/**
 * ข้อความ LINE (สเปก 12): เวลา / ผู้สอน / หัวข้อ / หลักสูตร-รุ่น / สถานที่ — **ห้ามมีข้อมูลผู้ต้องขังทุกกรณี**
 * ใช้ข้อมูลจากปฏิทินรวมเท่านั้น (คาบ + ชื่อวิทยากร) ไม่แตะตารางทะเบียน/การลงทะเบียน
 */
export const LINE_TEXT_LIMIT = 5000;

export function isWorkingDay(date: string, holidays: Set<string>) {
  const wd = weekdayOf(date);
  return wd !== 0 && wd !== 6 && !holidays.has(date);
}

/** วันทำการถัดไป (ข้ามเสาร์-อาทิตย์และวันหยุดราชการ) */
export function nextWorkingDay(db: DB, from: string) {
  const hol = holidaySet(db);
  let d = addDays(from, 1);
  for (let i = 0; i < 30 && !isWorkingDay(d, hol); i++) d = addDays(d, 1);
  return d;
}

const staffText = (staff: Array<{ name: string; external: boolean }>) => {
  if (!staff.length) return "ยังไม่ระบุผู้สอน";
  const names = staff.map((s) => `${s.name}${s.external ? " (วิทยากรภายนอก)" : ""}`);
  return names.length > 4 ? `${names.slice(0, 4).join(", ")} และอีก ${names.length - 4} คน` : names.join(", ");
};

function dayBlock(db: DB, date: string) {
  const sessions = calendarSessions(db, date, date);
  const head = `📅 วัน${THAI_WEEKDAYS[weekdayOf(date)]}ที่ ${formatThaiDate(date, "long")}`;
  if (!sessions.length) return { head, body: "ไม่มีกิจกรรม", count: 0 };
  const body = sessions.map((s) => `• ${s.startTime}–${s.endTime} ${s.title}\n  ผู้สอน: ${staffText(s.staff)}\n  ${s.cohortLabel}${s.location ? ` · ${s.location}` : ""}`).join("\n");
  return { head, body, count: sessions.length };
}

/** ตารางของวันเดียว (ส่งทุกวันทำการ: ตารางพรุ่งนี้) */
export function dayText(db: DB, date: string, title = "ตารางกิจกรรมพรุ่งนี้") {
  const b = dayBlock(db, date);
  return { text: `${title}\n${b.head}\n\n${b.body}`, count: b.count };
}

/** ตารางสัปดาห์หน้า (ส่งเพิ่มวันศุกร์) — วันจันทร์ถึงศุกร์ (และเสาร์-อาทิตย์ถ้ามีกิจกรรม) */
export function weekText(db: DB, monday: string) {
  const parts: string[] = [`ตารางกิจกรรมสัปดาห์หน้า ${formatThaiDate(monday)} – ${formatThaiDate(addDays(monday, 6))}`];
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const d = addDays(monday, i);
    const b = dayBlock(db, d);
    if (i >= 5 && !b.count) continue;
    parts.push(`${b.head}\n${b.body}`);
    count += b.count;
  }
  return { text: parts.join("\n\n"), count };
}

export const hashText = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 32);

/** แบ่งข้อความยาวเป็นหลายข้อความ (LINE รับข้อความละไม่เกิน 5,000 ตัวอักษร) — ตัดที่บรรทัดว่าง/บรรทัด */
export function splitText(text: string, limit = LINE_TEXT_LIMIT): string[] {
  if (text.length <= limit) return [text];
  const out: string[] = [];
  let cur = "";
  for (const para of text.split("\n")) {
    const next = cur ? `${cur}\n${para}` : para;
    if (next.length <= limit) { cur = next; continue; }
    if (cur) out.push(cur);
    cur = para.length > limit ? para.slice(0, limit) : para;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * ตรวจซ้ำก่อนส่ง: ข้อความต้องไม่มีรูปแบบที่เป็นข้อมูลผู้ต้องขัง (เลขประจำตัว/เลขบัตร 13 หลัก)
 * (ข้อความสร้างจากปฏิทินอยู่แล้ว — เป็นด่านสุดท้ายกันพลาด)
 */
export function looksLikeInmateData(text: string) {
  return /\b\d{1}-?\d{4}-?\d{5}-?\d{2}-?\d{1}\b/.test(text) || /\b\d{2}-\d{5}\b/.test(text) || /เลขประจำตัวผู้ต้องขัง/.test(text);
}
