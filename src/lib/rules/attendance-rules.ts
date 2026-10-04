/**
 * การเช็คชื่อ (สเปก 9)
 * - เหตุราชทัณฑ์ (corrections) ไม่นับขาด และตัดออกจากตัวหาร
 * - คาบหลังวันออกจากเรือนจำ ไม่นับ (ไม่ต้องมีแถวเช็คชื่อ)
 */

export const ATTENDANCE_STATUSES = ["present", "absent", "leave", "sick", "corrections"] as const;
export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_LABEL: Record<AttendanceStatus, string> = {
  present: "มา",
  absent: "ขาด",
  leave: "ลา",
  sick: "ป่วย",
  corrections: "เหตุราชทัณฑ์",
};

export const CORRECTIONS_TYPES: Record<string, string> = {
  court: "ไปศาล",
  lawyer: "พบทนาย",
  outside_hospital: "ออก รพ.ภายนอก",
  other: "เบิกตัวอื่นๆ",
};

export type AttendanceRecord = { status: AttendanceStatus; hours: number };

export function summarizeAttendance(records: AttendanceRecord[], targetHours: number, passPct: number) {
  let present = 0, absent = 0, leave = 0, sick = 0, corrections = 0;
  let presentHours = 0, countedHours = 0;
  for (const r of records) {
    if (r.status === "corrections") {
      corrections++;
      continue; // ตัดออกจากตัวหาร
    }
    countedHours += r.hours;
    if (r.status === "present") {
      present++;
      presentHours += r.hours;
    } else if (r.status === "absent") absent++;
    else if (r.status === "leave") leave++;
    else if (r.status === "sick") sick++;
  }
  const counted = present + absent + leave + sick;
  const pct = counted === 0 ? null : Math.round((present / counted) * 1000) / 10;
  return {
    present, absent, leave, sick, corrections,
    counted,
    total: records.length,
    pct,
    presentHours,
    countedHours,
    targetHours,
    belowThreshold: pct != null && pct < passPct,
    /** คาบที่ควรจัดสอนชดเชย = เหตุราชทัณฑ์ */
    needsMakeup: corrections,
  };
}
