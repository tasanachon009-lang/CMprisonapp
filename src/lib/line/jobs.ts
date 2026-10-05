import { desc, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { getSetting } from "../bootstrap";
import { addDays, nowInTZ, weekdayOf } from "../thai-date";
import { dayText, hashText, nextWorkingDay, weekText } from "./messages";
import { lineEnabled, sendLine, lastMessage } from "./send";

/**
 * งานตั้งเวลา LINE (สเปก 12)
 * - วันทำการ เวลาตั้งค่า (16.00): ตารางวันทำการถัดไป · วันศุกร์ส่งตารางสัปดาห์หน้าเพิ่ม (ตั้งค่า)
 * - ตรวจทุก 30 นาที: ตารางที่ส่งไปแล้วถูกแก้ → ส่ง "แจ้งเปลี่ยนแปลง"
 */
export async function runDaily(db: DB, today = nowInTZ().date) {
  if (!lineEnabled(db)) return "ปิดการส่ง LINE อยู่";
  const target = nextWorkingDay(db, today);
  const out: string[] = [];
  if (!lastMessage(db, "daily", target)) {
    const t = dayText(db, target);
    const r = await sendLine(db, "daily", t.text, { targetDate: target, contentHash: hashText(t.text) });
    out.push(`ตาราง ${target} ${t.count} คาบ: ${r.status}`);
  }
  if (weekdayOf(today) === 5 && getSetting<boolean>(db, "line.weeklyOnFriday", true) !== false) {
    const monday = addDays(today, 3);
    if (!lastMessage(db, "weekly_schedule", monday)) {
      const w = weekText(db, monday);
      const r = await sendLine(db, "weekly_schedule", w.text, { targetDate: monday, contentHash: hashText(w.text) });
      out.push(`สัปดาห์ ${monday} ${w.count} คาบ: ${r.status}`);
    }
  }
  return out.join(" · ") || "ส่งแล้วก่อนหน้า";
}

/** ตารางของวันที่ส่งไปแล้ว (วันนี้หรืออนาคต) ถูกแก้ → ส่งแจ้งเปลี่ยนแปลงพร้อมตารางใหม่ทั้งวัน */
export async function runChanges(db: DB, today = nowInTZ().date) {
  if (!lineEnabled(db)) return "ปิดการส่ง LINE อยู่";
  const sent = db.select().from(schema.lineMessages).where(inArray(schema.lineMessages.kind, ["daily", "change"])).orderBy(desc(schema.lineMessages.id)).limit(50).all()
    .filter((m) => m.status !== "failed" && m.targetDate && m.targetDate >= today);
  const latestByDate = new Map<string, (typeof sent)[number]>();
  for (const m of sent) if (!latestByDate.has(m.targetDate!)) latestByDate.set(m.targetDate!, m);
  const out: string[] = [];
  for (const [date, m] of latestByDate) {
    const t = dayText(db, date);
    if (hashText(t.text) === m.contentHash) continue;
    const title = date === today ? "⚠️ แจ้งเปลี่ยนแปลงตารางวันนี้" : "⚠️ แจ้งเปลี่ยนแปลงตาราง";
    const changed = dayText(db, date, title);
    const r = await sendLine(db, "change", changed.text, { targetDate: date, contentHash: hashText(t.text) });
    out.push(`${date}: ${r.status}`);
  }
  return out.join(" · ") || "ไม่มีการเปลี่ยนแปลง";
}

/** ช่วงเวลาตรวจการเปลี่ยนแปลง: ทุก 30 นาที 16:30–21:30 และ 06:00–07:30 */
export function changeSlots() {
  const s: string[] = [];
  for (let h = 6; h <= 7; h++) for (const m of ["00", "30"]) s.push(`${String(h).padStart(2, "0")}:${m}`);
  for (let h = 16; h <= 21; h++) for (const m of ["00", "30"]) if (!(h === 16 && m === "00")) s.push(`${h}:${m}`);
  return s;
}
