import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment, RuleError, type RegisterInput } from "@/lib/services/registry";
import { recordReleases, cancelRelease } from "@/lib/services/release";
import { saveAttendance, sessionRoster } from "@/lib/services/attendance";

let db: DB;
let b12: number, fast: number;
const actor = { userId: 1, canOverride: false, consentRequired: true };
const admin = { ...actor, canOverride: true };

function input(cohortId: number, inmateNo: string, extra: Partial<RegisterInput> = {}): RegisterInput {
  return {
    cohortId, person: { firstName: "ทดสอบ", lastName: "ระบบ", nationalId: null }, incarceration: { inmateNo },
    confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", ...extra,
  };
}

beforeEach(() => {
  const sqlite = openDatabase(":memory:");
  db = drizzle(sqlite, { schema }) as DB;
  runMigrations(db);
  bootstrapReferenceData(db);
  db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
  b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
  fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!.id;
});

describe("สร้างรุ่น", () => {
  it("คำนวณวันสิ้นสุดข้ามวันหยุดและสร้างคาบจากแม่แบบ", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    expect(c.fiscalYear).toBe(2570);
    expect(c.endDate).toBe("2026-10-21"); // ข้าม 13 ต.ค. และเสาร์-อาทิตย์
    const n = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    expect(n.length).toBe(55); // ตามตารางในคู่มือ: วันละ 4–5 คาบ (รวมประชุมเช้าและบันทึกประจำวันที่ไม่นับชั่วโมง)
    expect(n.reduce((s, x) => s + x.hours, 0)).toBe(60);
  });
  it("เลขรุ่นซ้ำในปีงบเดียวกันไม่ได้", () => {
    createCohort(db, { courseId: b12, number: 1, startDate: "2026-10-05" }, 1);
    expect(() => createCohort(db, { courseId: b12, number: 1, startDate: "2027-01-04" }, 1)).toThrow(/มีรุ่นที่ 1\/2570/);
  });
});

describe("ลงทะเบียนและกันลงซ้ำ (7.2)", () => {
  it("เลขเดียวกัน + หลักสูตรเดียวกัน → บล็อก แม้ต่างรุ่น / ผู้ดูแลปลดล็อกได้พร้อมเหตุผล", () => {
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const c2 = createCohort(db, { courseId: b12, startDate: "2027-01-04" }, 1);
    registerEnrollment(db, input(c1.id, "A-1"), actor);
    expect(() => registerEnrollment(db, input(c2.id, "a-1"), actor)).toThrow(RuleError);
    expect(() => registerEnrollment(db, input(c2.id, "A-1", { override: { reason: "x" } }), actor)).toThrow(/เฉพาะผู้ดูแล/);
    const r = registerEnrollment(db, input(c2.id, "A-1", { override: { reason: "ศาลสั่งให้บำบัดซ้ำ" } }), admin);
    expect(r.enrollment.overrideSeq).toBe(1);
    const audit = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.action, "enrollment.override_duplicate")).all();
    expect(audit.length).toBe(1);
  });

  it("ฐานข้อมูลกันซ้ำอีกชั้น (unique index) แม้เรียกตรง", () => {
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c1.id, "A-2"), actor);
    expect(() =>
      db.insert(schema.enrollments).values({ incarcerationId: r.incarcerationId!, cohortId: c1.id, courseId: b12, enrolledDate: "2026-10-01" }).run(),
    ).toThrow(/UNIQUE/);
  });

  it("เลขใหม่ของบุคคลเดิม (เลขบัตรเดียวกัน) → ต้องยืนยันคำเตือน + เป็นคนเดียวกัน", () => {
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const c2 = createCohort(db, { courseId: b12, startDate: "2027-01-04" }, 1);
    const nid = "1101700230708";
    const a = registerEnrollment(db, input(c1.id, "OLD-1", { person: { firstName: "ก", lastName: "ข", nationalId: nid } }), actor);
    expect(() => registerEnrollment(db, input(c2.id, "NEW-1", { person: { firstName: "ก", lastName: "ข", nationalId: nid } }), actor)).toThrow(/กลับมาต้องโทษซ้ำ/);
    const b = registerEnrollment(db, input(c2.id, "NEW-1", { person: { firstName: "ก", lastName: "ข", nationalId: nid }, acknowledgeWarnings: true }), actor);
    expect(b.personId).toBe(a.personId);
    expect(b.result.isReturnee).toBe(true);
  });

  it("กำลังอยู่หลักสูตรอื่น → เตือน ลงได้เมื่อยืนยัน", () => {
    const cf = createCohort(db, { courseId: fast, startDate: "2026-07-06" }, 1);
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    // ชุมชนบำบัด: ต้องผ่านเกณฑ์อายุ 18–60 ชั้นกลางขึ้นไป และติ๊กยืนยัน (สเปก 16)
    registerEnrollment(db, input(cf.id, "F-1", { person: { firstName: "ทดสอบ", lastName: "F-1", nationalId: null, birthDate: "1990-01-01" }, incarceration: { inmateNo: "F-1", prisonerClass: "good" }, intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] } }), actor);
    expect(() => registerEnrollment(db, input(c1.id, "F-1"), actor)).toThrow(/กำลังอยู่ในหลักสูตร/);
    expect(registerEnrollment(db, input(c1.id, "F-1", { acknowledgeWarnings: true }), actor).enrollment.status).toBe("active");
  });

  it("ไม่มีหลักฐานยินยอม → ยืนยันรับเข้าไม่ได้ แต่บันทึกร่างได้", () => {
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    expect(() => registerEnrollment(db, input(c1.id, "C-1", { consentSigned: false }), actor)).toThrow(/ยินยอม/);
    const r = registerEnrollment(db, input(c1.id, "C-1", { consentSigned: false, confirmAdmission: false }), actor);
    expect(r.enrollment.status).toBe("draft");
  });

  it("เลขบัตรผิด check digit → ไม่รับ", () => {
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    expect(() => registerEnrollment(db, input(c1.id, "N-1", { person: { firstName: "ก", lastName: "ข", nationalId: "1101700230705" } }), actor)).toThrow(/เลขบัตรประชาชนไม่ถูกต้อง/);
  });
});

describe("บันทึกออกจากเรือนจำ (8)", () => {
  it("ออกก่อนกำหนด + ตัดจากเช็คชื่อตั้งแต่วันที่ออก และยกเลิกแล้วย้อนกลับครบ", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "R-1"), actor);
    const sessions = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    const day1 = sessions.filter((s) => s.date === "2026-10-05" && s.takesAttendance);
    const day2 = sessions.filter((s) => s.date === "2026-10-06");
    for (const s of [...day1, ...day2]) saveAttendance(db, s.id, [{ enrollmentId: r.enrollment.id, status: "absent" }], { userId: 1, isAdmin: true });

    const res = recordReleases(db, { incarcerationIds: [r.incarcerationId!], releasedDate: "2026-10-06", reason: "parole" }, { userId: 1 });
    expect(res.summary[0].actions.join(" ")).toContain("ออกก่อนกำหนด");
    const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, r.enrollment.id)).get()!;
    expect(e.status).toBe("dropped");
    // วันที่ 1 ยังอยู่ วันที่ 2 (วันออก) ถูกตัด
    expect(db.select().from(schema.attendance).all().length).toBe(day1.length);
    expect(sessionRoster(db, day2[0].id).rows.length).toBe(0);
    expect(sessionRoster(db, day1[0].id).rows.length).toBe(1);
    expect(() => recordReleases(db, { incarcerationIds: [r.incarcerationId!], releasedDate: "2026-10-07", reason: "parole" }, { userId: 1 })).toThrow(/บันทึกออกจากเรือนจำไปแล้ว/);

    const ev = db.select().from(schema.releaseEvents).get()!;
    const undo = cancelRelease(db, ev.id, "บันทึกผิดคน", { userId: 1 });
    expect(undo.restoredAttendance).toBe(day2.length);
    expect(db.select().from(schema.enrollments).where(eq(schema.enrollments.id, r.enrollment.id)).get()!.status).toBe("active");
    expect(db.select().from(schema.attendance).all().length).toBe(day1.length + day2.length);
    expect(db.select().from(schema.incarcerations).get()!.releasedDate).toBeNull();
  });
});

describe("เช็คชื่อ (9)", () => {
  it("1 คาบ 1 คน 1 แถว แก้ไขแล้วบันทึกค่าเดิม→ค่าใหม่ และกันบันทึกทับ", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "T-1"), actor);
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).get()!;
    saveAttendance(db, s.id, [{ enrollmentId: r.enrollment.id, status: "present" }], { userId: 1, isAdmin: false }, 0);
    expect(() => saveAttendance(db, s.id, [{ enrollmentId: r.enrollment.id, status: "absent" }], { userId: 1, isAdmin: false }, 0)).toThrow(/บันทึกการเช็คชื่อคาบนี้แล้ว/);
    const u = saveAttendance(db, s.id, [{ enrollmentId: r.enrollment.id, status: "corrections", correctionsType: "court" }], { userId: 1, isAdmin: false });
    expect(u.updated).toBe(1);
    expect(db.select().from(schema.attendance).all().length).toBe(1);
    expect(() => saveAttendance(db, s.id, [{ enrollmentId: r.enrollment.id, status: "corrections" }], { userId: 1, isAdmin: false })).toThrow(/ประเภทเหตุราชทัณฑ์/);
  });
});

describe("นำเข้า Excel (7.3)", () => {
  it("แยกผลตรวจทุกแถว และนำเข้าเฉพาะแถวที่ผ่าน รวมรุ่นที่จบแล้วพร้อมสถานะ", async () => {
    const ExcelJS = (await import("exceljs")).default;
    const { parseWorkbook, checkRows, commitRows, IMPORT_COLUMNS } = await import("@/lib/services/import");
    const c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const old = createCohort(db, { courseId: b12, startDate: "2025-11-03" }, 1);
    registerEnrollment(db, input(c1.id, "DUP-1"), actor);
    registerEnrollment(db, input(c1.id, "SAME-0", { person: { firstName: "สมหมาย", lastName: "ซ้ำชื่อ", birthDate: "1990-01-01" } }), actor);

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("x");
    ws.addRow(IMPORT_COLUMNS.map((c) => c.header));
    const row = (o: Record<string, string>) => ws.addRow(IMPORT_COLUMNS.map((c) => o[c.key] ?? ""));
    row({ inmateNo: "NEW-1", firstName: "ก", lastName: "ข", status: "ครบหลักสูตร", leftDate: "21/11/2568" });
    row({ inmateNo: "DUP-1", firstName: "ทดสอบ", lastName: "ระบบ" });
    row({ inmateNo: "SAME-1", firstName: "สมหมาย", lastName: "ซ้ำชื่อ", birthDate: "1/1/2533" });
    row({ inmateNo: "BAD-1", firstName: "", lastName: "ข", nationalId: "123" });
    row({ inmateNo: "NEW-1", firstName: "ซ้ำ", lastName: "ในไฟล์" });
    const raw = await parseWorkbook(Buffer.from(await wb.xlsx.writeBuffer()));
    expect(raw.length).toBe(5);

    // DUP-1 อยู่รุ่น c1 แล้ว → นำเข้ารุ่นเก่า (หลักสูตรเดียวกัน) ต้องบล็อก
    const checked = checkRows(db, old.id, raw);
    expect(checked.map((r) => r.category)).toEqual(["ok", "blocked", "possible_same", "invalid", "invalid"]);
    const res = commitRows(db, old.id, checked, 1, "test.xlsx");
    expect(res.imported).toBe(1);
    const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, old.id)).all();
    expect(e[0].status).toBe("completed");
    expect(e[0].leftDate).toBe("2025-11-21");
  });
});

describe("ขั้น 2: บสต./ติดตาม/แบบประเมิน", () => {
  it("ยืนยันรับเข้า → สร้างงาน บสต. ลงทะเบียน/คัดกรอง/บำบัด เท่านั้น (รท.101 ยังไม่เกิด)", async () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "B-1"), actor);
    const tasks = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, r.enrollment.id)).all();
    expect(tasks.map((t) => `${t.system}:${t.step}`).sort()).toEqual(["bst:register", "bst:screen", "bst:treat"]);
    expect(tasks.find((t) => t.step === "treat")!.dueDate).toBe("2026-10-28");
  });

  it("ครบหลักสูตร → บสต. จำหน่าย (นับจากวันจบ) + ติดตาม 1/3/6/12 + รท.101 1 งาน; ไม่ผ่าน → ไม่มี รท.101", async () => {
    const { completeEnrollments } = await import("@/lib/services/followup");
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const ok = registerEnrollment(db, input(c.id, "F-1"), actor);
    const fail = registerEnrollment(db, input(c.id, "F-2"), actor);
    completeEnrollments(db, [ok.enrollment.id], "completed", "2026-10-21", { userId: 1 });
    completeEnrollments(db, [fail.enrollment.id], "failed", "2026-10-21", { userId: 1 });
    const tasks = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, ok.enrollment.id)).all();
    expect(tasks.filter((t) => t.system === "rt101").map((t) => t.step)).toEqual(["record"]);
    expect(tasks.find((t) => t.system === "rt101")!.dueDate).toBe("2026-10-28");
    expect(tasks.find((t) => t.step === "discharge")!.dueDate).toBe("2026-10-28");
    expect(tasks.filter((t) => t.step.startsWith("followup")).every((t) => t.system === "bst")).toBe(true);
    const fus = db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, ok.enrollment.id)).all();
    expect(fus.map((f) => f.dueDate)).toEqual(["2026-11-21", "2027-01-21", "2027-04-21", "2027-10-21"]);
    expect(db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, fail.enrollment.id)).all().some((t) => t.system === "rt101")).toBe(false);
  });

  it("กด \"ลง บสต. แล้ว\" ที่ขั้นจำหน่าย → นับกำหนดติดตามใหม่จากวันจำหน่ายจริง / ยกเลิก → กลับไปนับจากวันจบ", async () => {
    const { completeEnrollments, markTask } = await import("@/lib/services/followup");
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "D-1"), actor);
    completeEnrollments(db, [r.enrollment.id], "completed", "2026-10-21", { userId: 1 });
    const dis = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.step, "discharge")).get()!;
    markTask(db, dis.id, "2026-11-02", { userId: 1 });
    const fus = () => db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, r.enrollment.id)).all().map((f) => f.dueDate);
    expect(fus()).toEqual(["2026-12-02", "2027-02-02", "2027-05-02", "2027-11-02"]);
    expect(db.select().from(schema.bstTasks).where(eq(schema.bstTasks.step, "followup1")).get()!.dueDate).toBe("2026-12-09");
    markTask(db, dis.id, null, { userId: 1 });
    expect(fus()[0]).toBe("2026-11-21");
  });

  it("หลักสูตร 3 วัน: ต้องลง รท.101 (ไม่ลง บสต. ไม่ติดตาม)", async () => {
    const { completeEnrollments } = await import("@/lib/services/followup");
    const pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!;
    expect(pre3.requiresRt101).toBe(true);
    db.update(schema.courses).set({ enabled: true }).where(eq(schema.courses.id, pre3.id)).run();
    const c = createCohort(db, { courseId: pre3.id, startDate: "2026-10-05" }, 1);
    // สเปก 17: 3 วันบังคับเลขบัตร + ยืนยันเกณฑ์โทษ
    const r = registerEnrollment(db, input(c.id, "P-1", { person: { firstName: "ทดสอบ", lastName: "สามวัน", nationalId: "1100000000016" }, intake: { exclusions: [], confirmations: ["sentence_remaining"] } }), actor);
    expect(db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, r.enrollment.id)).all()).toEqual([]);
    completeEnrollments(db, [r.enrollment.id], "completed", "2026-10-07", { userId: 1 });
    expect(db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, r.enrollment.id)).all().map((t) => `${t.system}:${t.step}`)).toEqual(["rt101:record"]);
    expect(db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, r.enrollment.id)).all()).toEqual([]);
  });

  it("พ้นโทษระหว่างติดตาม → ปิดการติดตาม · งานจำหน่ายคงไว้ · งาน รท.101 ยังคงอยู่ · ยกเลิกแล้วย้อนครบ", async () => {
    const { completeEnrollments } = await import("@/lib/services/followup");
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "F-9"), actor);
    completeEnrollments(db, [r.enrollment.id], "completed", "2026-10-21", { userId: 1 });
    recordReleases(db, { incarcerationIds: [r.incarcerationId!], releasedDate: "2026-12-01", reason: "completed_sentence" }, { userId: 1 });
    const after = db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, r.enrollment.id)).all();
    expect(after.every((f) => f.status === "closed")).toBe(true);
    expect(after[0].reason).toBe("ปิดการติดตาม – พ้นโทษ");
    const tasks = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, r.enrollment.id)).all();
    expect(tasks.find((t) => t.step === "discharge")).toMatchObject({ status: "pending", dueDate: "2026-10-28" });
    expect(tasks.find((t) => t.system === "rt101")).toMatchObject({ status: "pending", step: "record" });
    expect(tasks.filter((t) => t.step.startsWith("followup")).every((t) => t.status === "closed")).toBe(true);

    const ev = db.select().from(schema.releaseEvents).get()!;
    cancelRelease(db, ev.id, "บันทึกผิด", { userId: 1 });
    expect(db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, r.enrollment.id)).all().every((f) => f.status === "pending")).toBe(true);
    expect(db.select().from(schema.bstTasks).where(eq(schema.bstTasks.step, "discharge")).get()!.dueDate).toBe("2026-10-28");
  });

  it("ออกระหว่างอบรม → งาน บสต. ที่เหลือ = ติดตามไม่ได้ + สร้างงานจำหน่าย · ไม่มีงาน รท.101 (ไม่จบหลักสูตร)", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "U-1"), actor);
    recordReleases(db, { incarcerationIds: [r.incarcerationId!], releasedDate: "2026-10-08", reason: "transfer" }, { userId: 1 });
    const tasks = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, r.enrollment.id)).all();
    expect(tasks.filter((t) => t.step !== "discharge").every((t) => t.status === "unfollowable" && t.reason === "ติดตามไม่ได้ – ย้ายเรือนจำ")).toBe(true);
    expect(tasks.find((t) => t.step === "discharge")).toMatchObject({ system: "bst", status: "pending", dueDate: "2026-10-15" });
    expect(tasks.some((t) => t.system === "rt101")).toBe(false);
  });

  it("ตัวชี้วัด: % ลงทะเบียน บสต. ครบ, % ติดตามครบ 4 ครั้ง, % ลง รท.101 ครบ", async () => {
    const { bstIndicators, rt101Indicators } = await import("@/lib/queries/bst");
    const T = (o: object) => ({ id: 0, enrollmentId: 1, system: "bst", step: "register", dueDate: "2026-01-01", status: "pending", doneDate: null, doneBy: null, reason: null, note: null, ...o }) as never;
    const F = (o: object) => ({ id: 0, enrollmentId: 1, seq: 1, dueDate: "2026-01-01", status: "done", relapse: "no", ...o }) as never;
    const ind = bstIndicators(
      [T({ enrollmentId: 1, status: "done" }), T({ enrollmentId: 2 }), T({ enrollmentId: 3, status: "unfollowable", reason: "ติดตามไม่ได้ – ย้ายเรือนจำ" }), T({ enrollmentId: 4, dueDate: "2099-01-01" })],
      [
        ...[1, 2, 3, 4].map((seq) => F({ enrollmentId: 1, seq })),
        ...[1, 2, 3, 4].map((seq) => F({ enrollmentId: 2, seq, status: seq === 4 ? "pending" : "done" })),
        ...[1, 2, 3, 4].map((seq) => F({ enrollmentId: 3, seq, status: seq > 1 ? "closed" : "done" })),
        ...[1, 2, 3, 4].map((seq) => F({ enrollmentId: 4, seq, dueDate: seq === 4 ? "2099-01-01" : "2026-01-01" })),
      ],
      "2026-10-04",
    );
    expect(ind.register).toEqual({ done: 1, due: 2, pct: 50 });
    expect(ind.followup4).toMatchObject({ complete: 1, eligible: 2, excluded: 1, pct: 50 });
    expect(ind.excludedReasons).toEqual([{ reason: "ติดตามไม่ได้ – ย้ายเรือนจำ", n: 1 }]);
    const rt = rt101Indicators([T({ system: "rt101", step: "record", status: "done" }), T({ system: "rt101", step: "record" }), T({ system: "rt101", step: "record", status: "cancelled" })]);
    expect(rt).toEqual({ completed: 2, done: 1, pending: 1, pct: 50 });
  });
  it("บันทึกแบบประเมิน: เกณฑ์ตามเวอร์ชัน สิทธิ์ตามหมวด และแจ้งเตือนเฉพาะบทบาทสุขภาพ", async () => {
    const { saveAssessment, getForm } = await import("@/lib/services/assessments");
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "A-9"), actor);
    const dep = getForm(db, "DEP")!;
    const rehabOnly = (p: string) => ["assessment.edit", "assessment.view"].includes(p);
    expect(() => saveAssessment(db, { enrollmentId: r.enrollment.id, formId: dep.id, round: "pre", assessedDate: "2026-10-02", answers: { q2: [false, false] } }, { userId: 1, can: rehabOnly as never })).toThrow(/ไม่มีสิทธิ์/);
    const nurse = (p: string) => ["health.view", "health.edit", "health.mental_edit"].includes(p);
    const res = saveAssessment(db, {
      enrollmentId: r.enrollment.id, formId: dep.id, round: "pre", assessedDate: "2026-10-02",
      answers: { q2: [true, true], q9: [3, 3, 3, 0, 0, 0, 0, 0, 0], q8: [true, true, true, true, false, false, false, false], q8control: true },
    }, { userId: 1, can: nurse as never });
    expect(res.result.details.q8).toBe(17);
    const notes = db.select().from(schema.notifications).where(eq(schema.notifications.kind, "assessment_DEP")).all();
    expect(notes.length).toBeGreaterThan(0);
    expect(notes.every((n) => ["medical", "mental_health", "admin"].includes(n.role!))).toBe(true);
    expect(notes.some((n) => n.severity === "danger")).toBe(true);
  });

  it("สภาวะกาย/จิต \"ยังเข้าร่วมไม่ได้\" → ยืนยันรับเข้าไม่ได้ ยกเว้นผู้ดูแล", async () => {
    const { saveAssessment, getForm } = await import("@/lib/services/assessments");
    const { confirmAdmissions } = await import("@/lib/services/registry");
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const r = registerEnrollment(db, input(c.id, "C-9", { confirmAdmission: false }), actor);
    const cond = getForm(db, "COND")!;
    saveAssessment(db, { enrollmentId: r.enrollment.id, formId: cond.id, round: "pre", assessedDate: "2026-10-02", answers: { opinion: "unfit", unfitReasons: ["physical"] } }, { userId: 1, can: (() => true) as never });
    expect(confirmAdmissions(db, [r.enrollment.id], actor).skipped[0].reason).toContain("ยังเข้าร่วมไม่ได้");
    expect(confirmAdmissions(db, [r.enrollment.id], admin).done).toEqual([r.enrollment.id]);
  });
});

describe("ประวัติการใช้งาน", () => {
  it("แก้ไข/ลบ audit log ไม่ได้แม้เข้าฐานข้อมูลตรง", () => {
    db.insert(schema.auditLogs).values({ at: new Date(), action: "test" }).run();
    expect(() => db.update(schema.auditLogs).set({ action: "x" }).run()).toThrow(/เพิ่มได้อย่างเดียว/);
    expect(() => db.delete(schema.auditLogs).run()).toThrow(/เพิ่มได้อย่างเดียว/);
  });
});
