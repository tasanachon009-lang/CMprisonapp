import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff } from "@/lib/services/schedule";
import { addSession } from "@/lib/services/schedule-edit";
import { saveSessionReport } from "@/lib/services/session-close";
import { createBatch, approveBatch, unlockBatch } from "@/lib/services/pay";
import { payees } from "@/lib/services/pay-docs";
import { lineAmount, applyTemplate, cohortBudgetStatus, attributeCompensation, needsConfirmation } from "@/lib/budget/calc";
import {
  parseBaht, saveAllocation, saveLine, deleteLine, applyCourseTemplate, copyLinesFrom, cohortBudget, recordExpense, recordRefund,
  confirmOverrun, cohortReport, fiscalSummary, compensationBudget, distributed,
} from "@/lib/services/budget";

describe("คำนวณงบ (ฟังก์ชันล้วน — สตางค์จำนวนเต็ม)", () => {
  it("สูตรตามคู่มือ 3 วัน: วิทยากร 600 × 15 ชม. × 1 คน = 9,000 · วัสดุ 159 × 50 คน = 7,950", () => {
    expect(lineAmount(60000, [{ qty: 15, unit: "ชม." }, { qty: 1, unit: "คน" }])).toBe(900000);
    expect(lineAmount(15900, [{ qty: 50, unit: "คน" }])).toBe(795000);
  });

  it("ทศนิยม: 1.5 ชม. × 333.33 บาท = 499.995 → ปัดครึ่งขึ้น 500.00 (ไม่มีความคลาดเคลื่อนแบบทศนิยมลอยตัว)", () => {
    expect(lineAmount(33333, [{ qty: 1.5, unit: "ชม." }])).toBe(50000);
    expect(lineAmount(10, [{ qty: 0.1, unit: "" }, { qty: 0.2, unit: "" }])).toBe(0); // 0.2 สตางค์ → 0
    expect(lineAmount(1, [{ qty: 0.5, unit: "" }])).toBe(1); // 0.5 สตางค์ → ปัดขึ้น 1
    expect(() => lineAmount(100, [{ qty: 1.234, unit: "" }])).toThrow(/2 ตำแหน่ง/);
    expect(() => lineAmount(100, [{ qty: -1, unit: "" }])).toThrow();
    expect(() => lineAmount(1.5, [{ qty: 1, unit: "" }])).toThrow(/สตางค์/);
    expect(parseBaht("1,500.50")).toBe(150050);
    expect(parseBaht("0.1")).toBe(10);
    expect(() => parseBaht("1.005")).toThrow();
  });

  it("แม่แบบหลักสูตร: ใส่จำนวนคน → วิทยากร = ปัดขึ้น คน/50", () => {
    const t = { perSpeaker: 50, lines: [{ item: "compensation.speaker_external", unitSatang: 60000, factors: [{ qty: 15, unit: "ชม." }, { var: "speakers" as const, unit: "คน" }] }, { item: "materials.stationery", unitSatang: 15900, factors: [{ var: "people" as const, unit: "คน" }] }] };
    expect(applyTemplate(t, 50).map((l) => l.amountSatang)).toEqual([900000, 795000]);
    expect(applyTemplate(t, 51).map((l) => l.amountSatang)).toEqual([1800000, 810900]);
    expect(() => applyTemplate(t, 0)).toThrow();
  });

  it("สถานะหมวด: ถัวได้ = เหลือง (บอกถัวจากหมวดไหน) · ห้ามถัว = แดง · เกินทั้งแหล่งเงิน = แดงแม้ถัวได้ · ยืนยันแล้ว", () => {
    const lines = [{ id: 1, allocationId: 1, item: "materials.stationery", amountSatang: 1000 }, { id: 2, allocationId: 1, item: "operating.food", amountSatang: 5000 }];
    const exp = (n: number) => [{ allocationId: 1, kind: "expense" as const, item: "materials.stationery", amountSatang: n }];
    const none = { internalSatang: 0, externalSatang: 0 };
    const flex = cohortBudgetStatus([{ id: 1, flexible: true }], lines, exp(3000), none, []);
    expect(flex.allocations[0].categories.find((c) => c.category === "materials")).toMatchObject({ level: "yellow", over: 2000, borrowFrom: ["operating"] });
    expect(needsConfirmation(flex)).toBe(false);
    const strict = cohortBudgetStatus([{ id: 1, flexible: false }], lines, exp(3000), none, []);
    expect(strict.allocations[0].categories.find((c) => c.category === "materials")).toMatchObject({ level: "red", confirmed: false });
    expect(needsConfirmation(strict)).toBe(true);
    const overAll = cohortBudgetStatus([{ id: 1, flexible: true }], lines, exp(7000), none, []);
    expect(overAll.allocations[0].categories.find((c) => c.category === "materials")!.level).toBe("red");
    const acked = cohortBudgetStatus([{ id: 1, flexible: false }], lines, exp(3000), none, [{ allocationId: 1, category: "materials", overSatang: 2000 }]);
    expect(needsConfirmation(acked)).toBe(false);
    const more = cohortBudgetStatus([{ id: 1, flexible: false }], lines, exp(3500), none, [{ allocationId: 1, category: "materials", overSatang: 2000 }]);
    expect(needsConfirmation(more)).toBe(true); // เกินเพิ่มจากที่ยืนยัน = ต้องยืนยันใหม่
  });

  it("กระจายค่าวิทยากร: ภายใน→บรรทัดภายใน ภายนอก→บรรทัดภายนอก · ไม่มีบรรทัด = ไม่มีงบรองรับ", () => {
    const lines = [{ id: 1, allocationId: 1, item: "compensation.speaker_internal", amountSatang: 100 }, { id: 2, allocationId: 2, item: "compensation.speaker_external", amountSatang: 500 }];
    expect([...attributeCompensation(lines, { internalSatang: 50, externalSatang: 700 }).byAllocation]).toEqual([[1, 50], [2, 700]]);
    expect(attributeCompensation([], { internalSatang: 0, externalSatang: 300 }).unbudgeted).toBe(300);
  });
});

describe("งบประมาณในฐานข้อมูล: กันเกินจัดสรร · ตัดงบ/คืนงบตามการอนุมัติ · ยอดตรงทุกที่", () => {
  let db: DB;
  let head: number, finance: number, cohortId: number, b12: number, pre3: number, ext: number;
  const actor = () => ({ userId: head });
  const alloc = (o: Partial<Parameters<typeof saveAllocation>[2]> = {}) => saveAllocation(db, null, { fiscalYear: 2569, source: "dept", docNo: "ยธ 0708.6/ว 9999 (สมมติ)", docDate: "2025-11-01", subject: "งบฟื้นฟูก่อนพ้นโทษ (ข้อมูลปลอม)", amountSatang: 2000000, flexible: true, ...o }, actor());

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    finance = db.insert(schema.users).values({ firstName: "การเงิน", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!.id;
    db.update(schema.courses).set({ enabled: true }).where(eq(schema.courses.id, pre3)).run();
    cohortId = createCohort(db, { courseId: pre3, startDate: "2026-03-02" }, head).id; // ปีงบ 2569
    ext = db.insert(schema.instructors).values({ kind: "external", externalType: "gov", firstName: "วิทยากร", lastName: "ภายนอก" }).returning().get().id;
  });

  it("แม่แบบ 3 วัน 50 คน → 9,000 + 7,950 บาท · รวมทุกรุ่นห้ามเกินจัดสรร (หน้าจอ + trigger ฐานข้อมูล)", () => {
    const a = alloc({ amountSatang: 2000000 });
    expect(applyCourseTemplate(db, cohortId, a.id, 50, actor())).toEqual({ added: 2, totalSatang: 1695000 });
    const c2 = createCohort(db, { courseId: pre3, startDate: "2026-05-04" }, head).id;
    // รุ่นที่ 2 ขอ 16,950 แต่เหลือแบ่งได้ 3,050 → ไม่เพิ่มเลยทั้งชุด
    expect(() => applyCourseTemplate(db, c2, a.id, 50, actor())).toThrow(/แบ่งได้อีกไม่เกิน 3,050/);
    expect(distributed(db, a.id)).toBe(1695000);
    expect(() => copyLinesFrom(db, c2, cohortId, a.id, actor())).toThrow(/เกิน/);
    // ข้ามการตรวจของหน้าจอ เขียนตรงลงฐานข้อมูล → trigger ปฏิเสธ
    expect(() => db.insert(schema.budgetLines).values({ cohortId: c2, allocationId: a.id, item: "materials.stationery", unitSatang: 400000, factors: [{ qty: 1, unit: "" }], amountSatang: 400000 }).run()).toThrow(/BUDGET_OVER_ALLOCATION/);
    expect(() => db.update(schema.budgetAllocations).set({ amountSatang: 1000000 }).where(eq(schema.budgetAllocations.id, a.id)).run()).toThrow(/BELOW_DISTRIBUTED/);
    expect(() => saveAllocation(db, a.id, { fiscalYear: 2569, source: "dept", subject: "x", amountSatang: 1000000, flexible: true }, actor())).toThrow(/น้อยกว่าที่แบ่ง/);
    // จำนวนเงินต้องเป็นสตางค์จำนวนเต็มที่ระดับฐานข้อมูล
    expect(() => db.insert(schema.budgetExpenses).values({ cohortId, allocationId: a.id, item: "materials.stationery", date: "2026-03-02", description: "x", amountSatang: 10.5 }).run()).toThrow(/CHECK/);
    // ปีงบ/หลักสูตรไม่ตรง
    const other = alloc({ fiscalYear: 2570 });
    expect(() => saveLine(db, cohortId, null, { allocationId: other.id, item: "materials.stationery", unitSatang: 100, factors: [{ qty: 1, unit: "" }] }, actor())).toThrow(/ปีงบ/);
    const lineId = cohortBudget(db, cohortId).lines[1].id;
    deleteLine(db, cohortId, lineId, actor());
    expect(distributed(db, a.id)).toBe(900000);
    // รุ่นปิดแล้ว: แก้งบที่ตั้งไว้ไม่ได้ แต่ยังบันทึกจ่ายจริงได้
    db.update(schema.cohorts).set({ status: "closed" }).where(eq(schema.cohorts.id, cohortId)).run();
    expect(() => saveLine(db, cohortId, null, { allocationId: a.id, item: "materials.stationery", unitSatang: 100, factors: [{ qty: 1, unit: "" }] }, actor())).toThrow(/ปิดแล้ว/);
    expect(() => recordExpense(db, cohortId, { allocationId: a.id, item: "materials.stationery", date: "2026-03-20", description: "ใบเสร็จมาหลังจบรุ่น", amountSatang: 10000 }, { userId: finance, canConfirm: false })).not.toThrow();
  });

  it("ค่าวิทยากรตัดงบเฉพาะรอบที่อนุมัติแล้ว · ปลดล็อก = คืนงบ · ยอดงบ = สรุปใหญ่ = ผลรวมใบสำคัญรับเงิน", () => {
    const a = alloc();
    applyCourseTemplate(db, cohortId, a.id, 50, actor());
    const topic = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.courseId, pre3)).all().find((x) => x.name === "ทักษะการปฏิเสธ")!;
    const s = addSession(db, cohortId, { date: "2026-03-02", startTime: "09:00", endTime: "10:30", hours: 1.5, topicId: topic.id, takesAttendance: false }, { userId: head });
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    saveSessionReport(db, s.id, { outcome: "planned" }, { userId: head, isAdmin: true });
    const b = createBatch(db, { cohortId }, { userId: finance });
    const comp = () => cohortBudget(db, cohortId).status.allocations[0].categories.find((c) => c.category === "compensation")!.spent;
    expect(comp()).toBe(0); // ร่าง = ยังไม่ตัดงบ
    approveBatch(db, b.id, { userId: head });
    const expected = s.hours * 60000;
    expect(comp()).toBe(expected);
    const vouchers = payees(db, b.id).reduce((x, p) => x + p.grossSatang, 0);
    const batch = db.select().from(schema.payBatches).where(eq(schema.payBatches.id, b.id)).get()!;
    expect([vouchers, batch.totalSatang, compensationBudget(db, cohortId).approved]).toEqual([expected, expected, expected]);
    unlockBatch(db, b.id, "แก้ชั่วโมง", { userId: head, isAdmin: true });
    expect(comp()).toBe(0); // คืนงบ
    expect(compensationBudget(db, cohortId)).toMatchObject({ budget: 900000, approved: 0 });
  });

  it("ใช้จ่ายจริง: ห้ามถัวเกินหมวด → การเงินบันทึกไม่ได้ · หัวหน้ายืนยันพร้อมเหตุผลได้ · ยืนยันล่วงหน้าแล้วการเงินบันทึกได้", () => {
    const a = alloc({ flexible: false });
    applyCourseTemplate(db, cohortId, a.id, 50, actor()); // วัสดุ 7,950
    recordExpense(db, cohortId, { allocationId: a.id, item: "materials.stationery", date: "2026-03-02", description: "เครื่องเขียน", amountSatang: 700000 }, { userId: finance, canConfirm: false });
    const over = { allocationId: a.id, item: "materials.stationery", date: "2026-03-03", description: "เพิ่ม", amountSatang: 200000 };
    expect(() => recordExpense(db, cohortId, over, { userId: finance, canConfirm: false })).toThrow(/ต้องได้รับการยืนยันจากผู้ดูแลระบบ/);
    expect(cohortBudget(db, cohortId).expenses.length).toBe(1); // ไม่ถูกบันทึก
    expect(() => recordExpense(db, cohortId, over, { userId: head, canConfirm: true })).toThrow(/ใส่เหตุผล/);
    expect(recordExpense(db, cohortId, over, { userId: head, canConfirm: true, confirmNote: "ราคาวัสดุปรับขึ้น" }).confirmedOverrun).toBe(true);
    expect(cohortBudget(db, cohortId).needsConfirmation).toBe(false);
    // ยืนยันล่วงหน้าอีก 100 บาท แล้วการเงินบันทึกได้ภายในยอดนั้น
    confirmOverrun(db, cohortId, a.id, "materials", "อนุมัติเพิ่ม", { userId: head, extraSatang: 10000 });
    expect(() => recordExpense(db, cohortId, { ...over, amountSatang: 10000 }, { userId: finance, canConfirm: false })).not.toThrow();
    expect(() => recordExpense(db, cohortId, { ...over, amountSatang: 1 }, { userId: finance, canConfirm: false })).toThrow(/ยืนยัน/);
    expect(() => recordExpense(db, cohortId, { ...over, item: "compensation.speaker_external" }, { userId: head, canConfirm: true })).toThrow(/อัตโนมัติ/);
  });

  it("ถัวได้ = บันทึกได้ (เหลือง) · คืนเงินเหลือไม่เกินคงเหลือ · รายงานแยกหมวด ได้รับ/ใช้ครั้งนี้/สะสม/คงเหลือ · สรุปปีงบ", () => {
    const a = alloc({ flexible: true });
    applyCourseTemplate(db, cohortId, a.id, 50, actor());
    recordExpense(db, cohortId, { allocationId: a.id, item: "materials.stationery", date: "2026-03-02", description: "เครื่องเขียน", amountSatang: 850000 }, { userId: finance, canConfirm: false });
    const st = cohortBudget(db, cohortId).status.allocations[0];
    expect(st.categories.find((c) => c.category === "materials")).toMatchObject({ level: "yellow", over: 55000, borrowFrom: ["compensation"] });
    expect(st.remaining).toBe(1695000 - 850000);
    expect(() => recordRefund(db, cohortId, { allocationId: a.id, date: "2026-03-10", amountSatang: st.remaining + 1 }, actor())).toThrow(/ไม่เกินยอดคงเหลือ/);
    recordRefund(db, cohortId, { allocationId: a.id, date: "2026-03-10", amountSatang: 100000, docNo: "คืน 1" }, actor());
    expect(cohortBudget(db, cohortId).status.allocations[0]).toMatchObject({ refunded: 100000, remaining: 1695000 - 850000 - 100000 });
    const rep = cohortReport(db, cohortId)[0];
    expect(rep.received).toBe(2000000);
    expect(rep.rows.find((r) => r.category === "materials")).toEqual({ category: "materials", budget: 795000, thisTime: 850000, cumulative: 850000, remaining: -55000 });
    const fy = fiscalSummary(db, 2569);
    expect(fy.perAllocation[0]).toMatchObject({ amountSatang: 2000000, distributed: 1695000, undistributed: 305000, spent: 850000, refunded: 100000, remaining: 1050000 });
    expect(fy.perCohort.find((c) => c.cohortId === cohortId)).toMatchObject({ budget: 1695000, spent: 850000, savingPct: 49.9 });
    void b12;
  });
});
