/**
 * วันที่แบบไทย — ฟังก์ชันกลางที่เดียวของทั้งระบบ (สเปก 22)
 * เก็บ ค.ศ. 'YYYY-MM-DD' ในฐานข้อมูล แสดง พ.ศ. ใช้เวลา Asia/Bangkok เสมอ
 */

export const TZ = "Asia/Bangkok";

export const THAI_MONTHS = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];
export const THAI_MONTHS_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];
export const THAI_WEEKDAYS = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

const pad = (n: number) => String(n).padStart(2, "0");

/** วันที่วันนี้ (เวลาไทย) เป็น 'YYYY-MM-DD' */
export function todayISO(now: Date = new Date()): string {
  return toISODateInTZ(now);
}

/** แปลงเวลาเป็นวันที่ตามเวลาไทย */
export function toISODateInTZ(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** เวลาไทยปัจจุบัน { hour, minute, weekday } */
export function nowInTZ(now: Date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ, hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday"));
  return { date: toISODateInTZ(now), hour: Number(get("hour")), minute: Number(get("minute")), weekday: wd };
}

export function parseISO(iso: string): { y: number; m: number; d: number } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`รูปแบบวันที่ไม่ถูกต้อง: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function isValidISODate(iso: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

/** เลื่อนวันที่ (คิดแบบปฏิทิน ไม่ขึ้นกับ time zone) */
export function addDays(iso: string, days: number): string {
  const { y, m, d } = parseISO(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** 0=อาทิตย์ ... 6=เสาร์ */
export function weekdayOf(iso: string): number {
  const { y, m, d } = parseISO(iso);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diffDays(a: string, b: string): number {
  const pa = parseISO(a), pb = parseISO(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** ปีงบประมาณ (พ.ศ.) ของวันที่ — 1 ต.ค. ถึง 30 ก.ย. */
export function fiscalYearOf(iso: string): number {
  const { y, m } = parseISO(iso);
  return (m >= 10 ? y + 1 : y) + 543;
}

/** ช่วงวันที่ของปีงบประมาณ (รับปี พ.ศ.) */
export function fiscalYearRange(fyBE: number): { start: string; end: string } {
  const ce = fyBE - 543;
  return { start: `${ce - 1}-10-01`, end: `${ce}-09-30` };
}

export function currentFiscalYear(now: Date = new Date()): number {
  return fiscalYearOf(todayISO(now));
}

/** 5 ต.ค. 2569 */
export function formatThaiDate(iso: string | null | undefined, style: "short" | "long" | "full" = "short"): string {
  if (!iso) return "-";
  const { y, m, d } = parseISO(iso.slice(0, 10));
  const be = y + 543;
  if (style === "short") return `${d} ${THAI_MONTHS_SHORT[m - 1]} ${be}`;
  if (style === "long") return `${d} ${THAI_MONTHS[m - 1]} ${be}`;
  return `วัน${THAI_WEEKDAYS[weekdayOf(iso.slice(0, 10))]}ที่ ${d} ${THAI_MONTHS[m - 1]} พ.ศ. ${be}`;
}

/** วันเวลา: 5 ต.ค. 2569 14:05 น. (เวลาไทย) */
export function formatThaiDateTime(d: Date | number | null | undefined): string {
  if (d == null) return "-";
  const date = typeof d === "number" ? new Date(d) : d;
  const t = nowInTZ(date);
  return `${formatThaiDate(t.date)} ${pad(t.hour)}:${pad(t.minute)} น.`;
}

/** 'DD/MM/YYYY(พ.ศ.)' → ISO ค.ศ. ; รับ ค.ศ. ก็ได้ถ้าปี < 2400 */
export function parseThaiInput(s: string): string | null {
  const m = /^\s*(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\s*$/.exec(s);
  if (!m) return isValidISODate(s.trim()) ? s.trim() : null;
  let y = Number(m[3]);
  if (y > 2400) y -= 543;
  const iso = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  return isValidISODate(iso) ? iso : null;
}

/** อายุเต็มปี ณ วันที่ */
export function ageOn(birthISO: string, onISO: string): number {
  const b = parseISO(birthISO), o = parseISO(onISO);
  let age = o.y - b.y;
  if (o.m < b.m || (o.m === b.m && o.d < b.d)) age--;
  return age;
}

/**
 * คำนวณวันสิ้นสุดรุ่น: นับวันอบรมครบ n วัน ข้ามเสาร์-อาทิตย์/วันหยุดตามตั้งค่า
 * คืนรายการวันอบรมทั้งหมด (วันแรกคือวันเริ่ม ถ้าวันเริ่มเป็นวันหยุด จะเลื่อนไปวันทำการถัดไป)
 */
export function trainingDays(
  startISO: string,
  count: number,
  opts: { skipWeekends: boolean; holidays: Set<string> | string[] },
): string[] {
  const holidays = opts.holidays instanceof Set ? opts.holidays : new Set(opts.holidays);
  const out: string[] = [];
  let cur = startISO;
  let guard = 0;
  while (out.length < count && guard++ < 2000) {
    const wd = weekdayOf(cur);
    const isWeekend = wd === 0 || wd === 6;
    if (!(opts.skipWeekends && isWeekend) && !holidays.has(cur)) out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}
