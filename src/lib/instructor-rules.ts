/**
 * กฎของทะเบียนวิทยากร (สเปก 11.2, 11.5A–B) — ฟังก์ชันล้วน ใช้ได้ทั้งเซิร์ฟเวอร์และหน้าจอ
 */
import { isValidNationalId, maskNationalId } from "./thai-id";

export const BANKS = [
  "ธนาคารกรุงไทย", "ธนาคารกรุงเทพ", "ธนาคารกสิกรไทย", "ธนาคารไทยพาณิชย์", "ธนาคารกรุงศรีอยุธยา", "ธนาคารทหารไทยธนชาต",
  "ธนาคารออมสิน", "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)", "ธนาคารอาคารสงเคราะห์", "ธนาคารซีไอเอ็มบี ไทย",
  "ธนาคารยูโอบี", "ธนาคารเกียรตินาคินภัทร", "ธนาคารแลนด์ แอนด์ เฮ้าส์", "ธนาคารไอซีบีซี (ไทย)", "ธนาคารทิสโก้", "ธนาคารอิสลามแห่งประเทศไทย",
];
export const ACCOUNT_TYPE_LABEL: Record<string, string> = { savings: "ออมทรัพย์", current: "กระแสรายวัน", fixed: "ฝากประจำ" };
export const NOTIFY_LABEL: Record<string, string> = { sms: "SMS", email: "อีเมล", both: "SMS และอีเมล" };
export const KIND_LABEL: Record<string, string> = { internal: "ภายใน", external: "ภายนอก" };

export const digitsOnly = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** เลขบัญชี 10 หลัก → xxx-x-xxxxx-x (รูปแบบธนาคารไทยทั่วไป) · ความยาวอื่นแสดงตามเดิม */
export function formatAccountNo(s: string | null | undefined) {
  const d = digitsOnly(s);
  return d.length === 10 ? `${d.slice(0, 3)}-${d.slice(3, 4)}-${d.slice(4, 9)}-${d.slice(9)}` : d;
}

/** ปิดบังเลขบัญชี: xxx-x-x1234-x (เห็น 4 หลักท้ายก่อนหลักสุดท้าย) */
export function maskAccountNo(s: string | null | undefined) {
  const d = digitsOnly(s);
  if (!d) return "";
  if (d.length === 10) return `xxx-x-x${d.slice(5, 9)}-x`;
  return `${"x".repeat(Math.max(0, d.length - 4))}${d.slice(-4)}`;
}

export function maskPhone(s: string | null | undefined) {
  const d = digitsOnly(s);
  return d.length >= 4 ? `${"x".repeat(d.length - 4)}${d.slice(-4)}` : d;
}

export type InstructorFields = {
  kind: string; prefix?: string | null; firstName?: string | null; lastName?: string | null; externalType?: string | null;
  nationalId?: string | null; phone?: string | null; email?: string | null;
  addrHouseNo?: string | null; addrSubdistrict?: string | null; addrDistrict?: string | null; addrProvince?: string | null; addrPostcode?: string | null;
  payeeType?: string | null; companyName?: string | null; bank?: string | null; bankBranch?: string | null; accountType?: string | null;
  accountName?: string | null; accountNo?: string | null; notifyChannel?: string | null; bankBookReceived?: boolean | null;
};

/** ข้อผิดพลาดของข้อมูลที่กรอก (ไม่ใช่ความครบ) — ข้อความบอกว่าต้องทำอะไร */
export function validateInstructor(x: InstructorFields): string | null {
  if (!["internal", "external"].includes(x.kind)) return "กรุณาเลือกประเภทวิทยากร (ภายใน/ภายนอก)";
  if (x.kind === "external" && (!x.firstName?.trim() || !x.lastName?.trim())) return "กรุณาใส่ชื่อและนามสกุลวิทยากร";
  if (x.nationalId && !isValidNationalId(x.nationalId)) return "เลขประจำตัวประชาชน/เลขผู้เสียภาษีไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน) — ตรวจเลข 13 หลักอีกครั้ง";
  if (x.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x.email.trim())) return "รูปแบบอีเมลไม่ถูกต้อง";
  if (x.phone && !/^0\d{8,9}$/.test(digitsOnly(x.phone))) return "เบอร์โทรต้องเป็นตัวเลข 9–10 หลัก ขึ้นต้นด้วย 0";
  if (x.addrPostcode && !/^\d{5}$/.test(x.addrPostcode)) return "รหัสไปรษณีย์ต้องเป็นตัวเลข 5 หลัก";
  if (x.accountNo && !/^\d{10,15}$/.test(digitsOnly(x.accountNo))) return "เลขที่บัญชีต้องเป็นตัวเลข 10–15 หลัก";
  if (x.payeeType === "company" && !x.companyName?.trim()) return "ผู้รับเป็นนิติบุคคล — กรุณาใส่ชื่อบริษัท/ห้างหุ้นส่วน/ร้านค้า";
  if ((x.notifyChannel === "sms" || x.notifyChannel === "both") && !x.phone) return "เลือกแจ้งผลการโอนทาง SMS — กรุณาใส่เบอร์โทรศัพท์";
  if ((x.notifyChannel === "email" || x.notifyChannel === "both") && !x.email) return "เลือกแจ้งผลการโอนทางอีเมล — กรุณาใส่อีเมล";
  return null;
}

/** ความพร้อมเบิก (สเปก 11.5B): "พร้อมเบิก" หรือ "ข้อมูลไม่ครบ: ขาด …" */
export function readiness(x: InstructorFields & { displayName?: string | null }): { ready: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!(x.displayName ?? `${x.firstName ?? ""}${x.lastName ?? ""}`).trim()) missing.push("ชื่อ-สกุล");
  if (!x.nationalId) missing.push("เลขบัตรประชาชน");
  if (!x.addrHouseNo || !x.addrSubdistrict || !x.addrDistrict || !x.addrProvince) missing.push("ที่อยู่");
  if (!x.addrPostcode) missing.push("รหัสไปรษณีย์");
  if (!x.bank) missing.push("ธนาคาร");
  if (!x.accountName) missing.push("ชื่อบัญชี");
  if (!x.accountNo) missing.push("เลขบัญชี");
  if (!x.notifyChannel) missing.push("ช่องทางแจ้งผลการโอน");
  if (!x.bankBookReceived) missing.push("สำเนาหน้าสมุดบัญชี");
  return { ready: missing.length === 0, missing };
}

/** ข้อมูลอ่อนไหวสำหรับแสดงผล: ผู้มีสิทธิ์เห็นเต็ม / คนอื่นเห็นแบบปิดบัง */
export function presentSensitive(x: { nationalId?: string | null; accountNo?: string | null; phone?: string | null }, full: boolean) {
  return {
    nationalId: x.nationalId ? (full ? x.nationalId : maskNationalId(x.nationalId)) : "",
    accountNo: x.accountNo ? (full ? formatAccountNo(x.accountNo) : maskAccountNo(x.accountNo)) : "",
    phone: x.phone ?? "",
  };
}
