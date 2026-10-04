import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { getSetting } from "../bootstrap";
import { notify } from "../notify";
import { nowInTZ } from "../thai-date";
import { activeAdminIds } from "../services/admin";

/** นอกเวลาราชการ = เสาร์-อาทิตย์ วันหยุดราชการ (ตารางวันหยุด) หรือนอกช่วง security.officeHours */
export function isOffHours(db: DB, now: Date = new Date()) {
  const t = nowInTZ(now);
  const office = getSetting(db, "security.officeHours", { start: "07:00", end: "18:00" });
  const hm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  const holiday = !!db.select({ d: schema.holidays.date }).from(schema.holidays).where(eq(schema.holidays.date, t.date)).get();
  return { off: t.weekday === 0 || t.weekday === 6 || holiday || hm < office.start || hm > office.end, hm, holiday };
}

/**
 * แจ้งเตือนการเข้าระบบนอกเวลาราชการ (สเปก 2.1)
 * - ผู้ดูแลเข้า → แจ้ง "ผู้ดูแลอีกคน" (ไม่แจ้งตัวเอง) ระดับเตือน — ชดเชยการไม่ใช้ OTP
 * - ผู้ใช้อื่นเข้า → แจ้งผู้ดูแลทุกคนแบบข้อมูล
 * ข้อความไม่มีข้อมูลผู้ต้องขัง
 */
export function notifyOffHoursLogin(db: DB, user: { id: number; firstName: string; lastName: string }, isAdmin: boolean, now: Date = new Date()) {
  const { off, hm, holiday } = isOffHours(db, now);
  if (!off) return false;
  const when = `${holiday ? "วันหยุดราชการ " : ""}${hm} น.`;
  if (isAdmin) {
    for (const id of activeAdminIds(db).filter((x) => x !== user.id)) {
      notify(db, { userId: id, severity: "warning", kind: "off_hours_admin_login", message: `ผู้ดูแลระบบ ${user.firstName} ${user.lastName} เข้าระบบนอกเวลาราชการ (${when}) — ถ้าไม่ใช่เจ้าตัว ให้ระงับบัญชี/เปลี่ยนรหัสทันที`, link: "/admin/audit" });
    }
  } else {
    notify(db, { role: "admin", severity: "info", kind: "off_hours_login", message: `${user.firstName} ${user.lastName} เข้าระบบนอกเวลาราชการ (${when})`, link: "/admin/audit" });
  }
  return true;
}
