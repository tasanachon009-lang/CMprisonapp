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
  "schedule.edit": "จัดวิทยากร/ผู้รับผิดชอบคาบ",
  "health.view": "ดูข้อมูลสุขภาพ",
  "health.edit": "บันทึกข้อมูลสุขภาพกาย/จิต",
  "health.mental_edit": "บันทึกข้อมูลสุขภาพจิต",
  "health.summary": "ดูสรุปสุขภาพแบบไม่ระบุชื่อ",
  "export.names": "ส่งออก Excel ที่มีชื่อผู้ต้องขัง",
  "roster.view": "ดูใบรายชื่อนับยอด (ผู้ควบคุม)",
  "dashboard.view": "ดูแดชบอร์ดผู้บริหาร",
  // ขั้นที่ 2
  "assessment.view": "ดูแบบประเมินด้านความรู้/ทัศนคติ/พฤติกรรม",
  "assessment.edit": "บันทึกแบบประเมินด้านความรู้/ทัศนคติ/พฤติกรรม",
  "assessment.summary": "ดูสรุปผลประเมิน (ไม่ระบุชื่อ)",
  "forms.manage": "แก้คลังแบบประเมิน (ข้อคำถาม/เกณฑ์)",
  "bst.view": "ดูงาน บสต. และ รท.101",
  "bst.edit": "บันทึกงาน บสต./รท.101 และการติดตาม",
  "contacts.edit": "บันทึกข้อมูลญาติ/ผู้ติดต่อ",
  "behavior.edit": "บันทึกพฤติกรรมด่วน",
  "reports.view": "ดู/พิมพ์รายงานรายบุคคล-รายรุ่น",
  "shift.use": "ใช้กล่องจดหมายเวร",
  // ขั้น 3
  "instructors.view": "ดูทะเบียนวิทยากร",
  "instructors.manage": "เพิ่ม/แก้ทะเบียนวิทยากร",
  "instructors.sensitive": "ดูเลขบัตร/ที่อยู่/เลขบัญชีวิทยากรแบบเต็ม",
  "rates.manage": "ตั้งอัตราค่าตอบแทน",
  "topics.manage": "แก้คลังหัวข้อ",
  "pay.view": "ดูค่าตอบแทนและรอบเบิก",
  "pay.manage": "สร้างรอบเบิก/ตรวจยอดค่าตอบแทน",
  "pay.approve": "อนุมัติค่าตอบแทน (ล็อกคาบ)",
  "budget.approve": "ยืนยันการใช้เกินงบหมวด (แหล่งเงินห้ามถัว)",
  "budget.view": "ดูงบประมาณ",
  "budget.manage": "จัดสรรงบ / ตั้งงบของรุ่น",
  "budget.spend": "บันทึกใช้จ่ายจริง / คืนเงินเหลือ",
  "reports.weekly": "แก้และอนุมัติรายงานประจำสัปดาห์",
  "line.manage": "ตั้งค่า/ส่งทดสอบ LINE",
  // ขั้น 4
  "docs.view": "ดู/พิมพ์เอกสารราชการของรุ่น",
  "docs.manage": "สร้าง/แก้เอกสารราชการของรุ่น",
  "docs.templates": "แก้แม่แบบเอกสารราชการ",
  // ขั้น 5: ชุมชนบำบัด FAST
  "tc.view": "ดูข้อมูลชุมชนบำบัด (ระยะ ตำแหน่ง ทีม เครื่องมือบ้าน)",
  "tc.edit": "บันทึกข้อมูลชุมชนบำบัด",
  "tc.approve": "อนุมัติเลื่อนระยะการบำบัด",
  "tc.summary": "ดูสรุปชุมชนบำบัด (ไม่ระบุชื่อ)",
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
  admin: ALL.filter((p) => p !== "roster.view" && p !== "attendance.edit_own" && p !== "tc.summary"),
  rehab: [
    "course.view", "registry.view", "registry.edit", "registry.import", "national_id.view_full",
    "release.view", "release.edit", "attendance.view", "attendance.edit", "schedule.view", "schedule.edit", "export.names", "instructors.view", "instructors.manage",
    "assessment.view", "assessment.edit", "bst.view", "bst.edit", "contacts.edit", "behavior.edit", "reports.view", "shift.use", "docs.view", "docs.manage",
    "tc.view", "tc.edit",
  ],
  medical: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.view", "health.edit", "health.mental_edit", "assessment.view", "bst.view", "reports.view", "shift.use", "tc.view"],
  mental_health: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.view", "health.mental_edit", "assessment.view", "bst.view", "reports.view", "shift.use", "tc.view"],
  // กลุ่ม B: กล่องจดหมายเวรแบบจำกัด (ส่งได้ · รับเฉพาะที่ระบุถึงตน/รุ่นที่ตนสอน — services/shift.ts)
  assistant: ["schedule.view", "attendance.edit_own", "shift.use"],
  // การเงิน/ผู้บริหาร: ไม่มีกล่องจดหมายเวร (สเปก 20) · ผู้บริหารดูสรุปเท่านั้น ไม่เห็นรายชื่องาน บสต./รท.101
  // การเงิน: ทะเบียนวิทยากร (รวมข้อมูลเบิกจ่ายแบบเต็ม) และอัตราค่าตอบแทน
  finance: ["course.view", "schedule.view", "instructors.view", "instructors.manage", "instructors.sensitive", "rates.manage", "pay.view", "pay.manage", "budget.view", "budget.spend", "docs.view"],
  executive: ["course.view", "registry.view", "release.view", "attendance.view", "schedule.view", "health.summary", "dashboard.view", "assessment.summary", "budget.view", "tc.summary"],
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

/** สิทธิ์ที่มอบหมายเป็นรายรุ่นได้ (กลุ่ม B — สเปก 2.2-0, 2.2A) */
export const SCOPABLE: Permission[] = ["attendance.edit_own", "contacts.edit", "bst.view", "bst.edit", "behavior.edit"];

function activeScoped(grants: Grant[], today: string) {
  return grants
    .filter((g) => g.allow && g.scope?.startsWith("cohort:") && SCOPABLE.includes(g.permission as Permission))
    .filter((g) => (!g.validFrom || today >= g.validFrom) && (!g.validTo || today <= g.validTo))
    .map((g) => ({ permission: g.permission as Permission, cohortId: Number(g.scope!.slice(7)) }))
    .filter((x) => Number.isFinite(x.cohortId));
}

/** ขอบเขตรายรุ่นที่ได้รับมอบหมาย (ทุกสิทธิ์รวมกัน) เช่น scope "cohort:12" */
export function scopedCohorts(grants: Grant[], today: string): number[] {
  return Array.from(new Set(activeScoped(grants, today).map((x) => x.cohortId)));
}

/** สิทธิ์รายรุ่น: permission → รุ่นที่ได้รับมอบหมาย */
export function scopedPermissions(grants: Grant[], today: string): Partial<Record<Permission, number[]>> {
  const out: Partial<Record<Permission, number[]>> = {};
  for (const x of activeScoped(grants, today)) (out[x.permission] ??= []).push(x.cohortId);
  return out;
}

/** รุ่นที่ได้รับมอบหมายงานญาติ/ติดตาม/บสต./พฤติกรรม (ไม่นับเช็คชื่อ) — ใช้แสดงหน้า "งานที่ได้รับมอบหมาย" */
export function assignedCohortIds(a: { scoped: Partial<Record<Permission, number[]>> }) {
  const ids = (["contacts.edit", "bst.view", "bst.edit", "behavior.edit"] as Permission[]).flatMap((p) => a.scoped[p] ?? []);
  return Array.from(new Set(ids));
}

/** มีสิทธิ์ทั้งระบบ หรือได้รับมอบหมายในรุ่นใดรุ่นหนึ่งที่ระบุ */
export function canInCohorts(perms: Set<Permission>, scoped: Partial<Record<Permission, number[]>>, p: Permission, cohortIds: number[]) {
  return perms.has(p) || cohortIds.some((id) => scoped[p]?.includes(id));
}

/** มอบอำนาจอนุมัติชั่วคราว (สเปก 22B): ขอบเขต → สิทธิ์ที่ได้ระหว่างช่วงมอบอำนาจ (ไม่รวมงานที่ต้องยืนยัน 2 คน) */
export const DELEGATION_SCOPES = {
  pay: { label: "อนุมัติค่าตอบแทน", perms: ["pay.view", "pay.approve"] },
  budget: { label: "อนุมัติงบประมาณ", perms: ["budget.approve"] },
  schedule: { label: "อนุมัติคำขอเปลี่ยนตาราง", perms: ["schedule.edit"] },
} as const satisfies Record<string, { label: string; perms: Permission[] }>;
export type DelegationScope = keyof typeof DELEGATION_SCOPES;