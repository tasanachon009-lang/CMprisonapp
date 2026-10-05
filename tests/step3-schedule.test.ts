import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff } from "@/lib/services/schedule";
import { updateSession, addSession, cancelSession, replaceStaffInRange, payableOverage, locationConflicts } from "@/lib/services/schedule-edit";
import { calendarSessions, overlapReport } from "@/lib/queries/calendar";
import { registerEnrollment } from "@/lib/services/registry";

const actor = { userId: 1 };

describe("แก้ตารางของรุ่น (สเปก 11.4) + ปฏิทินรวม (22B)", () => {
  let db: DB;
  let b12: number, u2: number, u3: number;
  const sessionsOf = (cohortId: number) => db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
  const staffOf = (sessionId: number) => db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.sessionId, sessionId), isNull(schema.sessionStaff.deletedAt))).all();

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    u2 = db.insert(schema.users).values({ firstName: "สอง", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    u3 = db.insert(schema.users).values({ firstName: "สาม", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
  });

  it("คัดลอกตารางจากรุ่นก่อน: เลื่อนวันตามวันอบรม (ข้ามวันหยุด) พร้อมวิทยากร · ไม่คัดลอกคาบยกเลิก", () => {
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const s = sessionsOf(a.id).find((x) => x.startTime === "09:00")!;
    addStaff(db, s.id, { userId: u2, role: "lead" }, actor);
    updateSession(db, s.id, { location: "ห้องอบรม 2", startTime: "09:30", endTime: "11:30" }, actor);
    const cancelled = sessionsOf(a.id).find((x) => x.startTime === "13:00" && x.dayNo === 2)!;
    cancelSession(db, cancelled.id, "วิทยากรติดภารกิจ", actor);
    const b = createCohort(db, { courseId: b12, number: 5, startDate: "2027-01-04", copyFromCohortId: a.id }, 1);
    const bs = sessionsOf(b.id);
    expect(bs.length).toBe(sessionsOf(a.id).length - 1);
    const copied = bs.find((x) => x.dayNo === 1 && x.startTime === "09:30")!;
    expect(copied).toMatchObject({ date: "2027-01-04", location: "ห้องอบรม 2", title: s.title, topicId: s.topicId });
    expect(staffOf(copied.id).map((x) => [x.userId, x.role])).toEqual([[u2, "lead"]]);
    expect(b.endDate).toBe("2027-01-19");
  });

  it("ย้ายคาบ: วิทยากรสอนซ้อน/สถานที่ใช้ซ้อน ต้องยืนยัน · เช็คชื่อแล้วย้ายวันไม่ได้ · เวลาไม่ถูกต้องบอกให้แก้", () => {
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const b = createCohort(db, { courseId: b12, number: 9, startDate: "2026-10-05" }, 1);
    const sa = sessionsOf(a.id).find((x) => x.date === "2026-10-05" && x.startTime === "09:00")!;
    const sb = sessionsOf(b.id).find((x) => x.date === "2026-10-06" && x.startTime === "09:00")!;
    addStaff(db, sa.id, { userId: u2 }, actor);
    addStaff(db, sb.id, { userId: u2 }, actor);
    updateSession(db, sa.id, { location: "ห้องอบรม 1" }, actor);
    updateSession(db, sb.id, { location: "ห้องอบรม 1" }, actor);
    // ย้าย sb มาวันเดียวกับ sa → ซ้อนทั้งวิทยากรและสถานที่
    expect(() => updateSession(db, sb.id, { date: "2026-10-05" }, actor)).toThrow(/ซ้อน/);
    const r = updateSession(db, sb.id, { date: "2026-10-05" }, actor, { acknowledge: true });
    expect(r.warnings.length).toBe(2);
    expect(locationConflicts(db, { ...sb, date: "2026-10-05", location: "ห้องอบรม 1" }).length).toBe(1);
    expect(() => updateSession(db, sa.id, { startTime: "12:00", endTime: "11:00" }, actor)).toThrow(/เวลาเริ่มต้องก่อน/);
    expect(() => updateSession(db, sa.id, { hours: 5 }, actor)).toThrow(/มากกว่าช่วงเวลา/);
    db.update(schema.cohortSessions).set({ attendanceCheckedAt: new Date() }).where(eq(schema.cohortSessions.id, sa.id)).run();
    expect(() => updateSession(db, sa.id, { date: "2026-10-07" }, actor)).toThrow(/เช็คชื่อแล้ว/);
    expect(() => cancelSession(db, sa.id, "x", actor)).toThrow(/เช็คชื่อแล้ว/);
  });

  it("เพิ่มคาบจากหัวข้อ / ยกเลิกคาบต้องมีเหตุผล", () => {
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const topic = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.courseId, b12)).all().find((t) => t.name === "ทักษะการปฏิเสธ")!;
    const s = addSession(db, a.id, { date: "2026-10-06", startTime: "14:00", endTime: "15:30", hours: 1.5, topicId: topic.id }, actor);
    expect(s).toMatchObject({ title: "ทักษะการปฏิเสธ", category: topic.category, dayNo: 2 });
    expect(() => cancelSession(db, s.id, " ", actor)).toThrow(/เหตุผล/);
    cancelSession(db, s.id, "ซ้ำ", actor);
    expect(db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, s.id)).get()!.status).toBe("cancelled");
  });

  it("เปลี่ยน ก. เป็น ข. ทุกคาบในช่วง: ข้ามคาบล็อก · ข. อยู่แล้วเอา ก. ออก · รายงานคาบที่ ข. สอนซ้อน", () => {
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const morning = sessionsOf(a.id).filter((x) => x.startTime === "09:00").slice(0, 4);
    for (const s of morning) addStaff(db, s.id, { userId: u2 }, actor);
    addStaff(db, morning[1].id, { userId: u3 }, actor);
    db.update(schema.cohortSessions).set({ lockedAt: new Date() }).where(eq(schema.cohortSessions.id, morning[3].id)).run();
    const r = replaceStaffInRange(db, { from: { userId: u2 }, to: { userId: u3 }, dateFrom: morning[0].date, dateTo: morning[3].date, cohortId: a.id }, actor);
    expect(r.replaced).toBe(3);
    expect(r.skipped).toEqual([expect.objectContaining({ sessionId: morning[3].id, reason: expect.stringContaining("ล็อก") })]);
    expect(staffOf(morning[0].id).map((x) => x.userId)).toEqual([u3]);
    expect(staffOf(morning[1].id).map((x) => x.userId)).toEqual([u3]);
    expect(staffOf(morning[3].id).map((x) => x.userId)).toEqual([u2]);
    expect(() => replaceStaffInRange(db, { from: { userId: u2 }, to: { userId: u2 }, dateFrom: "2026-10-01", dateTo: "2026-10-31" }, actor)).toThrow(/คนเดียวกัน/);
  });

  it("วิทยากรเกินที่เบิกได้ตามลักษณะกิจกรรม (บรรยาย 1 คน)", () => {
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const lecture = sessionsOf(a.id).find((x) => x.startTime === "09:00" && x.dayNo === 2)!; // ยาเสพติดกับผลต่อร่างกายและสมอง = บรรยาย
    addStaff(db, lecture.id, { userId: u2 }, actor);
    expect(payableOverage(db, [lecture]).size).toBe(0);
    addStaff(db, lecture.id, { userId: u3 }, actor);
    expect(payableOverage(db, sessionsOf(a.id)).get(lecture.id)).toEqual({ count: 2, limit: 1, type: "lecture" });
  });

  it("ปฏิทินรวม: กรองตามวิทยากร · รายงานความทับซ้อนรวมผู้ต้องขังที่อยู่ 2 หลักสูตร", () => {
    const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
    db.update(schema.courses).set({ enabled: true }).where(eq(schema.courses.id, fast.id)).run();
    const a = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const f = createCohort(db, { courseId: fast.id, startDate: "2026-10-05" }, 1);
    const sa = sessionsOf(a.id).find((x) => x.date === "2026-10-05" && x.startTime === "09:00")!;
    addStaff(db, sa.id, { userId: u2 }, actor);
    expect(calendarSessions(db, "2026-10-05", "2026-10-05", { person: { userId: u2 } }).map((s) => s.id)).toEqual([sa.id]);
    // คาบของชุมชนบำบัดเวลาซ้อน + ผู้ต้องขังคนเดียวกันอยู่ทั้ง 2 รุ่น
    addSession(db, f.id, { date: "2026-10-05", startTime: "09:30", endTime: "10:30", hours: 1, title: "กิจกรรมทดสอบ" }, actor);
    const reg = (cohortId: number) => registerEnrollment(db, { cohortId, person: { firstName: "ทดสอบ", lastName: "ซ้อน", nationalId: null }, incarceration: { inmateNo: "OV-1" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true }, { userId: 1, canOverride: true, consentRequired: false });
    reg(a.id);
    reg(f.id);
    const report = overlapReport(db, "2026-10-05", "2026-10-05");
    expect(report.some((o) => o.kind === "inmate" && o.text.includes("OV-1"))).toBe(true);
  });
});
