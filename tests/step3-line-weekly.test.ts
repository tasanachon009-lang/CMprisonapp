import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { addStaff } from "@/lib/services/schedule";
import { updateSession } from "@/lib/services/schedule-edit";
import { dayText, weekText, nextWorkingDay, splitText, looksLikeInmateData, hashText } from "@/lib/line/messages";
import { sendLine, lineMode } from "@/lib/line/send";
import { runDaily, runChanges } from "@/lib/line/jobs";
import { collectWeekly, upsertDraft, approveWeekly, saveWeeklyTexts, unapproveWeekly, weeklyLineSummary, mondayOf } from "@/lib/services/weekly-report";

describe("LINE แจ้งตารางสอน + รายงานประจำสัปดาห์ (สเปก 12, 18.2)", () => {
  let db: DB;
  let head: number, cohortId: number;
  const savedToken = config.lineToken;
  const ok = async () => new Response("{}", { status: 200 });

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    bootstrapReferenceData(db);
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    cohortId = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, head).id;
    registerEnrollment(db, { cohortId, person: { firstName: "สมชายลับ", lastName: "ห้ามปรากฏ", nationalId: null }, incarceration: { inmateNo: "69-12345" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-05" }, { userId: head, canOverride: true, consentRequired: false });
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.date === "2026-10-06" && x.startTime === "09:00")!;
    addStaff(db, s.id, { userId: head }, { userId: head });
    config.lineToken = "";
  });
  afterEach(() => { config.lineToken = savedToken; });

  it("ข้อความตาราง: เวลา/ผู้สอน/หัวข้อ/หลักสูตร-รุ่น/สถานที่ · ไม่มีชื่อหรือเลขประจำตัวผู้ต้องขัง", () => {
    const t = dayText(db, "2026-10-06");
    expect(t.text).toMatch(/09:00–12:00/);
    expect(t.text).toContain("หัวหน้า ทดสอบ");
    expect(t.text).toMatch(/รุ่นที่ 1\/2570/);
    expect(t.text).not.toMatch(/สมชายลับ|ห้ามปรากฏ|69-12345/);
    expect(looksLikeInmateData(t.text)).toBe(false);
    expect(looksLikeInmateData("ผู้ต้องขัง 69-12345")).toBe(true);
    expect(weekText(db, "2026-10-05").count).toBeGreaterThan(5);
  });

  it("วันทำการถัดไป ข้ามเสาร์-อาทิตย์และวันหยุด · แบ่งข้อความยาวไม่เกิน 5,000 ตัวอักษร", () => {
    expect(nextWorkingDay(db, "2026-10-09")).toBe("2026-10-12"); // ศุกร์ → จันทร์
    expect(nextWorkingDay(db, "2026-10-12")).toBe("2026-10-14"); // 13 ต.ค. วันหยุด
    const parts = splitText(Array.from({ length: 400 }, (_, i) => `บรรทัดที่ ${i} ${"ก".repeat(20)}`).join("\n"));
    expect(parts.length).toBeGreaterThan(1);
    expect(parts.every((p) => p.length <= 5000)).toBe(true);
  });

  it("โหมดทดลอง: ไม่มี token หรือฐานข้อมูลปลอม → บันทึกแต่ไม่ส่ง · มี token → ส่งจริง (api.line.me) · ล้มเหลว → แจ้งผู้ดูแล", async () => {
    expect(lineMode(db).live).toBe(false);
    expect((await sendLine(db, "test", "ทดสอบ")).status).toBe("dry_run");
    config.lineToken = "fake-token-for-test";
    setSetting(db, "app.isDemoData", true, head);
    expect(lineMode(db).live).toBe(false);
    setSetting(db, "app.isDemoData", false, head);
    const calls: string[] = [];
    const r = await sendLine(db, "test", "ทดสอบ", { fetcher: async (url) => { calls.push(url); return ok(); } });
    expect(r.status).toBe("sent");
    expect(calls).toEqual(["https://api.line.me/v2/bot/message/broadcast"]);
    const f = await sendLine(db, "test", "ทดสอบ", { fetcher: async () => new Response("bad", { status: 401 }) });
    expect(f).toMatchObject({ status: "failed", httpStatus: 401 });
    expect(db.select().from(schema.notifications).all().some((n) => n.kind === "line_failed")).toBe(true);
    await expect(sendLine(db, "test", "ผู้ต้องขัง 69-12345")).rejects.toThrow(/ข้อมูลผู้ต้องขัง/);
  });

  it("งานตั้งเวลา: ปิดอยู่ = ไม่ส่ง · ส่งตารางวันทำการถัดไปครั้งเดียว · ศุกร์ส่งตารางสัปดาห์หน้า · แก้ตารางหลังส่ง → แจ้งเปลี่ยนแปลง", async () => {
    expect(await runDaily(db, "2026-10-05")).toMatch(/ปิด/);
    setSetting(db, "line.enabled", true, head);
    await runDaily(db, "2026-10-05");
    await runDaily(db, "2026-10-05");
    const msgs = () => db.select().from(schema.lineMessages).all();
    expect(msgs().filter((m) => m.kind === "daily").map((m) => m.targetDate)).toEqual(["2026-10-06"]);
    expect(await runChanges(db, "2026-10-05")).toMatch(/ไม่มีการเปลี่ยนแปลง/);
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.date === "2026-10-06" && x.startTime === "09:00")!;
    updateSession(db, s.id, { location: "ห้องอบรม 2" }, { userId: head });
    await runChanges(db, "2026-10-05");
    const change = msgs().find((m) => m.kind === "change")!;
    expect(change.text).toMatch(/แจ้งเปลี่ยนแปลง/);
    expect(change.text).toContain("ห้องอบรม 2");
    expect(change.contentHash).toBe(hashText(dayText(db, "2026-10-06").text));
    expect(await runChanges(db, "2026-10-05")).toMatch(/ไม่มีการเปลี่ยนแปลง/); // ส่งครั้งเดียวต่อการแก้
    await runDaily(db, "2026-10-09"); // ศุกร์
    expect(msgs().some((m) => m.kind === "weekly_schedule" && m.targetDate === "2026-10-12")).toBe(true);
  });

  it("รายงานประจำสัปดาห์: ตัวเลขรวม · ร่างเก็บข้อความที่แก้ · อนุมัติแล้วแก้ไม่ได้ · สรุป LINE ไม่มีชื่อบุคคล", () => {
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.date === "2026-10-06" && x.startTime === "09:00")!;
    // คาบในอนาคตบันทึกผลผ่านหน้าจอไม่ได้ (ถูกต้อง) → ใส่ผลกิจกรรมตรงเพื่อทดสอบการรวบรวม
    db.insert(schema.sessionReports).values({ sessionId: s.id, outcome: "planned", summary: "ดีมาก", issues: "ห้องร้อน ขอพัดลมเพิ่ม", participants: 1, createdBy: head }).run();
    db.update(schema.cohortSessions).set({ taughtAt: new Date(), status: "done" }).where(eq(schema.cohortSessions.id, s.id)).run();
    const monday = mondayOf("2026-10-08");
    expect(monday).toBe("2026-10-05");
    const d = collectWeekly(db, monday);
    expect(d.overview).toMatchObject({ people: 1, newThisWeek: 1 });
    expect(d.activities.find((a) => a.title === s.title && a.date === s.date)).toMatchObject({ result: "ตามแผน", summary: "ดีมาก", staff: "หัวหน้า ทดสอบ" });
    expect(d.issuesPrefill).toContain("ห้องร้อน");
    expect(JSON.stringify(d)).not.toMatch(/สมชายลับ|69-12345/);
    const r = upsertDraft(db, monday, head);
    saveWeeklyTexts(db, r.id, { issues: "แก้แล้ว", nextPlan: "แผน", note: null }, { userId: head });
    upsertDraft(db, monday, head); // รวบรวมตัวเลขใหม่ ไม่ทับข้อความ
    expect(db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, r.id)).get()!.issues).toBe("แก้แล้ว");
    expect(() => approveWeekly(db, r.id, { userId: head })).toThrow(/ยังมีคาบที่ไม่ได้บันทึกผล/);
    const a = approveWeekly(db, r.id, { userId: head }, { acknowledgeUnrecorded: true });
    expect(() => saveWeeklyTexts(db, r.id, { issues: "x", nextPlan: null, note: null }, { userId: head })).toThrow(/อนุมัติแล้ว/);
    const line = weeklyLineSummary(a.data as ReturnType<typeof collectWeekly>);
    expect(line).toMatch(/สรุปรายงานประจำสัปดาห์/);
    expect(line).not.toMatch(/หัวหน้า|สมชายลับ/);
    expect(() => unapproveWeekly(db, r.id, " ", { userId: head })).toThrow(/เหตุผล/);
    unapproveWeekly(db, r.id, "แก้ตัวเลข", { userId: head });
    expect(db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, r.id)).get()!.status).toBe("draft");
  });
});
