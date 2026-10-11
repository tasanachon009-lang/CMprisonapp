import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, isNull } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { setTopicTeaching } from "@/lib/services/pay-setup";
import { saveInstructor } from "@/lib/services/instructors";
import { saveSessionReport } from "@/lib/services/session-close";
import { liveLines } from "@/lib/services/pay";

describe("คลังหัวข้อ: ตั้งเบิก/ไม่เบิก และผู้สอนอย่างง่าย", () => {
  let db: DB;
  let b12: number, ext: number;
  const actor = { userId: 1 };
  const topic = (name: string) => db.select().from(schema.activityTopics).where(and(eq(schema.activityTopics.courseId, b12), eq(schema.activityTopics.name, name))).get()!;
  const staffOf = (sessionId: number) => db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.sessionId, sessionId), isNull(schema.sessionStaff.deletedAt))).all();

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    db.insert(schema.userRoles).values({ userId: 1, role: "admin" }).run();
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    ext = saveInstructor(db, null, { kind: "external", externalType: "gov", firstName: "สมศรี", lastName: "ใจดี", organization: "โรงพยาบาลตัวอย่าง" }, actor);
  });

  it("สลับเบิก/ไม่เบิกได้ทุกหัวข้อ ไม่ขึ้นกับประเภทผู้สอน · บันทึกประวัติ", () => {
    const orient = topic("ปฐมนิเทศ แนะนำหลักสูตรและกฎระเบียบระหว่างการอบรม");
    expect(orient).toMatchObject({ staffingType: "team", payable: false });
    setTopicTeaching(db, orient.id, { payable: true }, actor);
    expect(topic(orient.name)).toMatchObject({ staffingType: "team", payable: true });
    const lecture = topic("ทบทวนจิตตนเอง");
    setTopicTeaching(db, lecture.id, { payable: false }, actor);
    expect(topic(lecture.name).payable).toBe(false);
    expect(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "activity_topic")).all().length).toBe(2);
    expect(() => setTopicTeaching(db, 99999, { payable: true }, actor)).toThrow(/ไม่พบหัวข้อ/);
  });

  it("เลือกผู้สอนจากทะเบียน (ชื่อ + หน่วยงาน) → เติมให้รุ่นใหม่ · เปลี่ยนกลับเป็นทั้งทีมได้", () => {
    const orient = topic("ปฐมนิเทศ แนะนำหลักสูตรและกฎระเบียบระหว่างการอบรม");
    setTopicTeaching(db, orient.id, { staff: [{ instructorId: ext }, { instructorId: ext }] }, actor); // ซ้ำ = นับครั้งเดียว
    expect(topic(orient.name)).toMatchObject({ staffingType: "individual", maxStaff: 2, defaultStaff: [{ instructorId: ext }] });
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const s = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, c.id), eq(schema.cohortSessions.topicId, orient.id))).get()!;
    expect(staffOf(s.id).map((x) => x.instructorId)).toEqual([ext]);
    expect(() => setTopicTeaching(db, orient.id, { staff: [{ instructorId: 99999 }] }, actor)).toThrow(/ไม่พบผู้สอน/);
    setTopicTeaching(db, orient.id, { staff: "team" }, actor);
    expect(topic(orient.name)).toMatchObject({ staffingType: "team", maxStaff: null, defaultStaff: null });
  });

  it("การเบิกมีผลกับการคิดค่าตอบแทนของคาบที่ยังไม่อนุมัติ", () => {
    const orient = topic("ปฐมนิเทศ แนะนำหลักสูตรและกฎระเบียบระหว่างการอบรม");
    setTopicTeaching(db, orient.id, { payable: true, staff: [{ instructorId: ext }] }, actor);
    const c = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, 1);
    db.update(schema.cohortSessions).set({ takesAttendance: false }).where(eq(schema.cohortSessions.cohortId, c.id)).run();
    const s = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, c.id), eq(schema.cohortSessions.topicId, orient.id))).get()!;
    saveSessionReport(db, s.id, { outcome: "planned" }, { userId: 1, isAdmin: true });
    const paid = () => liveLines(db, { cohortId: c.id }).filter((l) => l.sessionId === s.id && l.payable).map((l) => l.amountSatang);
    expect(paid()).toEqual([3 * 60000]); // 3 ชม. × อัตราตัวอย่างภาครัฐ 600 บาท
    setTopicTeaching(db, orient.id, { payable: false }, actor);
    expect(paid()).toEqual([]);
  });
});
