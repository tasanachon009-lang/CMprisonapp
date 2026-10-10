import { ageOn } from "../thai-date";

/**
 * เกณฑ์รับเข้าที่ระบบตรวจจากข้อมูลได้เอง (สเปก 16: ชุมชนบำบัด — ชั้นกลางขึ้นไป · อายุ 18–60 คำนวณจากวันเกิด)
 * ใช้ทั้งตอนลงทะเบียนและตอนยืนยันรับเข้าภายหลัง · ฟังก์ชันล้วน
 */
export type AutoCriteria = {
  minAge?: number;
  maxAge?: number;
  /** ชั้นนักโทษที่รับ (รหัสจากรายการ prisoner_class) */
  prisonerClasses?: string[];
  prisonerClassLabel?: string;
};

export function autoCriteriaGaps(crit: AutoCriteria | null | undefined, d: { birthDate?: string | null; prisonerClass?: string | null }, onDate: string): string[] {
  const gaps: string[] = [];
  if (!crit) return gaps;
  if (crit.minAge != null || crit.maxAge != null) {
    const range = `${crit.minAge ?? 0}–${crit.maxAge ?? "ขึ้นไป"} ปี`;
    if (!d.birthDate) gaps.push(`ยังไม่มีวันเกิด (หลักสูตรนี้รับอายุ ${range})`);
    else {
      const age = ageOn(d.birthDate, onDate);
      if ((crit.minAge != null && age < crit.minAge) || (crit.maxAge != null && age > crit.maxAge)) gaps.push(`อายุ ${age} ปี ไม่อยู่ในเกณฑ์ ${range}`);
    }
  }
  if (crit.prisonerClasses?.length) {
    const label = crit.prisonerClassLabel ?? "ชั้นนักโทษตามเกณฑ์";
    if (!d.prisonerClass) gaps.push(`ยังไม่ได้ระบุชั้นนักโทษ (หลักสูตรนี้รับ${label})`);
    else if (!crit.prisonerClasses.includes(d.prisonerClass)) gaps.push(`ชั้นนักโทษไม่อยู่ในเกณฑ์ (หลักสูตรนี้รับ${label})`);
  }
  return gaps;
}
