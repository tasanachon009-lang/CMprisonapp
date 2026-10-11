import { FAST_WEEKS } from "./phases";

/**
 * แม่แบบตารางชุมชนบำบัด 24 สัปดาห์ — ตาม "ตารางกิจกรรม" หน้า 37–43 ของคู่มือการฟื้นฟูสมรรถภาพผู้ต้องราชทัณฑ์ที่ติดยาเสพติด
 * รูปแบบชุมชนบำบัด-FAST Model (สบยช. กรมการแพทย์ พ.ศ. 2569) — ไฟล์คู่มือเก็บที่ docs/manuals/ (ไม่เข้า Git)
 * คู่มือมีตาราง 7 ชุด: สัปดาห์ 1 · 2 · 3–4 · 5–14 · 15–16 · 17–20 · 21–24
 *
 * วันที่ n ของแม่แบบ = (สัปดาห์ − 1) × 5 + ลำดับวัน (จันทร์ = 1 … ศุกร์ = 5) — เสาร์-อาทิตย์ในคู่มือเป็นกิจกรรมยามว่าง ไม่สร้างคาบ
 * สัปดาห์ 1–20: Morning Brief 08.00–08.30 และ Staff Meeting 10.00–11.00 จันทร์–ศุกร์ (คาบของเจ้าหน้าที่ ไม่เช็คชื่อสมาชิก)
 * "ปรับเปลี่ยนแก้ไขพฤติกรรม 15.00–16.00 เมื่อจำเป็น" ไม่สร้างคาบล่วงหน้า — เพิ่มคาบเองเมื่อมี
 * กิจกรรมครอบครัว: ศุกร์สัปดาห์ 15, 16, 23 เวลา 09.00–12.00 ตามคู่มือ · "เดือนละ 1 ครั้ง วันศุกร์สัปดาห์สุดท้ายของเดือน" (สัปดาห์ 5–14, 17–20)
 *   แม่แบบวางไว้ที่ศุกร์สัปดาห์ 8, 12, 20 เวลา 15.30–16.30 (คู่มือไม่ระบุเวลา) — ย้ายวันให้ตรงปฏิทินได้ที่ตารางของรุ่น
 */
export const FAST_LEARNING_TOPICS = [
  "วงจรการใช้ยาและหยุดความคิด", "การเปลี่ยนแปลงของร่างกาย", "ตัวกระตุ้น", "ความคิด-อารมณ์-พฤติกรรม", "ความรับผิดชอบและงาน", "การป้องกันการเสพซ้ำ",
  "ความไว้วางใจ", "ทักษะการสื่อสาร", "การปฏิเสธ", "แรงจูงใจใฝ่สัมฤทธิ์", "การแก้ปัญหา", "การตั้งเป้าหมาย",
];
/** สัปดาห์ที่มีกิจกรรมครอบครัว: 15, 16, 23 ระบุในคู่มือ · 8, 12, 20 = "เดือนละ 1 ครั้ง" */
export const FAST_FAMILY_WEEKS = [8, 12, 15, 16, 20, 23];
const FAMILY_TITLE: Record<number, string> = { 15: "กิจกรรมครอบครัว: การทำหน้าที่ในครอบครัว", 16: "กิจกรรมครอบครัว: ครอบครัวสัมพันธ์", 23: "กิจกรรมครอบครัว: ครอบครัวสัมพันธ์" };

export const CAT_DAILY = "กิจกรรมประจำวัน";
export const CAT_STAFF = "เจ้าหน้าที่";
export const CAT_GROUP = "กลุ่มบำบัด";
export const CAT_WORK = "งานบำบัด";
export const CAT_LEARN = "การเรียนรู้แบบมีส่วนร่วม";
export const CAT_FAMILY = "ครอบครัว";
export const CAT_JOB = "ฝึกปฏิบัติงาน";

export const FAST_MEETING = "กลุ่มประชุมเช้า";
export const FAST_FINAL = "ประเมินก่อนจบโปรแกรม";
const EQ = ["การสร้างสัมพันธภาพ", "การรู้จักตนเอง", "การจัดการอารมณ์ตนเอง", "การเข้าใจคนอื่น", "การสร้างแรงจูงใจ"].map((x) => `กิจกรรมสร้างสรรค์ EQ: ${x}`);
const WORK = "กิจกรรมงานบำบัด", TEAM = "กลุ่มประชุมทีมงาน", MULTI = "พบสหวิชาชีพ/กิจกรรมงานบำบัด", JOB = "ฝึกปฏิบัติงานหน่วยงานย่อย", OUT = "ปฏิบัติหน้าที่ตามหน่วยงานภายนอก";

type Slot = [start: string, end: string, title: string, category: string];
const s = (start: string, end: string, title: string, category: string = CAT_GROUP): Slot => [start, end, title, category];
const hoursOf = (a: string, b: string) => { const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return (m(b) - m(a)) / 60; };

/** คาบของสมาชิกในวันที่ d (1 = จันทร์ … 5 = ศุกร์) ของสัปดาห์ week ตามตารางในคู่มือ */
export function fastDay(week: number, d: number): Slot[] {
  const i = d - 1;
  const meet = s("09:00", "10:00", FAST_MEETING, CAT_DAILY);
  const afternoonEntry = [
    s("13:00", "14:30", ["กลุ่มสัมมนา: การดูแลตัวเอง (Feeling)", "การใช้เวลาว่างให้เป็นประโยชน์", "กลุ่มสัมมนา: การดูแลตัวเอง (ตามบริบทปัญหา)", "การใช้เวลาว่างให้เป็นประโยชน์: กลุ่มศิลปะ", "กลุ่มสัมมนา: นักวิชาชีพ"][i]),
    s("14:30", "15:30", EQ[i]),
  ];
  if (week === 1) return [
    ...(d === 1 ? [s("09:00", "10:30", "กลุ่มปฐมนิเทศ: เรียนรู้รูปแบบโปรแกรม")] : [s("09:00", "09:30", "ฝึกกายบริหาร/ระเบียบวินัย", CAT_DAILY), s("09:30", "10:30", "Morning Talk Group", CAT_DAILY)]),
    s("10:30", "12:00", ["Focus group (ประเมิน SCL-90)", "เรียนรู้กิจวัตรประจำวัน (ปรัชญาและอุดมการณ์)", "เรียนรู้ Talking to", "เรียนรู้ Pull up", "Wrap up: เรียนรู้ชีวิตที่ผ่านมา 5 วัน"][i]),
    ...afternoonEntry,
  ];
  if (week === 2) return [
    meet,
    s("10:00", "11:00", d <= 3 ? "Static group (เรียนรู้ปรัชญา)" : "Static group (เรียนรู้อุดมการณ์)"),
    s("11:00", "12:00", ["Focus group (พบครูที่ปรึกษา)", "เรียนรู้กิจวัตรประจำวันในระยะฟื้นฟู", "เรียนรู้ Talking to", "เรียนรู้ Pull up", "Wrap up: เรียนรู้ชีวิตที่ผ่านมา 5 วัน"][i]),
    ...afternoonEntry,
  ];
  if (week <= 16) {
    const late = week >= 15, early = week <= 4;
    const morning: Slot[] =
      d === 5 ? (late ? [s("09:00", "12:00", FAMILY_TITLE[week], CAT_FAMILY)] : [meet, s("10:00", "12:00", FAST_LEARNING_TOPICS[week - 3], CAT_LEARN)])
        : d === 3 ? [meet, s("10:00", "12:00", MULTI, CAT_WORK)]
          : early && d === 1 ? [week === 3 ? s("09:00", "10:00", "กลุ่มปฐมนิเทศ: การเข้าสู่ระยะฟื้นฟู") : meet, s("10:00", "11:00", "Static group (ปรัชญา/อุดมการณ์ ต่อ)"), s("11:00", "12:00", WORK, CAT_WORK)]
            : early && d === 4 ? [meet, s("10:00", "11:00", "Static group (แบ่งกลุ่มพบที่ปรึกษา)"), s("11:00", "12:00", WORK, CAT_WORK)]
              : [meet, s("10:00", "12:00", WORK, CAT_WORK)];
    const pm = early
      ? ["กลุ่มสุขศึกษา", "กลุ่มสัมมนา: วิถีแห่งการอยู่ร่วมกัน", "กลุ่มนันทนาการ", "กลุ่มศิลปะ", "กลุ่มประเมินทีมงาน"]
      : late
        ? ["กลุ่มพบที่ปรึกษา", "กลุ่มสัมมนา: การพัฒนาจิต", "กลุ่มนันทนาการ", "กลุ่มทบทวนการดูแลตนเอง (Global group)", "กลุ่มประเมินทีมงาน"]
        : ["กลุ่มพบที่ปรึกษา", "กลุ่มสัมมนา: วิถีแห่งการอยู่ร่วมกัน", "กลุ่มนันทนาการ", "กลุ่มศิลปะ", "กลุ่มประเมินทีมงาน"];
    return [
      ...morning,
      s("13:00", "14:30", pm[i]),
      early && d === 1 ? s("14:30", "15:30", "กิจกรรมยามว่าง/ทำงานในทีมงาน", CAT_DAILY) : s("14:30", "15:30", TEAM),
      ...(d === 5 && FAST_FAMILY_WEEKS.includes(week) && !late ? [s("15:30", "16:30", "กิจกรรมครอบครัว", CAT_FAMILY)] : []),
    ];
  }
  if (week <= 20) return [
    ...(week === 17 && d === 1 ? [s("09:00", "12:00", "กลุ่มปฐมนิเทศ: แนะแนวทางการออกฝึกงาน")] : [meet, s("10:00", "12:00", JOB, CAT_JOB)]),
    d === 5 ? s("13:00", "14:30", "กลุ่มฝึกทักษะทางสังคม/การป้องกันการกลับไปใช้ซ้ำ/ทักษะชีวิต/การสื่อสาร I-message") : s("13:00", "14:30", JOB, CAT_JOB),
    s("14:30", "15:30", "พบที่ปรึกษา"),
    ...(d === 5 && FAST_FAMILY_WEEKS.includes(week) ? [s("15:30", "16:30", "กิจกรรมครอบครัว", CAT_FAMILY)] : []),
  ];
  // บ้านกึ่งวิถี สัปดาห์ 21–24
  if (d < 5) return [s("09:00", "12:00", OUT, CAT_JOB), s("13:00", "14:30", OUT, CAT_JOB)];
  return [
    week === 24 ? s("09:00", "12:00", FAST_FINAL, CAT_DAILY) : week === 23 ? s("09:00", "12:00", FAMILY_TITLE[23], CAT_FAMILY) : s("09:00", "12:00", "กลุ่มประชุมเช้า (MM) / Free time", CAT_DAILY),
    s("13:00", "14:30", "พบกลุ่มที่ปรึกษา"),
  ];
}

export type TemplateRow = { dayNo: number; startTime: string; endTime: string; title: string; category: string | null; hours: number; takesAttendance: boolean; sortOrder: number };

export function fastTemplate(): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (let week = 1; week <= FAST_WEEKS; week++) {
    for (let d = 1; d <= 5; d++) {
      const dayNo = (week - 1) * 5 + d;
      if (week <= 20) {
        rows.push({ dayNo, startTime: "08:00", endTime: "08:30", title: "Morning Brief", category: CAT_STAFF, hours: 0.5, takesAttendance: false, sortOrder: 5 });
        rows.push({ dayNo, startTime: "10:00", endTime: "11:00", title: "Staff Meeting", category: CAT_STAFF, hours: 1, takesAttendance: false, sortOrder: 6 });
      }
      fastDay(week, d).forEach(([startTime, endTime, title, category], k) => rows.push({ dayNo, startTime, endTime, title, category, hours: hoursOf(startTime, endTime), takesAttendance: true, sortOrder: (k + 1) * 10 }));
    }
  }
  return rows;
}

/** ชั่วโมงรวมของกิจกรรมที่สมาชิกเข้าร่วม (ไม่นับคาบของเจ้าหน้าที่) */
export const fastTotalHours = () => fastTemplate().filter((r) => r.takesAttendance).reduce((t, r) => t + r.hours, 0);

/** แม่แบบร่างชุดเดิม (ก่อนมีคู่มือ): ชื่อคาบและชั่วโมงรวม — ใช้ตรวจว่าฐานข้อมูลยังเป็นร่างเดิมหรือผู้ดูแลแก้แล้ว */
export const FAST_DRAFT_TITLES = [
  "Morning Brief", "กลุ่มประชุมเช้า", "Staff Meeting", "กิจกรรมครอบครัว", "ประเมินก่อนจบโปรแกรม", ...FAST_LEARNING_TOPICS,
  "ปฐมนิเทศและเรียนรู้กฎของบ้าน", "ปรับตัวเข้าสู่ชุมชนและงานบำบัด", "งานบำบัดและกลุ่มบำบัด", "งานบำบัดและเตรียมครอบครัว", "เตรียมกลับสู่สังคมและฝึกวิชาชีพ", "บ้านกึ่งวิถี: ฝึกปฏิบัติงานและวางแผนชีวิต",
];
export const FAST_DRAFT_ONLY_TITLES = FAST_DRAFT_TITLES.slice(-6);
export const FAST_DRAFT_TOTAL_HOURS = 370.5;
