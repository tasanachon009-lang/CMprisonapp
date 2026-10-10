import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort, planDayMap, weekStartOf } from "@/lib/services/cohorts";
import { registerEnrollment, confirmAdmissions, intakeGaps, type RegisterInput } from "@/lib/services/registry";
import { completeEnrollments } from "@/lib/services/followup";
import { FAST_PHASES, weekOf, scheduledPhase, phaseStatus, checkAdvance, phaseStartDate } from "@/lib/fast/phases";
import { fastTemplate, fastTotalHours, FAST_LEARNING_TOPICS, FAST_FAMILY_WEEKS } from "@/lib/fast/template";
import { autoCriteriaGaps } from "@/lib/rules/intake-criteria";
import { advancePhase, cohortPhases, phaseSummary, revertPhase } from "@/lib/services/fast-phase";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";

describe("ชุมชนบำบัด FAST: 5 ระยะ คำนวณจากสัปดาห์ของรุ่น (สเปก 16)", () => {
  const start = "2026-07-06"; // จันทร์

  it("สัปดาห์ของรุ่น: สัปดาห์ที่ 1 = สัปดาห์ของวันเริ่ม · เริ่มกลางสัปดาห์ก็นับสัปดาห์ที่ 1", () => {
    expect([weekOf(start, "2026-07-05"), weekOf(start, start), weekOf(start, "2026-07-12"), weekOf(start, "2026-07-13")]).toEqual([0, 1, 1, 2]);
    expect([weekOf("2026-07-08", "2026-07-08"), weekOf("2026-07-08", "2026-07-13")]).toEqual([1, 2]);
    expect(weekOf(start, "2026-12-18")).toBe(24);
  });

  it("ระยะตามปฏิทิน: Entry 1–2 · Rehabilitation 3–16 · Re-entry 17–20 · Halfway 21–24 · After care หลังสัปดาห์ 24", () => {
    const at = (week: number) => scheduledPhase(start, phaseStartDateOfWeek(week))?.code;
    expect([1, 2, 3, 16, 17, 20, 21, 24, 25, 60].map(at)).toEqual(["entry", "entry", "rehab", "rehab", "reentry", "reentry", "halfway", "halfway", "aftercare", "aftercare"]);
    expect(scheduledPhase(start, "2026-07-01")).toBeNull();
    expect(FAST_PHASES.map((p) => p.no)).toEqual([1, 2, 3, 4, 5]);
    expect([phaseStartDate(start, "entry"), phaseStartDate(start, "rehab"), phaseStartDate(start, "reentry"), phaseStartDate(start, "halfway")]).toEqual(["2026-07-06", "2026-07-20", "2026-10-26", "2026-11-23"]);
  });
  const phaseStartDateOfWeek = (week: number) => { const d = new Date(`${start}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + (week - 1) * 7); return d.toISOString().slice(0, 10); };

  it("ระยะจริงของสมาชิก = ระยะล่าสุดที่อนุมัติ · ถึงสัปดาห์แล้วยังไม่อนุมัติ = ถึงกำหนดเลื่อน", () => {
    const wk3 = phaseStatus(start, "2026-07-20", []);
    expect([wk3.current.code, wk3.scheduled?.code, wk3.due?.code, wk3.ahead]).toEqual(["entry", "rehab", "rehab", false]);
    const ok = phaseStatus(start, "2026-07-20", ["rehab"]);
    expect([ok.current.code, ok.due, ok.ahead]).toEqual(["rehab", null, false]);
    // ค้างหลายระยะ: แนะนำเลื่อนทีละระยะ
    expect(phaseStatus(start, "2026-11-25", []).due?.code).toBe("rehab");
    expect(phaseStatus(start, "2026-07-08", ["rehab"]).ahead).toBe(true);
  });

  it("เลื่อนได้ทีละระยะ ไม่ย้อน ไม่ข้าม", () => {
    expect(checkAdvance("entry", "rehab")).toBeNull();
    expect(checkAdvance("entry", "reentry")).toMatch(/ทีละระยะ/);
    expect(checkAdvance("rehab", "entry")).toMatch(/ย้อน/);
    expect(checkAdvance("rehab", "rehab")).toMatch(/ซ้ำ/);
    expect(checkAdvance("rehab", "xx")).toMatch(/ไม่พบระยะ/);
  });
});

describe("แม่แบบตาราง 24 สัปดาห์ และเกณฑ์รับเข้า", () => {
  it("120 วัน (24 สัปดาห์ × จันทร์–ศุกร์) · ประจำวันครบ · ศุกร์สัปดาห์ 3–14 = 12 หัวข้อ · ครอบครัว 7 ครั้ง · ศุกร์สัปดาห์ 24 ประเมินก่อนจบ", () => {
    const t = fastTemplate();
    expect(new Set(t.map((r) => r.dayNo)).size).toBe(120);
    for (const title of ["Morning Brief", "กลุ่มประชุมเช้า", "Staff Meeting"]) expect(t.filter((r) => r.title === title).length).toBe(120);
    expect(t.find((r) => r.title === "Morning Brief")).toMatchObject({ startTime: "08:00", endTime: "08:30", takesAttendance: false });
    expect(t.find((r) => r.title === "Staff Meeting")).toMatchObject({ startTime: "10:00", endTime: "11:00", takesAttendance: false });
    const friday = (week: number) => t.filter((r) => r.dayNo === (week - 1) * 5 + 5);
    expect(Array.from({ length: 12 }, (_, i) => friday(i + 3).find((r) => r.category === "การเรียนรู้แบบมีส่วนร่วม")?.title)).toEqual(FAST_LEARNING_TOPICS);
    expect(t.filter((r) => r.category === "การเรียนรู้แบบมีส่วนร่วม").length).toBe(12);
    expect(t.filter((r) => r.title === "กิจกรรมครอบครัว").map((r) => (r.dayNo - 5) / 5 + 1)).toEqual(FAST_FAMILY_WEEKS);
    for (const w of [15, 16, 23]) expect(FAST_FAMILY_WEEKS).toContain(w);
    expect(friday(24).some((r) => r.title === "ประเมินก่อนจบโปรแกรม")).toBe(true);
    expect(fastTotalHours()).toBe(t.filter((r) => r.takesAttendance).reduce((s, r) => s + r.hours, 0));
  });

  it("เกณฑ์ที่ระบบตรวจเอง: อายุ 18–60 จากวันเกิด · ชั้นกลางขึ้นไป", () => {
    const crit = { minAge: 18, maxAge: 60, prisonerClasses: ["medium", "good", "very_good", "excellent"], prisonerClassLabel: "นักโทษชั้นกลางขึ้นไป" };
    expect(autoCriteriaGaps(crit, { birthDate: "1990-01-01", prisonerClass: "medium" }, "2026-07-06")).toEqual([]);
    expect(autoCriteriaGaps(crit, { birthDate: "2008-07-07", prisonerClass: "good" }, "2026-07-06")[0]).toMatch(/อายุ 17 ปี/);
    expect(autoCriteriaGaps(crit, { birthDate: "2008-07-06", prisonerClass: "good" }, "2026-07-06")).toEqual([]); // ครบ 18 วันนี้
    expect(autoCriteriaGaps(crit, { birthDate: "1965-07-06", prisonerClass: "good" }, "2026-07-06")[0]).toMatch(/อายุ 61 ปี/);
    expect(autoCriteriaGaps(crit, { birthDate: "1990-01-01", prisonerClass: "bad" }, "2026-07-06")[0]).toMatch(/ชั้นนักโทษไม่อยู่ในเกณฑ์/);
    expect(autoCriteriaGaps(crit, {}, "2026-07-06").length).toBe(2);
    expect(autoCriteriaGaps(null, {}, "2026-07-06")).toEqual([]);
  });
});

describe("ชุมชนบำบัดในฐานข้อมูล: สร้างรุ่น รับเข้า เลื่อนระยะ", () => {
  let db: DB;
  let fast: typeof schema.courses.$inferSelect;
  const actor = { userId: 1, canOverride: false, consentRequired: false };
  const ok = (cohortId: number, no: string, extra: Partial<RegisterInput> = {}): RegisterInput => ({
    cohortId, person: { firstName: "สมาชิก", lastName: no, nationalId: null, birthDate: "1990-01-01" }, incarceration: { inmateNo: no, prisonerClass: "good" },
    intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] },
    confirmAdmission: true, consentSigned: true, consentDate: "2026-07-01", enrolledDate: "2026-07-06", acknowledgeWarnings: true, ...extra,
  });

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
  });

  it("หลักสูตรเปิดใช้ นับ 24 สัปดาห์ มีเกณฑ์และแม่แบบ · บสต. + รท.101 + ติดตาม", () => {
    expect([fast.enabled, fast.durationWeeks, fast.durationDays, fast.requiresBst, fast.requiresRt101, fast.requiresFollowup]).toEqual([true, 24, 120, true, true, true]);
    expect(fast.totalHours).toBe(fastTotalHours());
    expect((fast.intakeCriteria as { minAge: number }).minAge).toBe(18);
    expect(db.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, fast.id)).all().length).toBe(fastTemplate().length);
  });

  it("สร้างรุ่น: สิ้นสุดวันศุกร์สัปดาห์ที่ 24 · วันหยุดราชการไม่มีคาบ สัปดาห์ไม่เลื่อน · เริ่มกลางสัปดาห์ไม่มีคาบย้อนหลัง", () => {
    expect(weekStartOf("2026-07-08")).toBe("2026-07-06");
    const plan = planDayMap(db, fast, "2026-07-06");
    expect([plan.startDate, plan.endDate, plan.days.length]).toEqual(["2026-07-06", "2026-12-18", 120]);
    const holidays = new Set(db.select().from(schema.holidays).all().map((h) => h.date));
    const inRange = plan.days.filter((d) => d == null).length;
    expect(inRange).toBeGreaterThan(0); // มีวันหยุดราชการในช่วง 24 สัปดาห์
    for (const d of plan.days) if (d) expect(holidays.has(d)).toBe(false);
    const c = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1);
    expect([c.startDate, c.endDate]).toEqual(["2026-07-06", "2026-12-18"]);
    const sessions = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    // คาบของวันศุกร์สัปดาห์ที่ 3 (วันที่ 15 ของแม่แบบ) ต้องตกวันศุกร์ที่ 24 ก.ค. แม้มีวันหยุดก่อนหน้า
    const wk3fri = sessions.filter((s) => s.dayNo === 15);
    expect(new Set(wk3fri.map((s) => s.date))).toEqual(new Set(["2026-07-24"]));
    expect(wk3fri.some((s) => s.title === FAST_LEARNING_TOPICS[0])).toBe(true);
    expect(sessions.every((s) => !holidays.has(s.date))).toBe(true);
    // เริ่มวันพุธ: จันทร์-อังคารของสัปดาห์แรกไม่มีคาบ
    const mid = planDayMap(db, fast, "2026-07-08");
    expect([mid.days[0], mid.days[1], mid.days[2], mid.startDate, mid.endDate]).toEqual([null, null, "2026-07-08", "2026-07-08", "2026-12-18"]);
  });

  it("เกณฑ์รับเข้าบังคับที่เซิร์ฟเวอร์: อายุ/ชั้นนักโทษ/ยืนยันสมัครใจ · บันทึกร่างได้ · ยืนยันภายหลังเมื่อครบ", () => {
    const c = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1);
    expect(() => registerEnrollment(db, ok(c.id, "F-1", { incarceration: { inmateNo: "F-1", prisonerClass: "bad" } }), actor)).toThrow(/ชั้นนักโทษไม่อยู่ในเกณฑ์/);
    expect(() => registerEnrollment(db, ok(c.id, "F-2", { person: { firstName: "เด็ก", lastName: "F-2", nationalId: null, birthDate: "2010-01-01" } }), actor)).toThrow(/อายุ 16 ปี/);
    expect(() => registerEnrollment(db, ok(c.id, "F-3", { intake: { exclusions: [], confirmations: ["sentence_condition"] } }), actor)).toThrow(/สมัครใจ/);
    const draft = registerEnrollment(db, ok(c.id, "F-4", { confirmAdmission: false, incarceration: { inmateNo: "F-4", prisonerClass: "bad" } }), actor).enrollment;
    expect(draft.status).toBe("draft");
    expect(intakeGaps(db, draft).join(" ")).toMatch(/ชั้นนักโทษไม่อยู่ในเกณฑ์/);
    expect(confirmAdmissions(db, [draft.id], actor).done).toEqual([]);
    db.update(schema.incarcerations).set({ prisonerClass: "medium" }).where(eq(schema.incarcerations.id, draft.incarcerationId)).run();
    expect(confirmAdmissions(db, [draft.id], actor).done).toEqual([draft.id]);
    expect(registerEnrollment(db, ok(c.id, "F-5"), actor).enrollment.status).toBe("active");
  });

  it("เลื่อนระยะ: ต้องมีผลประเมิน · ทีละระยะ · หลายคนพร้อมกัน · After care หลังครบหลักสูตร · ยกเลิกล่าสุดได้ · บันทึก audit", () => {
    const c = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1);
    const a = registerEnrollment(db, ok(c.id, "F-1"), actor).enrollment.id, b = registerEnrollment(db, ok(c.id, "F-2"), actor).enrollment.id;
    const who = { userId: 1 };
    expect(() => advancePhase(db, { enrollmentIds: [a], toPhase: "rehab", date: "2026-07-20", note: "" }, who)).toThrow(/ผลการประเมิน/);
    expect(() => advancePhase(db, { enrollmentIds: [a], toPhase: "rehab", date: "2099-01-01", note: "ผ่าน" }, who)).toThrow(/อนาคต/);
    expect(() => advancePhase(db, { enrollmentIds: [], toPhase: "rehab", date: "2026-07-20", note: "ผ่าน" }, who)).toThrow(/เลือกสมาชิก/);
    const skip = advancePhase(db, { enrollmentIds: [a], toPhase: "reentry", date: "2026-07-20", note: "ผ่านการประเมิน" }, who);
    expect([skip.done, skip.errors[0].error]).toEqual([[], expect.stringMatching(/ทีละระยะ/)]);
    // สัปดาห์ที่ 3: ถึงกำหนดเลื่อนทั้ง 2 คน
    expect(phaseSummary(db, c.id, "2026-07-20")).toMatchObject({ total: 2, due: 2 });
    const r = advancePhase(db, { enrollmentIds: [a, b], toPhase: "rehab", date: "2026-07-20", note: "ผ่านการประเมินระยะแรกรับ" }, who);
    expect([r.done.sort(), r.errors]).toEqual([[a, b].sort(), []]);
    const s = phaseSummary(db, c.id, "2026-07-21");
    expect([s.due, s.byPhase.find((x) => x.phase.code === "rehab")!.n, s.byPhase.find((x) => x.phase.code === "entry")!.n]).toEqual([0, 2, 0]);
    expect(advancePhase(db, { enrollmentIds: [a], toPhase: "rehab", date: "2026-07-22", note: "ซ้ำ" }, who).errors[0].error).toMatch(/ย้อนหรือซ้ำ/);
    // วันที่ก่อนเริ่มระยะปัจจุบัน
    expect(advancePhase(db, { enrollmentIds: [a], toPhase: "reentry", date: "2026-07-10", note: "ผ่านการประเมิน" }, who).errors[0].error).toMatch(/ก่อนวันเริ่มระยะปัจจุบัน/);
    advancePhase(db, { enrollmentIds: [a], toPhase: "reentry", date: "2026-08-03", note: "ผ่านการประเมิน (เร็วกว่ากำหนด)" }, who);
    advancePhase(db, { enrollmentIds: [a], toPhase: "halfway", date: "2026-08-10", note: "ผ่านการประเมิน" }, who);
    expect(cohortPhases(db, c.id, "2026-08-10").find((m) => m.enrollmentId === a)!.status).toMatchObject({ ahead: true });
    expect(advancePhase(db, { enrollmentIds: [a], toPhase: "aftercare", date: "2026-08-11", note: "จบโปรแกรม" }, who).errors[0].error).toMatch(/ครบหลักสูตร/);
    completeEnrollments(db, [a], "completed", "2026-08-12", who);
    expect(advancePhase(db, { enrollmentIds: [a], toPhase: "aftercare", date: "2026-08-12", note: "จบโปรแกรม" }, who).done).toEqual([a]);
    // ยกเลิกล่าสุด
    expect(() => revertPhase(db, a, "", who)).toThrow(/เหตุผล/);
    revertPhase(db, a, "บันทึกผิดคน", who);
    expect(cohortPhases(db, c.id, "2026-08-12").find((m) => m.enrollmentId === a)!.status.current.code).toBe("halfway");
    const early = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "phase")).all();
    expect(early.filter((x) => x.action === "create").length).toBe(5);
    expect(early.some((x) => x.note === "เลื่อนก่อนกำหนดตามปฏิทิน")).toBe(true);
    expect(early.some((x) => x.action === "delete" && x.note === "บันทึกผิดคน")).toBe(true);
  });

  it("สิทธิ์: ฟื้นฟูดู/บันทึก · อนุมัติเลื่อนระยะเฉพาะผู้ดูแล · สถานพยาบาลดู · ผู้บริหารดูสรุป · การเงิน/ผู้ช่วย/ผู้คุมไม่เห็น", () => {
    expect(ROLE_PERMISSIONS.rehab).toEqual(expect.arrayContaining(["tc.view", "tc.edit"]));
    expect(ROLE_PERMISSIONS.rehab).not.toContain("tc.approve");
    expect(ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(["tc.view", "tc.edit", "tc.approve"]));
    for (const r of ["medical", "mental_health"] as const) { expect(ROLE_PERMISSIONS[r]).toContain("tc.view"); expect(ROLE_PERMISSIONS[r]).not.toContain("tc.edit"); }
    expect(ROLE_PERMISSIONS.executive.filter((p) => p.startsWith("tc."))).toEqual(["tc.summary"]);
    for (const r of ["finance", "assistant", "warden"] as const) expect(ROLE_PERMISSIONS[r].some((p) => p.startsWith("tc."))).toBe(false);
  });

  it("อัปเกรดฐานข้อมูลเก่า (ก่อนขั้น 5): เปิดหลักสูตร + 24 สัปดาห์ + เกณฑ์ + แม่แบบ ครั้งเดียว ไม่ทับค่าที่ตั้งเอง", () => {
    db.update(schema.courses).set({ enabled: false, durationWeeks: null, durationDays: 168, totalHours: 0, intakeCriteria: null }).where(eq(schema.courses.id, fast.id)).run();
    db.delete(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, fast.id)).run();
    db.delete(schema.settings).where(eq(schema.settings.key, "bootstrap.step5")).run();
    bootstrapReferenceData(db);
    const c = db.select().from(schema.courses).where(eq(schema.courses.id, fast.id)).get()!;
    expect([c.enabled, c.durationWeeks, c.durationDays, c.totalHours]).toEqual([true, 24, 120, fastTotalHours()]);
    expect(c.intakeCriteria).not.toBeNull();
    expect(db.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, fast.id)).all().length).toBe(fastTemplate().length);
    db.update(schema.courses).set({ enabled: false }).where(eq(schema.courses.id, fast.id)).run();
    bootstrapReferenceData(db);
    expect(db.select().from(schema.courses).where(eq(schema.courses.id, fast.id)).get()!.enabled).toBe(false);
  });
});
