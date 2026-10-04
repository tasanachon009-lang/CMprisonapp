import { describe, it, expect } from "vitest";
import {
  fiscalYearOf, fiscalYearRange, formatThaiDate, addDays, trainingDays, parseThaiInput, ageOn, toISODateInTZ, formatThaiDateTime,
} from "@/lib/thai-date";

describe("ปีงบประมาณ", () => {
  it("1 ต.ค. เริ่มปีงบใหม่", () => {
    expect(fiscalYearOf("2025-09-30")).toBe(2568);
    expect(fiscalYearOf("2025-10-01")).toBe(2569);
    expect(fiscalYearOf("2026-09-30")).toBe(2569);
    expect(fiscalYearOf("2026-10-01")).toBe(2570);
  });
  it("ช่วงวันที่ของปีงบ", () => {
    expect(fiscalYearRange(2569)).toEqual({ start: "2025-10-01", end: "2026-09-30" });
  });
});

describe("แสดงผล พ.ศ.", () => {
  it("รูปแบบสั้น/ยาว/เต็ม", () => {
    expect(formatThaiDate("2026-10-05")).toBe("5 ต.ค. 2569");
    expect(formatThaiDate("2026-10-05", "long")).toBe("5 ตุลาคม 2569");
    expect(formatThaiDate("2026-10-05", "full")).toBe("วันจันทร์ที่ 5 ตุลาคม พ.ศ. 2569");
    expect(formatThaiDate(null)).toBe("-");
  });
  it("เวลาไทยถูกต้องแม้เครื่องตั้งเป็น UTC", () => {
    // 2026-10-04 20:30 UTC = 2026-10-05 03:30 เวลาไทย
    const d = new Date(Date.UTC(2026, 9, 4, 20, 30));
    expect(toISODateInTZ(d)).toBe("2026-10-05");
    expect(formatThaiDateTime(d)).toBe("5 ต.ค. 2569 03:30 น.");
  });
  it("รับวันที่ที่พิมพ์ พ.ศ.", () => {
    expect(parseThaiInput("5/10/2569")).toBe("2026-10-05");
    expect(parseThaiInput("05-10-2026")).toBe("2026-10-05");
    expect(parseThaiInput("31/02/2569")).toBeNull();
  });
});

describe("คำนวณวัน", () => {
  it("ข้ามเดือน/ปีอธิกสุรทิน", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
  it("วันอบรม 12 วัน ข้ามเสาร์-อาทิตย์และวันหยุด", () => {
    // 5 ต.ค. 2569 = จันทร์, 13 ต.ค. (อังคาร) วันหยุด
    const days = trainingDays("2026-10-05", 12, { skipWeekends: true, holidays: ["2026-10-13"] });
    expect(days.length).toBe(12);
    expect(days[0]).toBe("2026-10-05");
    expect(days).not.toContain("2026-10-10");
    expect(days).not.toContain("2026-10-13");
    expect(days[11]).toBe("2026-10-21");
  });
  it("อายุเต็มปี", () => {
    expect(ageOn("1990-10-05", "2026-10-04")).toBe(35);
    expect(ageOn("1990-10-05", "2026-10-05")).toBe(36);
  });
});
