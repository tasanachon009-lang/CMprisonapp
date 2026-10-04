/**
 * สิทธิ์ตามบทบาท (สเปก 2.2, 2.2-0, 2.2A) — ค่าเริ่มต้น ผู้ดูแลปรับรายคนได้ (permission_grants)
 * ใช้ตรวจที่ฝั่งเซิร์ฟเวอร์ทุกคำขอ และใช้ซ่อนเมนูที่ไม่มีสิทธิ์
 */

export const PERMISSIONS = {
  "settings.manage": "ตั้งค่าระบบ",
  "users.manage": "จัดการผู้ใช้และสิทธิ์",
  "audit.view": "ดูประวัติการใช้งาน",
  "backup.manage": "สำรอง/กู้คืนข้อมูล",
  "course.view": "ดูหลักสูตร/รุ่น",
  "course.manage": "สร้าง/แก้รุ่น",
  "registry.view": "ดูทะเบียนผู้ต้องขัง",
  "registry.edit": "ลงทะเบียน/แก้ทะเบียน",
  "registry.override_duplicate": "ปลดล็อกลงหลักสูตรซ้ำ",
  "registry.edit_inmate_no": "แก้เลขประจำตัวหลังบันทึก",
  "registry.import": "นำเข้าจาก Excel",
  "national_id.view_full": "ดูเลขบัตรประชาชนเต็ม",
  "release.view": "ดูบันทึกออกจากเรือนจำ",
  "release.edit": "บันทึกออกจากเรือนจำ",
  "attendance.view": "ดูการเช็คชื่อ",
  "attendance.edit": "เช็คชื่อทุกคาบ",
  "attendance.edit_own": "เช็คชื่อคาบที่ตนรับผิดชอบ",
  "schedule.view": "ดูตารางกิจกรรม",
  "health.view": "ดูข้อมูลสุขภาพ",
  "health.edit": "บันทึกข้อมูลสุขภาพกาย/จิต",
  "health.mental_edit": "บันทึกข้อมูลสุขภาพจิต",
  "health.summary": "ดูสรุปสุขภาพแบบไม่ระบุชื่อ",
  "export.names": "ส่งออก Excel ที่มีชื่อผู้ต้องขัง",
  "roster.view": "ดูใบรายชื่อนับยอด (ผู้ควบคุม)",
  "dashboard.view": "ดูแดชบอร์ดผู้บริหาร",
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ROLES = {
  admin: "ผู้ดูแลระบบ",
  rehab: "เจ้าหน้าที่หลัก (ฟื้นฟู)",
  medical: "สถานพยาบาล (สุขภาพทั้งหมด)",
  mental_health: "สถานพยาบาล (สุขภาพจิต)",
  assistant: "ผู้ช่วย",
  finance: "การเงิน",
  executive: "ผู้บริหาร (ดูอย่างเดียว)",
  warden: "ผู้ควบคุม (ดูอย่างเดียว)",
} as const;

export type Role = keyof typeof ROLES;

const ALL = Object.keys(PERMISSIONS) as Permission[];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  admin: ALL.filter((p) => p !== "roster.view" && p !== "attendance.edit_own"),
  rehab: [
    "course.view", "registry.view", "registry.edit", "registry.import", "national_id.view_full",
    "release.view", "release.edit", "attendance.view", "attendance.edit", "schedule.view", "export.names",
  ],
  medical: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.view", "health.edit", "health.mental_edit"],
  mental_health: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.view", "health.mental_edit"],
  assistant: ["schedule.view", "attendance.edit_own"],
  finance: ["course.view", "schedule.view"],
  executive: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.summary", "dashboard.view"],
  warden: ["roster.view"],
};

export const PROFESSIONS: Record<string, string> = {
  nurse: "พยาบาลวิชาชีพ",
  psychologist: "นักจิตวิทยา",
  vocational_trainer: "นักฝึกอบรมวิชาชีพ",
  social_worker: "นักสังคมสงเคราะห์",
  corrections_officer: "เจ้าหน้าที่ราชทัณฑ์",
  finance: "เจ้าหน้าที่การเงิน",
  executive: "ผู้บริหาร",
  other: "อื่นๆ",
};

/** บทบาทเริ่มต้นตามวิชาชีพ (สเปก 2.2-0) */
export const DEFAULT_ROLES_BY_PROFESSION: Record<string, Role[]> = {
  nurse: ["rehab", "medical"],
  psychologist: ["rehab", "mental_health"],
  vocational_trainer: ["assistant"],
  social_worker: ["assistant"],
  corrections_officer: ["warden"],
  finance: ["finance"],
  executive: ["executive"],
  other: [],
};

export type Grant = { permission: string; allow: boolean; scope: string | null; validFrom: string | null; validTo: string | null };

/** รวมสิทธิ์: บทบาททั้งหมด + การปรับรายคนที่ยังมีผลวันนี้ (ไม่มี scope) */
export function resolvePermissions(roles: string[], grants: Grant[], today: string): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_PERMISSIONS[r as Role] ?? []) set.add(p);
  for (const g of grants) {
    if (g.scope) continue;
    if (g.validFrom && today < g.validFrom) continue;
    if (g.validTo && today > g.validTo) continue;
    if (!(g.permission in PERMISSIONS)) continue;
    if (g.allow) set.add(g.permission as Permission);
    else set.delete(g.permission as Permission);
  }
  return set;
}

/** ขอบเขตรายรุ่นที่ได้รับมอบหมาย (กลุ่ม B) เช่น scope "cohort:12" */
export function scopedCohorts(grants: Grant[], today: string): number[] {
  return grants
    .filter((g) => g.allow && g.scope?.startsWith("cohort:"))
    .filter((g) => (!g.validFrom || today >= g.validFrom) && (!g.validTo || today <= g.validTo))
    .map((g) => Number(g.scope!.slice(7)))
    .filter((n) => Number.isFinite(n));
}
