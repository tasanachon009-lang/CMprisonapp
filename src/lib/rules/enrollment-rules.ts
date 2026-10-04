/**
 * กฎกันลงหลักสูตรซ้ำ (สเปก 7.2) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล ทดสอบได้ง่าย
 */

export type PriorEnrollment = {
  enrollmentId: number;
  incarcerationId: number;
  inmateNo: string;
  courseId: number;
  courseName: string;
  cohortLabel: string;
  status: string;
  /** ลงทะเบียนนี้ยังไม่จบ (draft/active) */
  isOngoing: boolean;
};

export type RuleResult = {
  /** block = ห้ามลง (ผู้ดูแลปลดล็อกได้), warn = ลงได้เมื่อยืนยัน, ok */
  level: "ok" | "warn" | "block";
  codes: Array<"duplicate_same_incarceration" | "returnee" | "ongoing_other_course">;
  messages: string[];
  /** ป้าย "กลับมาต้องโทษซ้ำ" */
  isReturnee: boolean;
};

export const ONGOING_STATUSES = new Set(["draft", "active"]);

export function evaluateEnrollment(input: {
  targetCourseId: number;
  incarcerationId: number | null; // null = การต้องโทษใหม่ยังไม่บันทึก
  priors: PriorEnrollment[]; // ทุกการลงทะเบียนของ "บุคคลเดียวกัน" ทุกการต้องโทษ
}): RuleResult {
  const res: RuleResult = { level: "ok", codes: [], messages: [], isReturnee: false };
  const sameInc = input.priors.filter((p) => input.incarcerationId != null && p.incarcerationId === input.incarcerationId);
  const otherInc = input.priors.filter((p) => input.incarcerationId == null || p.incarcerationId !== input.incarcerationId);

  // 1) เลขประจำตัวเดียวกัน + หลักสูตรเดียวกัน → บล็อก ไม่ว่ารุ่นก่อนจบหรือไม่
  const dup = sameInc.find((p) => p.courseId === input.targetCourseId);
  if (dup) {
    res.level = "block";
    res.codes.push("duplicate_same_incarceration");
    res.messages.push(
      `เลขประจำตัว ${dup.inmateNo} เคยลงหลักสูตร${dup.courseName} แล้ว (${dup.cohortLabel}) — ลงซ้ำไม่ได้ ต้องให้ผู้ดูแลปลดล็อกพร้อมเหตุผล`,
    );
  }

  // 2) เลขใหม่ แต่บุคคลเดิมเคยผ่านหลักสูตรนี้ → ลงได้ เตือนเหลือง + ป้าย "กลับมาต้องโทษซ้ำ"
  const returnee = otherInc.find((p) => p.courseId === input.targetCourseId);
  if (returnee) {
    res.isReturnee = true;
    res.codes.push("returnee");
    res.messages.push(
      `บุคคลนี้เคยเข้าหลักสูตร${returnee.courseName} เมื่อต้องโทษครั้งก่อน (เลข ${returnee.inmateNo}, ${returnee.cohortLabel}) — กลับมาต้องโทษซ้ำ`,
    );
  }
  // ผ่านหลักสูตรใดก็ตามในการต้องโทษครั้งก่อน ก็ถือว่ากลับมาต้องโทษซ้ำ
  if (otherInc.length > 0) res.isReturnee = true;

  // 3) กำลังอยู่หลักสูตรอื่น → เตือนเหลือง ลงได้เมื่อยืนยัน
  const ongoing = input.priors.find((p) => p.isOngoing && p.courseId !== input.targetCourseId);
  if (ongoing) {
    res.codes.push("ongoing_other_course");
    res.messages.push(`ขณะนี้กำลังอยู่ในหลักสูตร${ongoing.courseName} (${ongoing.cohortLabel})`);
  }

  if (res.level !== "block" && res.codes.length > 0) res.level = "warn";
  return res;
}

/** ระดับความคล้ายของชื่อ เมื่อไม่มีเลขบัตร: ชื่อ-สกุล + วันเกิดตรงกัน → "อาจเป็นคนเดียวกัน" */
export function isPossibleSamePerson(
  a: { searchKey: string; birthDate: string | null },
  b: { searchKey: string; birthDate: string | null },
): boolean {
  if (!a.searchKey || a.searchKey !== b.searchKey) return false;
  if (a.birthDate && b.birthDate) return a.birthDate === b.birthDate;
  return true; // ไม่มีวันเกิดฝั่งใดฝั่งหนึ่ง แต่ชื่อตรงกัน → ให้ผู้ใช้ตัดสิน
}
