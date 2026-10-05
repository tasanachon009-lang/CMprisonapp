import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { addStaff } from "@/lib/services/schedule";
import { addSession } from "@/lib/services/schedule-edit";
import { dutyCandidates, dutyMap, ensureDutyRoster, setDutyOfficer, myDutyCohorts } from "@/lib/services/duty";
import { saveSessionReport, pendingReports, dutyTodaySessions, overdueReports, setTopicChips, chipsForSession, reportOf, composeSummary, SHIFT_CHIP } from "@/lib/services/session-close";
import { draftChips } from "@/lib/reference-data";

describe("ผู้รับผิดชอบประจำวัน + บันทึกผลแบบกดเลือก (สเปก 22B)", () => {
  let db: DB;
  let head: number, a1: number, a2: number, assistant: number, b12: number;
  const user = (firstName: string, roles: string[], sortOrder: number) => {
    const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x", sortOrder }).returning().get().id;
    for (const role of roles) db.insert(schema.userRoles).values({ userId: id, role }).run();
    return id;
  };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = user("หัวหน้า", ["admin", "rehab"], 1);
    a1 = user("เอหนึ่ง", ["rehab", "medical"], 2);
    a2 = user("เอสอง", ["rehab"], 3);
    assistant = user("บี", ["assistant"], 4);
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
  });

  it("กลุ่ม A = เจ้าหน้าที่หลัก ไม่รวมหัวหน้า/รอง · สร้างรุ่นแล้วหมุนเวียนให้ทุกวันอบรม", () => {
    expect(dutyCandidates(db).map((u) => u.id)).toEqual([a1, a2]);
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, head);
    const m = dutyMap(db, c.id);
    const dates = Array.from(new Set(db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all().map((s) => s.date))).sort();
    expect(m.size).toBe(dates.length);
    expect(m.get(dates[0])!.userId).not.toBe(m.get(dates[1])!.userId); // สลับกันวันละคน
    expect([...m.values()].every((r) => [a1, a2].includes(r.userId) && r.source === "auto")).toBe(true);
  });

  it("กำหนดเองได้เฉพาะกลุ่ม A · เติมอัตโนมัติไม่ทับวันที่กำหนดเอง · เพิ่มคาบวันใหม่ได้ผู้รับผิดชอบ", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, head);
    expect(() => setDutyOfficer(db, c.id, "2026-10-05", assistant, { userId: head })).toThrow(/กลุ่ม A/);
    setDutyOfficer(db, c.id, "2026-10-05", a2, { userId: head });
    ensureDutyRoster(db, c.id);
    expect(dutyMap(db, c.id).get("2026-10-05")).toMatchObject({ userId: a2, source: "manual" });
    expect(myDutyCohorts(db, a2, "2026-10-05")).toEqual([c.id]);
    addSession(db, c.id, { date: "2026-10-31", startTime: "09:00", endTime: "10:00", hours: 1, title: "กิจกรรมพิเศษ" }, { userId: head });
    expect(dutyMap(db, c.id).has("2026-10-31")).toBe(true);
  });

  it("คาบวิทยากรภายนอกค้างบันทึก: ไปที่ผู้รับผิดชอบประจำวันเท่านั้น · เลยวันแล้วหัวหน้า/รองเห็น", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, head);
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all().find((x) => x.date === "2026-09-01" && x.startTime === "13:00")!;
    // ล้างวิทยากรภายในที่เติมให้อัตโนมัติ แล้วใส่วิทยากรภายนอกคนเดียว
    db.update(schema.sessionStaff).set({ deletedAt: new Date() }).where(eq(schema.sessionStaff.sessionId, s.id)).run();
    addStaff(db, s.id, { externalName: "วิทยากร ภายนอก" }, { userId: head });
    setDutyOfficer(db, c.id, s.date, a1, { userId: head });
    const sameDay = s.date;
    expect(pendingReports(db, a1, { scope: "main", today: sameDay }).some((x) => x.id === s.id)).toBe(true);
    expect(pendingReports(db, a2, { scope: "main", today: sameDay }).some((x) => x.id === s.id)).toBe(false);
    expect(pendingReports(db, head, { scope: "admin", today: sameDay }).some((x) => x.id === s.id)).toBe(false); // วันนี้ยังไม่แจ้งหัวหน้า
    const nextDay = "2026-09-02";
    expect(pendingReports(db, head, { scope: "admin", today: nextDay }).find((x) => x.id === s.id)).toMatchObject({ overdue: true, dutyUserId: a1 });
    expect(overdueReports(db, nextDay).some((x) => x.id === s.id)).toBe(true);
    const card = dutyTodaySessions(db, a1, sameDay);
    expect(card.cohorts.map((x) => x.id)).toEqual([c.id]);
    expect(card.sessions.map((x) => x.id)).toContain(s.id);
    expect(dutyTodaySessions(db, a2, sameDay).cohorts).toEqual([]);
    // บันทึกแทน + คัดลอกจากใบบันทึกของวิทยากร
    saveSessionReport(db, s.id, { outcome: "not_done", reason: "วิทยากรไม่มา", source: "paper_copy" }, { userId: a1, isAdmin: false });
    expect(reportOf(db, s.id)).toMatchObject({ proxyEntry: true, source: "paper_copy" });
    expect(pendingReports(db, head, { scope: "admin", today: nextDay }).some((x) => x.id === s.id)).toBe(false);
  });

  it("ชิป: ชุดร่างจากชื่อหัวข้อ · หัวหน้าแก้แล้วไม่เป็นร่าง · บันทึกชิปที่เลือก · ประกอบประโยคสรุป", () => {
    const topic = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.courseId, b12)).all().find((t) => t.name === "ทักษะการปฏิเสธ")!;
    expect(topic.outcomeChips).toEqual(draftChips("ทักษะการปฏิเสธ", "individual"));
    expect(topic.outcomeChips).toContain("สมาชิกบอกหลักการปฏิเสธได้");
    expect(chipsForSession(db, { topicId: topic.id }, ["สมาชิกกล้าแสดงออก", SHIFT_CHIP]).draft).toBe(true);
    setTopicChips(db, topic.id, ["ฝึกบทบาทสมมติครบ", " ฝึกบทบาทสมมติครบ ", ""], { userId: head });
    const after = chipsForSession(db, { topicId: topic.id }, ["สมาชิกกล้าแสดงออก", SHIFT_CHIP]);
    expect(after).toEqual({ topic: ["ฝึกบทบาทสมมติครบ"], general: ["สมาชิกกล้าแสดงออก"], draft: false });
    expect(composeSummary("planned", ["ฝึกบทบาทสมมติครบ", SHIFT_CHIP], "good")).toBe("ดำเนินกิจกรรมตามแผน ผู้เข้าอบรมมีส่วนร่วมดี — ฝึกบทบาทสมมติครบ");
    expect(composeSummary("not_done", ["x"], "good")).toBe("");

    const c = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, head);
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all().find((x) => !x.takesAttendance || x.date === "2026-09-01")!;
    db.update(schema.cohortSessions).set({ takesAttendance: false }).where(eq(schema.cohortSessions.id, s.id)).run();
    saveSessionReport(db, s.id, { outcome: "planned", participation: "good", chips: ["ฝึกบทบาทสมมติครบ", "ฝึกบทบาทสมมติครบ", SHIFT_CHIP] }, { userId: a1, isAdmin: false });
    expect(reportOf(db, s.id)).toMatchObject({ chips: ["ฝึกบทบาทสมมติครบ", SHIFT_CHIP], source: "direct" });
  });
});
