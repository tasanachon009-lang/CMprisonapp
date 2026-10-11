import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff, removeStaff, setStaffRole, scheduleIssues, maxStaffOf } from "@/lib/services/schedule";

const actor = { userId: 1 };

describe("วิทยากรหลายคนต่อคาบ (สเปก 11.4)", () => {
  let db: DB;
  let u1: number, u2: number, u3: number;
  let c1: number, c2: number;
  const sessionsOf = (cohortId: number) => db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
  const staffOf = (sessionId: number) => db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.sessionId, sessionId), isNull(schema.sessionStaff.deletedAt))).all();

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    const mk = (firstName: string) => db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    u1 = mk("หนึ่ง"); u2 = mk("สอง"); u3 = mk("สาม");
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1).id;
    c2 = createCohort(db, { courseId: b12, number: 9, startDate: "2026-10-05" }, 1).id; // รุ่นคู่ขนาน วันเวลาเดียวกัน
  });

  it("1 คาบมีได้หลายคน ทั้งภายในและภายนอก พร้อมบทบาท", () => {
    const s = sessionsOf(c1)[1];
    addStaff(db, s.id, { userId: u1, role: "lead" }, actor);
    addStaff(db, s.id, { externalName: "  อ.สมศรี   ใจดี ", role: "co" }, actor);
    const rows = staffOf(s.id);
    expect(rows.map((r) => [r.userId, r.externalName, r.role])).toEqual([[u1, null, "lead"], [null, "อ.สมศรี ใจดี", "co"]]);
  });

  it("คนเดียวกันซ้ำในคาบเดียวกันไม่ได้ (ทั้งภายใน/ภายนอก)", () => {
    const s = sessionsOf(c1)[1];
    addStaff(db, s.id, { userId: u1 }, actor);
    expect(() => addStaff(db, s.id, { userId: u1 }, actor)).toThrow(/อยู่ในคาบนี้แล้ว/);
    addStaff(db, s.id, { externalName: "อ.สมศรี" }, actor);
    expect(() => addStaff(db, s.id, { externalName: "อ.สมศรี " }, actor)).toThrow(/อยู่ในคาบนี้แล้ว/);
  });

  it("จำนวนสูงสุด: ค่าเริ่มต้น 2 คน · ทั้งทีม (0) ไม่จำกัด", () => {
    // วันที่ 4 ตามคู่มือ: ทบทวนจิตตนเอง (09.00) / รู้ตน พ้นทุกข์ (10.30) — หัวข้อรายบุคคล
    const s = sessionsOf(c1).find((x) => x.dayNo === 4 && x.startTime === "09:00")!, t = sessionsOf(c1).find((x) => x.dayNo === 4 && x.startTime === "10:30")!;
    expect(maxStaffOf(db, s)).toBe(2);
    addStaff(db, s.id, { userId: u1 }, actor);
    addStaff(db, s.id, { userId: u2 }, actor);
    expect(() => addStaff(db, s.id, { userId: u3 }, actor)).toThrow(/สูงสุด 2 คน/);
    db.update(schema.cohortSessions).set({ maxStaff: 0 }).where(eq(schema.cohortSessions.id, t.id)).run();
    for (const u of [u1, u2, u3]) addStaff(db, t.id, { userId: u }, actor, { acknowledgeConflict: true });
    expect(staffOf(t.id).length).toBe(3);
  });

  it("ตรวจชนเวลาทุกคน: คาบเวลาซ้อนกันในวันเดียวกัน (ข้ามรุ่น) ต้องยืนยันก่อน", () => {
    const a = sessionsOf(c1)[1];
    const b = sessionsOf(c2).find((x) => x.date === a.date && x.startTime === a.startTime)!;
    addStaff(db, a.id, { userId: u1 }, actor);
    addStaff(db, a.id, { externalName: "อ.สมศรี" }, actor);
    expect(() => addStaff(db, b.id, { userId: u1 }, actor)).toThrow(/สอนซ้อนเวลา/);
    expect(() => addStaff(db, b.id, { externalName: "อ.สมศรี" }, actor)).toThrow(/สอนซ้อนเวลา/);
    // คนที่ไม่ชน เพิ่มได้ทันที
    expect(() => addStaff(db, b.id, { userId: u2 }, actor)).not.toThrow();
    // ยืนยันแล้วเพิ่มได้ + บันทึกในประวัติ
    const r = addStaff(db, b.id, { userId: u1 }, actor, { acknowledgeConflict: true });
    expect(r.conflicts.length).toBe(1);
    const audit = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "session_staff")).all().pop()!;
    expect(audit.note).toContain("ชนเวลา");
    // หน้าตารางแสดงปัญหาชนเวลาของทุกคนในคาบ
    const { issues } = scheduleIssues(db, sessionsOf(c2));
    expect(issues.get(b.id)!.conflicts.length).toBe(1);
  });

  it("คาบติดกัน (จบ 12:00 / เริ่ม 12:00) ไม่ถือว่าชน", () => {
    const day = sessionsOf(c1).filter((x) => x.date === "2026-10-05");
    const am = day.find((x) => x.startTime === "09:00")!;
    db.update(schema.cohortSessions).set({ startTime: "12:00", endTime: "13:00" }).where(eq(schema.cohortSessions.id, day.find((x) => x.startTime === "13:00")!.id)).run();
    const next = sessionsOf(c1).find((x) => x.date === "2026-10-05" && x.startTime === "12:00")!;
    addStaff(db, am.id, { userId: u1 }, actor);
    expect(() => addStaff(db, next.id, { userId: u1 }, actor)).not.toThrow();
  });

  it("เอาออก/เปลี่ยนบทบาท · คาบที่ล็อก (อนุมัติค่าตอบแทนแล้ว) แก้ไม่ได้", () => {
    const s = sessionsOf(c1)[1];
    const { row } = addStaff(db, s.id, { userId: u1 }, actor);
    setStaffRole(db, row.id, "lead", actor);
    expect(staffOf(s.id)[0].role).toBe("lead");
    removeStaff(db, row.id, actor);
    expect(staffOf(s.id)).toEqual([]);
    // เอาออกแล้วเพิ่มกลับได้ (unique นับเฉพาะแถวที่ยังไม่ลบ)
    const again = addStaff(db, s.id, { userId: u1 }, actor);
    db.update(schema.cohortSessions).set({ lockedAt: new Date() }).where(eq(schema.cohortSessions.id, s.id)).run();
    expect(() => removeStaff(db, again.row.id, actor)).toThrow(/ล็อก/);
    expect(() => addStaff(db, s.id, { userId: u2 }, actor)).toThrow(/ล็อก/);
  });

  it("ต้องเลือกคนใดคนหนึ่ง (ภายในหรือภายนอก)", () => {
    const s = sessionsOf(c1)[1];
    expect(() => addStaff(db, s.id, {}, actor)).toThrow(/อย่างใดอย่างหนึ่ง/);
    expect(() => addStaff(db, s.id, { userId: u1, externalName: "x" }, actor)).toThrow(/อย่างใดอย่างหนึ่ง/);
  });
});
