import { FAST_WEEKS } from "./phases";

/**
 * แม่แบบตารางชุมชนบำบัด 24 สัปดาห์ (สเปก 16) — ⚠️ ร่างจากรายละเอียดในสเปก ยังไม่ได้เทียบกับคู่มือ FAST model
 * ผู้ดูแลตรวจแก้ตารางของรุ่นได้หลังสร้างรุ่น (ลากย้าย/แก้คาบ/ยกเลิกคาบ)
 *
 * วันที่ n ของแม่แบบ = (สัปดาห์ − 1) × 5 + ลำดับวัน (จันทร์ = 1 … ศุกร์ = 5)
 * ประจำวัน (สเปก): Morning Brief 08.00–08.30 · กลุ่มประชุมเช้า · Staff Meeting 10.00–11.00
 *   ("ปรับพฤติกรรม 15.00–16.00 เมื่อจำเป็น" ไม่สร้างคาบล่วงหน้า — เพิ่มคาบเองเมื่อมี)
 * ศุกร์ สัปดาห์ 3–14: การเรียนรู้แบบมีส่วนร่วม 12 หัวข้อ
 * ครอบครัว: เดือนละครั้ง + สัปดาห์ 15, 16, 23 · ศุกร์สัปดาห์ 24: ประเมินก่อนจบ
 */
export const FAST_LEARNING_TOPICS = [
  "วงจรการใช้ยาและหยุดความคิด", "การเปลี่ยนแปลงของร่างกาย", "ตัวกระตุ้น", "ความคิด-อารมณ์-พฤติกรรม", "ความรับผิดชอบและงาน", "การป้องกันการเสพซ้ำ",
  "ความไว้วางใจ", "ทักษะการสื่อสาร", "การปฏิเสธ", "แรงจูงใจใฝ่สัมฤทธิ์", "การแก้ปัญหา", "การตั้งเป้าหมาย",
];
/** สัปดาห์ที่มีกิจกรรมครอบครัว: เดือนละครั้ง (สัปดาห์ที่ 4, 8, 12, 20) + สัปดาห์ 15, 16, 23 ตามสเปก */
export const FAST_FAMILY_WEEKS = [4, 8, 12, 15, 16, 20, 23];
const CAT_DAILY = "กิจกรรมประจำวัน";
const CAT_STAFF = "เจ้าหน้าที่";
const CAT_LEARN = "การเรียนรู้แบบมีส่วนร่วม";
const CAT_FAMILY = "ครอบครัว";

/** ช่วงสัปดาห์ของแม่แบบตามคู่มือ (สเปก 16): 1, 2, 3–4, 5–14, 15–16, 17–20, 21–24 */
export const FAST_WEEK_BLOCKS: Array<{ from: number; to: number; activity: string }> = [
  { from: 1, to: 1, activity: "ปฐมนิเทศและเรียนรู้กฎของบ้าน" },
  { from: 2, to: 2, activity: "ปรับตัวเข้าสู่ชุมชนและงานบำบัด" },
  { from: 3, to: 4, activity: "งานบำบัดและกลุ่มบำบัด" },
  { from: 5, to: 14, activity: "งานบำบัดและกลุ่มบำบัด" },
  { from: 15, to: 16, activity: "งานบำบัดและเตรียมครอบครัว" },
  { from: 17, to: 20, activity: "เตรียมกลับสู่สังคมและฝึกวิชาชีพ" },
  { from: 21, to: 24, activity: "บ้านกึ่งวิถี: ฝึกปฏิบัติงานและวางแผนชีวิต" },
];
export const blockOf = (week: number) => FAST_WEEK_BLOCKS.find((b) => week >= b.from && week <= b.to)!;

export type TemplateRow = { dayNo: number; startTime: string; endTime: string; title: string; category: string | null; hours: number; takesAttendance: boolean; sortOrder: number };

export function fastTemplate(): TemplateRow[] {
  const rows: TemplateRow[] = [];
  for (let week = 1; week <= FAST_WEEKS; week++) {
    for (let d = 1; d <= 5; d++) {
      const dayNo = (week - 1) * 5 + d;
      const add = (startTime: string, endTime: string, title: string, category: string, hours: number, takesAttendance: boolean, sortOrder: number) =>
        rows.push({ dayNo, startTime, endTime, title, category, hours, takesAttendance, sortOrder });
      add("08:00", "08:30", "Morning Brief", CAT_STAFF, 0.5, false, 10);
      add("08:30", "09:30", "กลุ่มประชุมเช้า", CAT_DAILY, 1, true, 20);
      add("10:00", "11:00", "Staff Meeting", CAT_STAFF, 1, false, 30);
      const friday = d === 5;
      if (friday && week === FAST_WEEKS) add("13:00", "15:00", "ประเมินก่อนจบโปรแกรม", CAT_DAILY, 2, true, 40);
      else if (friday && week >= 3 && week <= 14) add("13:00", "15:00", FAST_LEARNING_TOPICS[week - 3], CAT_LEARN, 2, true, 40);
      else add("13:00", "15:00", blockOf(week).activity, CAT_DAILY, 2, true, 40);
      if (friday && FAST_FAMILY_WEEKS.includes(week)) add("15:00", "16:30", "กิจกรรมครอบครัว", CAT_FAMILY, 1.5, true, 50);
    }
  }
  return rows;
}

/** ชั่วโมงรวมของกิจกรรมที่สมาชิกเข้าร่วม (ไม่นับคาบของเจ้าหน้าที่) */
export const fastTotalHours = () => fastTemplate().filter((r) => r.takesAttendance).reduce((t, r) => t + r.hours, 0);
