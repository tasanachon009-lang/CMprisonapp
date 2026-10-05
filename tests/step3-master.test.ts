import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { validateInstructor, readiness, maskAccountNo, formatAccountNo, presentSensitive } from "@/lib/instructor-rules";
import { searchSubdistricts } from "@/lib/thai-address";
import { saveInstructor, listInstructors } from "@/lib/services/instructors";
import { saveRate, saveTopic, bulkUpdateTopics, listTopics } from "@/lib/services/pay-setup";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff, maxStaffOf } from "@/lib/services/schedule";

const VALID_ID = "1101700230708";
const actor = { userId: 1 };

describe("กฎทะเบียนวิทยากร (สเปก 11.5B)", () => {
  it("ตรวจเลขบัตร check digit · อีเมล · เบอร์ · เลขบัญชี · ช่องทางแจ้งผลต้องมีข้อมูล", () => {
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", nationalId: "1101700230709" })).toMatch(/ไม่ถูกต้อง/);
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", nationalId: VALID_ID })).toBeNull();
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "" })).toMatch(/นามสกุล/);
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", email: "x@" })).toMatch(/อีเมล/);
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", accountNo: "123" })).toMatch(/10–15/);
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", notifyChannel: "sms" })).toMatch(/เบอร์/);
    expect(validateInstructor({ kind: "external", firstName: "ก", lastName: "ข", payeeType: "company" })).toMatch(/นิติบุคคล/);
  });
  it("สถานะพร้อมเบิก / ข้อมูลไม่ครบ บอกว่าขาดอะไร", () => {
    const r = readiness({ kind: "external", firstName: "ก", lastName: "ข", nationalId: VALID_ID });
    expect(r.ready).toBe(false);
    expect(r.missing).toEqual(expect.arrayContaining(["ที่อยู่", "เลขบัญชี", "สำเนาหน้าสมุดบัญชี"]));
    expect(readiness({ kind: "external", firstName: "ก", lastName: "ข", nationalId: VALID_ID, addrHouseNo: "1", addrSubdistrict: "ก", addrDistrict: "ข", addrProvince: "ค", addrPostcode: "50000", bank: "ธนาคารกรุงไทย", accountName: "ก ข", accountNo: "1234567890", notifyChannel: "sms", bankBookReceived: true }).ready).toBe(true);
  });
  it("ปิดบังเลขบัญชี xxx-x-x1234-x และจัดรูปแบบเลขบัญชี", () => {
    expect(formatAccountNo("1234567890")).toBe("123-4-56789-0");
    expect(maskAccountNo("1234567890")).toBe("xxx-x-x6789-x");
    expect(presentSensitive({ nationalId: VALID_ID, accountNo: "1234567890" }, false)).toMatchObject({ nationalId: "x-xxxx-xxxxx-70-8", accountNo: "xxx-x-x6789-x" });
    expect(presentSensitive({ nationalId: VALID_ID, accountNo: "1234567890" }, true).accountNo).toBe("123-4-56789-0");
  });
});

describe("ที่อยู่ไทย (ออฟไลน์)", () => {
  it("ค้นตำบลแล้วได้อำเภอ จังหวัด รหัสไปรษณีย์ · กรองด้วยจังหวัดได้ · ค้นด้วยรหัสไปรษณีย์ได้", () => {
    const hits = searchSubdistricts("ช้างเผือก เชียงใหม่");
    expect(hits[0]).toMatchObject({ subdistrict: "ช้างเผือก", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50300" });
    expect(searchSubdistricts("50200").every((h) => h.postcode.startsWith("50200"))).toBe(true);
    expect(searchSubdistricts("ก")).toEqual([]);
  });
});

describe("ทะเบียนวิทยากร + อัตรา + คลังหัวข้อ (ฐานข้อมูล)", () => {
  let db: DB;
  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    bootstrapReferenceData(db);
  });

  it("มีอัตราตัวอย่างติดป้าย และหัวข้อจากคู่มือครบ 3 หลักสูตร · แก้จำนวนเงินแล้วป้ายตัวอย่างหายไป", () => {
    const rates = db.select().from(schema.rates).all();
    expect(rates.length).toBe(3);
    expect(rates.every((r) => r.isSample)).toBe(true);
    for (const code of ["B12", "PRE3", "FAST"]) {
      const c = db.select().from(schema.courses).where(eq(schema.courses.code, code)).get()!;
      expect(listTopics(db, c.id).length).toBeGreaterThan(5);
    }
    const gov = rates.find((r) => r.externalType === "gov")!;
    saveRate(db, gov.id, { name: gov.name, kind: "external", externalType: "gov", perHourBaht: 600, dailyCapBaht: null, fromFiscalYear: 2569, active: true }, actor);
    expect(db.select().from(schema.rates).where(eq(schema.rates.id, gov.id)).get()!.isSample).toBe(true); // เงินไม่เปลี่ยน
    saveRate(db, gov.id, { name: gov.name, kind: "external", externalType: "gov", perHourBaht: 800, dailyCapBaht: 4800, fromFiscalYear: 2570, active: true }, actor);
    expect(db.select().from(schema.rates).where(eq(schema.rates.id, gov.id)).get()).toMatchObject({ isSample: false, perHourSatang: 80000, dailyCapSatang: 480000 });
    expect(() => saveRate(db, null, { name: "x", kind: "internal", externalType: null, perHourBaht: 500, dailyCapBaht: 100, fromFiscalYear: 2570, active: true }, actor)).toThrow(/เพดาน/);
  });

  it("แม่แบบ/คาบผูกหัวข้อตามชื่อ · หัวข้อทั้งทีม = ไม่จำกัดจำนวน · รายบุคคลใช้จำนวนสูงสุดของหัวข้อ", () => {
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    const c = createCohort(db, { courseId: b12.id, startDate: "2026-10-05" }, 1);
    const sessions = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    expect(sessions.every((s) => s.topicId != null)).toBe(true);
    const morning = sessions.find((s) => s.title === "ประชุมเช้า")!;
    const lecture = sessions.find((s) => s.startTime === "09:00")!;
    expect(maxStaffOf(db, morning)).toBe(Infinity);
    expect(maxStaffOf(db, lecture)).toBe(2);
    const t = listTopics(db, b12.id).find((x) => x.id === lecture.topicId)!;
    saveTopic(db, b12.id, t.id, { ...t, staffingType: "individual", maxStaff: 3, externalRates: t.externalRates as never, splitMethod: "equal", activityType: t.activityType, defaultStaff: [{ userId: 1 }] } as never, actor);
    expect(maxStaffOf(db, lecture)).toBe(3);
    // ผู้รับผิดชอบประจำ เติมให้รุ่นใหม่อัตโนมัติ
    const c2 = createCohort(db, { courseId: b12.id, number: 7, startDate: "2027-01-04" }, 1);
    const s2 = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, c2.id), eq(schema.cohortSessions.topicId, t.id))).get()!;
    expect(db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.sessionId, s2.id), isNull(schema.sessionStaff.deletedAt))).all().map((x) => x.userId)).toEqual([1]);
    expect(bulkUpdateTopics(db, b12.id, [t.id], { payable: false }, actor)).toBe(1);
    expect(listTopics(db, b12.id).find((x) => x.id === t.id)!.payable).toBe(false);
  });

  it("บันทึกวิทยากรภายนอก/ภายใน · ภายในซ้ำคนเดิมไม่ได้ · เลือกวิทยากรจากทะเบียนเข้าคาบ (วิทยากรภายในในทะเบียน = บัญชีผู้ใช้)", () => {
    const ext = saveInstructor(db, null, { kind: "external", firstName: "สมศรี", lastName: "ใจดี", nationalId: "1-1017-00230-70-8", accountNo: "123-4-56789-0", phone: "081-234-5678" }, actor);
    const row = db.select().from(schema.instructors).where(eq(schema.instructors.id, ext)).get()!;
    expect(row).toMatchObject({ nationalId: VALID_ID, accountNo: "1234567890", phone: "0812345678", externalType: "gov" });
    // audit ไม่เก็บค่าข้อมูลอ่อนไหว
    const audit = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "instructor")).all();
    expect(JSON.stringify(audit)).not.toContain(VALID_ID);
    const internal = saveInstructor(db, null, { kind: "internal", userId: 1 }, actor);
    expect(() => saveInstructor(db, null, { kind: "internal", userId: 1 }, actor)).toThrow(/มีในทะเบียนวิทยากรแล้ว/);
    expect(listInstructors(db).find((i) => i.id === internal)!.displayName).toBe("หัวหน้า ทดสอบ");

    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    const c = createCohort(db, { courseId: b12.id, startDate: "2026-10-05" }, 1);
    const s = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, c.id), eq(schema.cohortSessions.startTime, "09:00"))).get()!;
    addStaff(db, s.id, { instructorId: ext }, actor);
    expect(() => addStaff(db, s.id, { instructorId: ext }, actor)).toThrow(/อยู่ในคาบนี้แล้ว/);
    const { row: viaRegistry } = addStaff(db, s.id, { instructorId: internal }, actor);
    expect(viaRegistry).toMatchObject({ userId: 1, instructorId: null });
  });
});
