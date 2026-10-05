import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveAttendance, sessionRoster } from "@/lib/services/attendance";
import { addStaff } from "@/lib/services/schedule";
import { saveSessionReport, pendingReports, makeupNeeded, createMakeupSession, setInviteStatus, invitesDue, invitationText, reportOf } from "@/lib/services/session-close";

describe("บันทึกสอนจริง + ผลกิจกรรม + คาบชดเชย + การเชิญ (สเปก 9, 11.5, 22B)", () => {
  let db: DB;
  let u2: number, u3: number, cohortId: number;
  let s1: typeof schema.cohortSessions.$inferSelect;
  const eids: number[] = [];
  const staffOf = (sessionId: number) => db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.sessionId, sessionId), isNull(schema.sessionStaff.deletedAt))).all();

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    u2 = db.insert(schema.users).values({ firstName: "สอง", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    u3 = db.insert(schema.users).values({ firstName: "สาม", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    cohortId = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, 1).id;
    eids.length = 0;
    for (const n of ["1", "2", "3"]) {
      eids.push(registerEnrollment(db, { cohortId, person: { firstName: "ทดสอบ", lastName: `ปิดคาบ${n}`, nationalId: null }, incarceration: { inmateNo: `CL-${n}` }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01" }, { userId: 1, canOverride: false, consentRequired: true }).enrollment.id);
    }
    s1 = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.takesAttendance && x.hours >= 2)!;
  });

  it("ปิดคาบ: ต้องเช็คชื่อก่อน · บางส่วน/ไม่ได้ทำต้องมีเหตุผล · ชั่วโมงสอนจริงไม่เกินคาบ", () => {
    addStaff(db, s1.id, { userId: u2 }, { userId: 1 });
    const actor = { userId: u2, isAdmin: false };
    expect(() => saveSessionReport(db, s1.id, { outcome: "planned" }, actor)).toThrow(/เช็คชื่อ/);
    saveAttendance(db, s1.id, eids.map((e) => ({ enrollmentId: e, status: "present" as const })), actor);
    expect(() => saveSessionReport(db, s1.id, { outcome: "partial" }, actor)).toThrow(/เหตุผล/);
    const st = staffOf(s1.id)[0];
    expect(() => saveSessionReport(db, s1.id, { outcome: "planned", staff: [{ staffId: st.id, didTeach: true, actualHours: s1.hours + 1 }] }, actor)).toThrow(/ไม่เกิน/);
    const r = saveSessionReport(db, s1.id, { outcome: "planned", participation: "good", summary: "ดี", staff: [{ staffId: st.id, didTeach: true, actualHours: 1 }] }, actor);
    expect(r).toEqual({ participants: 3, proxyEntry: false });
    expect(staffOf(s1.id)[0]).toMatchObject({ didTeach: true, actualHours: 1 });
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, s1.id)).get()!;
    expect(s).toMatchObject({ status: "done", taughtBy: u2 });
    expect(s.taughtAt).toBeTruthy();
    // บันทึกซ้ำ = แก้ไข (version เพิ่ม)
    saveSessionReport(db, s1.id, { outcome: "planned", participation: "excellent" }, actor);
    expect(reportOf(db, s1.id)).toMatchObject({ participation: "excellent", version: 2 });
  });

  it("บันทึกแทนวิทยากรภายนอก: ผู้บันทึก ≠ ผู้สอน · ไม่ได้ทำกิจกรรม = ไม่มีใครสอนจริง", () => {
    addStaff(db, s1.id, { externalName: "วิทยากร ภายนอก" }, { userId: 1 });
    const r = saveSessionReport(db, s1.id, { outcome: "not_done", reason: "วิทยากรไม่มา" }, { userId: u3, isAdmin: false });
    expect(r.proxyEntry).toBe(true);
    expect(staffOf(s1.id).every((x) => !x.didTeach)).toBe(true);
    expect(reportOf(db, s1.id)).toMatchObject({ outcome: "not_done", proxyEntry: true });
  });

  it("คาบล็อก/ยกเลิก บันทึกไม่ได้ (ยกเว้นผู้ดูแลกับคาบล็อก)", () => {
    db.update(schema.cohortSessions).set({ lockedAt: new Date() }).where(eq(schema.cohortSessions.id, s1.id)).run();
    expect(() => saveSessionReport(db, s1.id, { outcome: "not_done", reason: "x" }, { userId: u2, isAdmin: false })).toThrow(/ล็อก/);
    expect(() => saveSessionReport(db, s1.id, { outcome: "not_done", reason: "x" }, { userId: 1, isAdmin: true })).not.toThrow();
    db.update(schema.cohortSessions).set({ status: "cancelled" }).where(eq(schema.cohortSessions.id, s1.id)).run();
    expect(() => saveSessionReport(db, s1.id, { outcome: "not_done", reason: "x" }, { userId: 1, isAdmin: true })).toThrow(/ยกเลิก/);
  });

  it("รายการค้างบันทึก: คาบของฉัน + (เจ้าหน้าที่หลัก) คาบที่มีแต่วิทยากรภายนอก · หายไปเมื่อบันทึกแล้ว", () => {
    addStaff(db, s1.id, { userId: u2 }, { userId: 1 });
    const other = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.date === s1.date && x.id !== s1.id)!;
    addStaff(db, other.id, { externalName: "นอก" }, { userId: 1 });
    const today = s1.date;
    const mine = pendingReports(db, u2, { includeProxy: false, today });
    expect(mine.map((x) => x.id)).toEqual([s1.id]);
    const withProxy = pendingReports(db, u2, { includeProxy: true, today });
    expect(withProxy.find((x) => x.id === other.id)?.proxy).toBe(true);
    expect(pendingReports(db, u3, { includeProxy: false, today })).toEqual([]);
    saveSessionReport(db, s1.id, { outcome: "not_done", reason: "งดกิจกรรม" }, { userId: u2, isAdmin: false });
    expect(pendingReports(db, u2, { includeProxy: false, today })).toEqual([]);
  });

  it("คาบชดเชย: ป้ายเมื่อมีผู้ติดเหตุราชทัณฑ์ · รายชื่อเฉพาะคนที่ติด · วิทยากรเดิม", () => {
    addStaff(db, s1.id, { userId: u2 }, { userId: 1 });
    saveAttendance(db, s1.id, [
      { enrollmentId: eids[0], status: "present" },
      { enrollmentId: eids[1], status: "corrections", correctionsType: "court" },
      { enrollmentId: eids[2], status: "absent" },
    ], { userId: 1, isAdmin: true });
    expect(makeupNeeded(db, cohortId).get(s1.id)).toEqual({ count: 1, makeupId: null });
    expect(() => createMakeupSession(db, s1.id, { date: "2026-08-01", startTime: "13:00", endTime: "14:00", hours: 1 }, { userId: 1 })).toThrow(/ไม่ก่อนวัน/);
    const mk = createMakeupSession(db, s1.id, { date: "2026-09-20", startTime: "13:00", endTime: "14:00", hours: 1 }, { userId: 1 });
    expect(mk).toMatchObject({ makeupOfId: s1.id, title: `ชดเชย: ${s1.title}` });
    expect(makeupNeeded(db, cohortId).get(s1.id)?.makeupId).toBe(mk.id);
    expect(staffOf(mk.id).map((x) => x.userId)).toEqual([u2]);
    expect(sessionRoster(db, mk.id).rows.map((r) => r.enrollmentId)).toEqual([eids[1]]);
    expect(() => createMakeupSession(db, mk.id, { date: "2026-09-21", startTime: "13:00", endTime: "14:00", hours: 1 }, { userId: 1 })).toThrow(/คาบชดเชยอยู่แล้ว/);
  });

  it("สถานะการเชิญ: เฉพาะวิทยากรภายนอก · เตือน ≤ 14 วันเมื่อยังไม่ยืนยัน · ข้อความไม่มีข้อมูลผู้ต้องขัง", () => {
    addStaff(db, s1.id, { userId: u2 }, { userId: 1 });
    addStaff(db, s1.id, { externalName: "ดร.ทดสอบ ภายนอก" }, { userId: 1 });
    const [internal, external] = staffOf(s1.id).sort((a, b) => (a.userId ? -1 : 1) - (b.userId ? -1 : 1));
    expect(() => setInviteStatus(db, internal.id, "sent", { userId: 1 })).toThrow(/ภายนอก/);
    expect(() => setInviteStatus(db, external.id, "xxx", { userId: 1 })).toThrow(/ไม่ถูกต้อง/);
    const before = "2026-08-25";
    expect(invitesDue(db, before).map((x) => x.staffId)).toEqual([external.id]);
    setInviteStatus(db, external.id, "sent", { userId: 1 });
    expect(invitesDue(db, before)[0].status).toBe("sent");
    setInviteStatus(db, external.id, "confirmed", { userId: 1 });
    expect(invitesDue(db, before)).toEqual([]);
    expect(invitesDue(db, "2026-08-01")).toEqual([]); // ไกลกว่า 14 วัน
    const text = invitationText({ name: "ดร.ทดสอบ", title: s1.title, date: s1.date, startTime: s1.startTime, endTime: s1.endTime, location: "ห้อง 1", cohortLabel: "B12 รุ่น 1", org: "สถานฟื้นฟู" }, (d) => d);
    expect(text).toContain(s1.title);
    expect(text).not.toMatch(/CL-|ปิดคาบ/);
  });
});
