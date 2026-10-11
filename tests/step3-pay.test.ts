import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff } from "@/lib/services/schedule";
import { saveSessionReport } from "@/lib/services/session-close";
import { computeLines, personTotals, lineFormula, type PaySessionInput } from "@/lib/pay/calc";
import { liveLines, createBatch, batchView, approveBatch, unlockBatch, cancelBatch, sessionPreview, setSessionSplit, paySummary } from "@/lib/services/pay";
import { createDelegation, revokeDelegation, activeDelegationsFor, delegatedPermissions, delegationNote } from "@/lib/services/delegation";
import { resolvePermissions } from "@/lib/auth/permissions";

const rate = (perHourBaht: number, capBaht: number | null = null) => ({ id: perHourBaht, perHourSatang: perHourBaht * 100, dailyCapSatang: capBaht == null ? null : capBaht * 100 });
const staff = (key: string, r: ReturnType<typeof rate> | null = rate(600), extra: Partial<PaySessionInput["staff"][number]> = {}) => ({
  staffId: Number(key.replace(/\D/g, "")) || 1, key, name: key, kind: key.startsWith("u") ? ("internal" as const) : ("external" as const),
  userId: key.startsWith("u") ? 1 : null, instructorId: null, didTeach: true, actualHours: null, shareRatio: null, rate: r, ...extra,
});
const session = (id: number, s: Partial<PaySessionInput>): PaySessionInput => ({ id, cohortId: 1, date: "2026-10-05", startTime: "09:00", title: "หัวข้อ", hours: 2, splitMethod: "full", notPayable: null, staff: [], ...s });

describe("คำนวณค่าตอบแทน (ฟังก์ชันล้วน)", () => {
  it("คนละเต็ม / หารเท่ากัน / กำหนดสัดส่วน · คาบเดียวภายใน+ภายนอกคิดตามอัตราของแต่ละคน", () => {
    const people = [staff("u1", rate(0)), staff("i2", rate(600))];
    expect(computeLines([session(1, { staff: people })]).map((l) => l.amountSatang)).toEqual([0, 120000]);
    expect(computeLines([session(1, { splitMethod: "equal", staff: [staff("i1"), staff("i2", rate(1200))] })]).map((l) => l.amountSatang)).toEqual([60000, 120000]);
    const ratio = computeLines([session(1, { splitMethod: "ratio", staff: [staff("i1", rate(600), { shareRatio: 3 }), staff("i2", rate(600), { shareRatio: 1 })] })]);
    expect(ratio.map((l) => l.amountSatang)).toEqual([90000, 30000]);
    expect(lineFormula(ratio[0])).toBe("2 ชม. × 0.75 (กำหนดสัดส่วน) × 600 บาท = 900 บาท");
  });

  it("สอนจริงไม่เต็ม / ไม่ได้สอน · หารเท่ากันนับเฉพาะคนที่สอนจริง", () => {
    const lines = computeLines([session(1, { splitMethod: "equal", staff: [staff("i1", rate(600), { actualHours: 1.5 }), staff("i2", rate(600), { didTeach: false }), staff("i3")] })]);
    expect(lines.map((l) => [l.key, l.amountSatang])).toEqual([["i1", 45000], ["i3", 60000]]);
  });

  it("เบิกไม่ได้ยังนับภาระงาน · ไม่มีอัตรา/ไม่อยู่ในทะเบียน บอกเหตุผล", () => {
    const lines = computeLines([
      session(1, { notPayable: "หัวข้อนี้ตั้งเป็นเบิกไม่ได้", staff: [staff("u1")] }),
      session(2, { startTime: "13:00", staff: [staff("x3", null), staff("i4", rate(600), { blocked: "ยังไม่อยู่ในทะเบียนวิทยากร" })] }),
    ]);
    expect(lines.map((l) => [l.payable, l.amountSatang, l.note])).toEqual([[false, 0, "หัวข้อนี้ตั้งเป็นเบิกไม่ได้"], [false, 0, "ยังไม่ได้กำหนดอัตราของหัวข้อนี้"], [false, 0, "ยังไม่อยู่ในทะเบียนวิทยากร"]]);
    expect(personTotals(lines, { enabled: false, pct: 0 }).find((t) => t.key === "u1")).toMatchObject({ hours: 2, payableHours: 0, grossSatang: 0 });
  });

  it("เพดานต่อวัน: รวมทุกคาบของคนเดียวกันในวันเดียว ตัดจากคาบหลังสุด", () => {
    const capped = rate(600, 1500);
    const lines = computeLines([session(1, { staff: [staff("i1", capped)] }), session(2, { startTime: "13:00", staff: [staff("i1", capped)] })]);
    expect(lines.map((l) => [l.amountSatang, l.capCutSatang])).toEqual([[120000, 0], [30000, 90000]]);
  });

  it("ภาษี ณ ที่จ่าย: เฉพาะภายนอก เมื่อเปิด · ปัดครั้งเดียวต่อคน", () => {
    const lines = computeLines([session(1, { hours: 1.5, staff: [staff("u1", rate(333)), staff("i2", rate(333))] })]);
    const t = personTotals(lines, { enabled: true, pct: 3 });
    expect(t.find((x) => x.key === "u1")).toMatchObject({ grossSatang: 49950, taxSatang: 0, netSatang: 49950 });
    expect(t.find((x) => x.key === "i2")).toMatchObject({ grossSatang: 49950, taxSatang: 1499, netSatang: 48451 });
  });
});

describe("รอบเบิก อนุมัติ ล็อก ปลดล็อก มอบอำนาจ (ฐานข้อมูล)", () => {
  let db: DB;
  let head: number, deputy: number, nurse: number, b12: number, cohortId: number, ext: number;
  const user = (firstName: string, roles: string[]) => {
    const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    for (const r of roles) db.insert(schema.userRoles).values({ userId: id, role: r }).run();
    return id;
  };
  const sessionsOf = () => db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
  const lecture = () => sessionsOf().find((s) => s.date === "2026-09-04" && s.startTime === "09:00")!; // วันที่ 4: ทบทวนจิตตนเอง (บรรยาย เบิกได้ 1.5 ชม.)
  const close = (sessionId: number, by: number) => saveSessionReport(db, sessionId, { outcome: "planned" }, { userId: by, isAdmin: true });

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = user("หัวหน้า", ["admin", "rehab"]);
    deputy = user("รอง", ["admin", "rehab"]);
    nurse = user("พยาบาล", ["rehab"]);
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    cohortId = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, head).id;
    ext = db.insert(schema.instructors).values({ kind: "external", externalType: "gov", firstName: "วิทยากร", lastName: "ราชการ" }).returning().get().id;
    // ใช้คาบที่ไม่เช็คชื่อ เพื่อปิดคาบได้ทันที
    db.update(schema.cohortSessions).set({ takesAttendance: false }).where(eq(schema.cohortSessions.cohortId, cohortId)).run();
  });

  it("คิดจากคาบที่ปิดแล้ว · อัตราตัวอย่างภาครัฐ 600 บาท/ชม. · แสดงยอดล่วงหน้าในหน้าแก้คาบ", () => {
    const s = lecture();
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    expect(sessionPreview(db, s.id).map((l) => l.amountSatang)).toEqual([s.hours * 60000]);
    expect(liveLines(db, { cohortId })).toEqual([]); // ยังไม่ปิดคาบ = ยังไม่คิด
    close(s.id, nurse);
    expect(liveLines(db, { cohortId }).filter((l) => l.payable).map((l) => [l.name, l.amountSatang])).toEqual([["วิทยากร ราชการ", s.hours * 60000]]);
  });

  it("อนุมัติ: เก็บยอด + ล็อกคาบ · อัตราเปลี่ยนภายหลังไม่กระทบ · ไม่ถูกเบิกซ้ำ · ปลดล็อกต้องมีเหตุผล", () => {
    const s = lecture();
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    close(s.id, nurse);
    const b = createBatch(db, { cohortId }, { userId: nurse });
    const v = batchView(db, b.id);
    expect(v.lines.length).toBe(1);
    expect(v.unrecorded.length).toBeGreaterThan(0); // คาบอื่นยังไม่ปิด → แจ้งให้ตรวจ
    approveBatch(db, b.id, { userId: head });
    const locked = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, s.id)).get()!;
    expect(locked.lockedAt).toBeTruthy();
    expect(locked.payBatchId).toBe(b.id);
    // อัตราเปลี่ยน → ยอดที่อนุมัติไม่เปลี่ยน แต่แจ้งว่าข้อมูลต่างจากตอนอนุมัติ
    db.update(schema.rates).set({ perHourSatang: 90000 }).where(eq(schema.rates.externalType, "gov")).run();
    const after = batchView(db, b.id);
    expect(after.lines[0].amountSatang).toBe(s.hours * 60000);
    expect(after.changedAfterApproval).toBe(1);
    // รอบใหม่ไม่ดึงคาบที่เบิกแล้ว
    const b2 = createBatch(db, { cohortId }, { userId: nurse });
    expect(batchView(db, b2.id).lines).toEqual([]);
    expect(() => approveBatch(db, b2.id, { userId: head })).toThrow(/ไม่มีรายการ/);
    cancelBatch(db, b2.id, { userId: nurse });
    // ปลดล็อก
    expect(() => unlockBatch(db, b.id, "แก้ชั่วโมง", { userId: nurse, isAdmin: false })).toThrow(/ผู้ดูแลระบบ/);
    expect(() => unlockBatch(db, b.id, " ", { userId: head, isAdmin: true })).toThrow(/เหตุผล/);
    unlockBatch(db, b.id, "แก้ชั่วโมง", { userId: head, isAdmin: true });
    expect(db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, s.id)).get()!.lockedAt).toBeNull();
    expect(batchView(db, b.id).lines[0].amountSatang).toBe(s.hours * 90000); // กลับเป็นร่าง คิดตามอัตราปัจจุบัน
  });

  it("แยกหน้าที่: อนุมัติรอบที่มียอดของตัวเองไม่ได้", () => {
    db.update(schema.rates).set({ perHourSatang: 30000 }).where(eq(schema.rates.kind, "internal")).run();
    const s = lecture();
    addStaff(db, s.id, { userId: head }, { userId: head });
    close(s.id, head);
    const b = createBatch(db, { cohortId }, { userId: nurse });
    expect(() => approveBatch(db, b.id, { userId: head })).toThrow(/ของตนเอง/);
    expect(() => approveBatch(db, b.id, { userId: deputy })).not.toThrow();
  });

  it("แก้วิธีแบ่งเฉพาะคาบ: ผู้ดูแล + หมายเหตุ", () => {
    const s = lecture();
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    addStaff(db, s.id, { externalName: "นอกทะเบียน" }, { userId: head });
    expect(() => setSessionSplit(db, s.id, { method: "equal" }, { userId: head, isAdmin: true })).toThrow(/หมายเหตุ/);
    expect(() => setSessionSplit(db, s.id, { method: "equal", note: "x" }, { userId: nurse, isAdmin: false })).toThrow(/ผู้ดูแลระบบ/);
    setSessionSplit(db, s.id, { method: "equal", note: "สอนร่วมกันทั้งคาบ" }, { userId: head, isAdmin: true });
    const p = sessionPreview(db, s.id);
    expect(p.find((l) => l.instructorId === ext)!.amountSatang).toBe((s.hours * 60000) / 2);
    expect(p.find((l) => !l.instructorId)!.note).toMatch(/ทะเบียน/);
  });

  it("สรุปค่าตอบแทน: รวมยอดอนุมัติแล้ว + รออนุมัติ", () => {
    const s = lecture();
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    close(s.id, nurse);
    expect(paySummary(db, { from: "2026-09-01", to: "2026-09-30" }).filter((l) => l.payable).map((l) => l.status)).toEqual(["pending"]);
    approveBatch(db, createBatch(db, { cohortId }, { userId: nurse }).id, { userId: head });
    expect(paySummary(db, { from: "2026-09-01", to: "2026-09-30" }).filter((l) => l.payable).map((l) => l.status)).toEqual(["approved"]);
  });

  it("มอบอำนาจ: เฉพาะหัวหน้า/รองมอบให้กลุ่ม A · ได้สิทธิ์อนุมัติตามช่วง · ยกเลิกแล้วหมดสิทธิ์ · ไม่ได้บทบาทผู้ดูแล", () => {
    setSetting(db, "pay.withholdingTax", { enabled: false, pct: 3 }, head);
    expect(() => createDelegation(db, { toUserId: deputy, scopes: ["pay"], startDate: "2026-10-01", endDate: "2099-12-31" }, { userId: head })).toThrow(/เจ้าหน้าที่หลัก/);
    expect(() => createDelegation(db, { toUserId: head, scopes: ["pay"], startDate: "2026-10-01", endDate: "2099-12-31" }, { userId: nurse })).toThrow(/ผู้ดูแลระบบ/);
    const d = createDelegation(db, { toUserId: nurse, scopes: ["pay"], startDate: "2026-01-01", endDate: "2099-12-31", reason: "ลาพักร้อน" }, { userId: head });
    const active = activeDelegationsFor(db, nurse);
    expect(active.map((x) => x.id)).toEqual([d.id]);
    const base = resolvePermissions(["rehab"], [], "2026-10-05");
    const via = delegatedPermissions(base, active);
    expect([...via.keys()].sort()).toEqual(["pay.approve", "pay.view"]);
    expect(base.has("users.manage")).toBe(false);
    expect(delegationNote(active[0])).toMatch(/อนุมัติแทน \(มอบอำนาจโดย หัวหน้า ทดสอบ/);
    // ผู้มอบถูกถอดบทบาทผู้ดูแล → หมดผล
    db.delete(schema.userRoles).where(and(eq(schema.userRoles.userId, head), eq(schema.userRoles.role, "admin"))).run();
    expect(activeDelegationsFor(db, nurse)).toEqual([]);
    db.insert(schema.userRoles).values({ userId: head, role: "admin" }).run();
    revokeDelegation(db, d.id, { userId: deputy });
    expect(activeDelegationsFor(db, nurse)).toEqual([]);
    expect(activeDelegationsFor(db, nurse, "2026-10-05").length).toBe(0);
    expect(db.select().from(schema.delegations).where(isNull(schema.delegations.revokedAt)).all()).toEqual([]);
  });
});
