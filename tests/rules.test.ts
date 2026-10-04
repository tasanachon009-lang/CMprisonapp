import { describe, it, expect } from "vitest";
import { isValidNationalId, maskNationalId, formatNationalId } from "@/lib/thai-id";
import { evaluateEnrollment, isPossibleSamePerson, type PriorEnrollment } from "@/lib/rules/enrollment-rules";
import { summarizeAttendance } from "@/lib/rules/attendance-rules";
import { checkPassword } from "@/lib/password-policy";
import { normalizeSearch, personSearchKey } from "@/lib/search";
import { hotp, verifyTotp, base32Encode, base32Decode } from "@/lib/auth/totp";

describe("เลขบัตรประชาชน", () => {
  it("ตรวจ check digit", () => {
    expect(isValidNationalId("1101700230708")).toBe(true);
    expect(isValidNationalId("1-1017-00230-70-8")).toBe(true);
    expect(isValidNationalId("1101700230705")).toBe(false);
    expect(isValidNationalId("12345")).toBe(false);
  });
  it("ปิดบังและจัดรูปแบบ", () => {
    expect(maskNationalId("1101700230708")).toBe("x-xxxx-xxxxx-70-8");
    expect(formatNationalId("1101700230708")).toBe("1-1017-00230-70-8");
    expect(maskNationalId(null)).toBe("-");
  });
});

const prior = (o: Partial<PriorEnrollment>): PriorEnrollment => ({
  enrollmentId: 1, incarcerationId: 10, inmateNo: "A001", courseId: 1, courseName: "12 วัน",
  cohortLabel: "รุ่นที่ 1/2569", status: "completed", isOngoing: false, ...o,
});

describe("กฎกันลงซ้ำ (7.2)", () => {
  it("ไม่มีประวัติ → ลงได้", () => {
    expect(evaluateEnrollment({ targetCourseId: 1, incarcerationId: 10, priors: [] }).level).toBe("ok");
  });
  it("เลขเดียวกัน + หลักสูตรเดียวกัน → บล็อก แม้รุ่นก่อนจบแล้ว", () => {
    const r = evaluateEnrollment({ targetCourseId: 1, incarcerationId: 10, priors: [prior({})] });
    expect(r.level).toBe("block");
    expect(r.codes).toContain("duplicate_same_incarceration");
  });
  it("เลขเดียวกัน + หลักสูตรเดียวกัน ที่ยังไม่จบ → บล็อก", () => {
    const r = evaluateEnrollment({ targetCourseId: 1, incarcerationId: 10, priors: [prior({ isOngoing: true, status: "active" })] });
    expect(r.level).toBe("block");
  });
  it("เลขใหม่ แต่บุคคลเดิมเคยผ่านหลักสูตรนี้ → เตือน + กลับมาต้องโทษซ้ำ", () => {
    const r = evaluateEnrollment({ targetCourseId: 1, incarcerationId: 20, priors: [prior({ incarcerationId: 10 })] });
    expect(r.level).toBe("warn");
    expect(r.isReturnee).toBe(true);
    expect(r.codes).toContain("returnee");
  });
  it("การต้องโทษใหม่ที่ยังไม่บันทึก (null) ถือเป็นเลขใหม่", () => {
    const r = evaluateEnrollment({ targetCourseId: 1, incarcerationId: null, priors: [prior({})] });
    expect(r.level).toBe("warn");
    expect(r.isReturnee).toBe(true);
  });
  it("กำลังอยู่หลักสูตรอื่น → เตือน", () => {
    const r = evaluateEnrollment({ targetCourseId: 1, incarcerationId: 10, priors: [prior({ courseId: 2, courseName: "ชุมชนบำบัด", isOngoing: true })] });
    expect(r.level).toBe("warn");
    expect(r.codes).toEqual(["ongoing_other_course"]);
    expect(r.isReturnee).toBe(false);
  });
  it("อาจเป็นคนเดียวกัน: ชื่อ-สกุล + วันเกิด", () => {
    const k = personSearchKey("สมชาย", "ใจดี");
    expect(isPossibleSamePerson({ searchKey: k, birthDate: "1990-01-01" }, { searchKey: k, birthDate: "1990-01-01" })).toBe(true);
    expect(isPossibleSamePerson({ searchKey: k, birthDate: "1990-01-01" }, { searchKey: k, birthDate: "1991-01-01" })).toBe(false);
  });
});

describe("การเข้าร่วม (9)", () => {
  it("เหตุราชทัณฑ์ตัดออกจากตัวหาร", () => {
    const s = summarizeAttendance(
      [
        { status: "present", hours: 3 },
        { status: "present", hours: 3 },
        { status: "absent", hours: 3 },
        { status: "corrections", hours: 3 },
      ],
      60, 80,
    );
    expect(s.counted).toBe(3);
    expect(s.pct).toBe(66.7);
    expect(s.belowThreshold).toBe(true);
    expect(s.needsMakeup).toBe(1);
    expect(s.presentHours).toBe(6);
  });
  it("ไม่มีคาบที่นับ → ยังไม่มี %", () => {
    expect(summarizeAttendance([{ status: "corrections", hours: 1 }], 60, 80).pct).toBeNull();
  });
});

describe("OTP (TOTP RFC 6238)", () => {
  it("ตรงกับ test vector ของ RFC", () => {
    // RFC 6238 ภาคผนวก B: secret "12345678901234567890", T=59 → 94287082 (8 หลัก) → 6 หลักท้าย 287082
    const secret = base32Encode(Buffer.from("12345678901234567890"));
    expect(base32Decode(secret).toString()).toBe("12345678901234567890");
    expect(hotp(secret, 1)).toBe("287082");
    expect(verifyTotp(secret, "287082", 59_000)).toBe(1);
    expect(verifyTotp(secret, "287082", 59_000, 1)).toBeNull(); // ห้ามใช้รหัสซ้ำ
    expect(verifyTotp(secret, "000000", 59_000)).toBeNull();
  });
});

describe("รหัสผ่านและการค้นหา", () => {
  it("นโยบายรหัสผ่าน", () => {
    expect(checkPassword("short1")).not.toBeNull();
    expect(checkPassword("12345678")).not.toBeNull();
    expect(checkPassword("abcdefgh")).not.toBeNull();
    expect(checkPassword("somchai2569", { firstName: "somchai" })).not.toBeNull();
    expect(checkPassword("rehab-cm-2569")).toBeNull();
  });
  it("ค้นหาไม่สนคำนำหน้า/ช่องว่าง", () => {
    expect(normalizeSearch("นาย สมชาย")).toBe("สมชาย");
    expect(normalizeSearch("น.ส. สม ใจ")).toBe("สมใจ");
  });
});
