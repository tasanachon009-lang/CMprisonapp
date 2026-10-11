import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff } from "@/lib/services/schedule";
import { saveSessionReport } from "@/lib/services/session-close";
import { createBatch, approveBatch, batchView, unlockBatch } from "@/lib/services/pay";
import { payees, reconcile, markPrinted, voucherStatuses, setSigned, unsignedCount, docContext } from "@/lib/services/pay-docs";

describe("เอกสารการเงิน: ผู้รับเงิน ตรวจยอด สถานะพิมพ์/เซ็นรับ (สเปก 11.5C/D)", () => {
  let db: DB;
  let head: number, nurse: number, cohortId: number, somsri: number, nameless: number;
  const user = (firstName: string, roles: string[]) => {
    const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    for (const r of roles) db.insert(schema.userRoles).values({ userId: id, role: r }).run();
    return id;
  };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = user("หัวหน้า", ["admin", "rehab"]);
    nurse = user("พยาบาล", ["rehab"]);
    bootstrapReferenceData(db);
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    cohortId = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, head).id;
    db.update(schema.cohortSessions).set({ takesAttendance: false }).where(eq(schema.cohortSessions.cohortId, cohortId)).run();
    somsri = db.insert(schema.instructors).values({
      kind: "external", externalType: "gov", prefix: "นาง", firstName: "สมศรี", lastName: "ใจดี", nationalId: "1101700230705", phone: "0812345678",
      addrHouseNo: "9", addrSubdistrict: "สุเทพ", addrDistrict: "เมืองเชียงใหม่", addrProvince: "เชียงใหม่", addrPostcode: "50200",
      bank: "ธนาคารกรุงไทย", accountName: "นางสมศรี ใจดี", accountNo: "1234567890", notifyChannel: "sms", bankBookReceived: true,
    }).returning().get().id;
    nameless = db.insert(schema.instructors).values({ kind: "external", externalType: "private", firstName: "วิชัย", lastName: "สอนดี" }).returning().get().id;
    const ss = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
    const lecture = (date: string) => ss.find((s) => s.date === date && s.startTime === "09:00")!;
    for (const [date, ins] of [["2026-09-04", somsri], ["2026-09-07", nameless], ["2026-09-08", somsri]] as const) {
      const s = lecture(date);
      addStaff(db, s.id, { instructorId: ins }, { userId: head });
      saveSessionReport(db, s.id, { outcome: "planned" }, { userId: nurse, isAdmin: false });
    }
  });

  const approved = () => { const b = createBatch(db, { cohortId }, { userId: nurse }); approveBatch(db, b.id, { userId: head }); return b.id; };

  it("พิมพ์ได้เฉพาะรอบที่อนุมัติแล้ว", () => {
    const b = createBatch(db, { cohortId }, { userId: nurse });
    expect(() => payees(db, b.id)).toThrow(/อนุมัติแล้ว/);
  });

  it("ผู้รับเงิน: ยอดรายคน + ข้อมูลเติมเอกสาร + บอกข้อมูลที่ขาด · เรียงตามชื่อ/วันที่สอน · เลือกภายนอก", () => {
    const id = approved();
    const people = payees(db, id);
    expect(people.map((p) => p.fullName)).toEqual(["วิชัย สอนดี", "นางสมศรี ใจดี"]); // เรียงตามชื่อ (ว ก่อน ส)
    const s = people.find((p) => p.instructorId === somsri)!;
    expect(s).toMatchObject({ grossSatang: 2 * 1.5 * 60000, sessions: 2, nationalId: "1101700230705", phone: "0812345678", missing: [] });
    expect(people.find((p) => p.instructorId === nameless)!.missing).toEqual(expect.arrayContaining(["เลขบัตรประชาชน", "เลขบัญชี", "เบอร์โทรศัพท์"]));
    expect(payees(db, id, { order: "first" })[0].instructorId).toBe(somsri);
    expect(payees(db, id, { who: "internal" })).toEqual([]);
    expect(docContext(db, id).project).toMatch(/รุ่นที่/);
  });

  it("ตรวจยอดก่อนพิมพ์: ตรงกันทั้งหมด · ยอดที่อนุมัติไม่ตรง → บอกจุดผิด", () => {
    const id = approved();
    const people = payees(db, id);
    const v = batchView(db, id);
    expect(reconcile(v.batch, people, v.lines, false)).toEqual([]);
    expect(reconcile({ totalSatang: 1 }, people, v.lines, false).join()).toMatch(/ยอดที่อนุมัติ/);
    const broken = people.map((p, i) => (i === 0 ? { ...p, grossSatang: p.grossSatang + 100 } : p));
    expect(reconcile(v.batch, broken, v.lines, false).length).toBeGreaterThan(0);
  });

  it("สถานะรายใบ: ยังไม่พิมพ์ → พิมพ์แล้ว → เซ็นรับแล้ว · แก้ข้อมูลวิทยากรหลังพิมพ์ → ต้องพิมพ์ใหม่ · ยอดเปลี่ยน → ล้างเซ็นรับ", () => {
    const id = approved();
    let people = payees(db, id);
    const key = people.find((p) => p.instructorId === somsri)!.key;
    expect(voucherStatuses(db, id, people).get(key)!.status).toBe("none");
    expect(() => setSigned(db, id, key, true, { userId: nurse })).toThrow(/ยังไม่ได้พิมพ์/);
    markPrinted(db, id, people, { userId: nurse });
    expect(voucherStatuses(db, id, people).get(key)!.status).toBe("printed");
    expect(unsignedCount(db)).toBe(2);
    setSigned(db, id, key, true, { userId: nurse });
    expect(voucherStatuses(db, id, people).get(key)!.status).toBe("signed");
    expect(unsignedCount(db)).toBe(1);
    // แก้ที่อยู่วิทยากรหลังพิมพ์ (ใบพิมพ์ไว้เมื่อ 10 วินาทีก่อน)
    db.update(schema.payVouchers).set({ printedAt: new Date(Date.now() - 10_000) }).run();
    db.update(schema.instructors).set({ addrHouseNo: "10", updatedAt: new Date(Date.now() - 5_000) }).where(eq(schema.instructors.id, somsri)).run();
    people = payees(db, id);
    expect(voucherStatuses(db, id, people).get(key)!.status).toBe("reprint");
    // ยอดเปลี่ยน (ปลดล็อก → เปลี่ยนอัตรา → อนุมัติใหม่) → พิมพ์ใหม่แล้วต้องเซ็นใหม่
    unlockBatch(db, id, "แก้อัตรา", { userId: head, isAdmin: true });
    setSetting(db, "pay.withholdingTax", { enabled: false, pct: 3 }, head);
    db.update(schema.rates).set({ perHourSatang: 70000 }).where(eq(schema.rates.externalType, "gov")).run();
    approveBatch(db, id, { userId: head });
    people = payees(db, id);
    markPrinted(db, id, people, { userId: nurse });
    const row = voucherStatuses(db, id, people).get(key)!;
    expect(row.status).toBe("printed");
    expect(row.row!.printCount).toBe(2);
    expect(row.row!.signedAt).toBeNull();
  });
});
