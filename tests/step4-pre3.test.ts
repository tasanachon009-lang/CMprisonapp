import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment, confirmAdmissions, intakeGaps, type RegisterInput } from "@/lib/services/registry";
import { pre3Candidates, estimatedRelease } from "@/lib/queries/pre3-candidates";
import { speakerShortfall } from "@/lib/speaker-ratio";
import { setProjectStep, projectStepsView, PROJECT_STEPS } from "@/lib/services/project-steps";

let db: DB;
let b12: number, pre3: number;
const actor = { userId: 1, canOverride: false, consentRequired: false };

/** เลขบัตรปลอมที่ผ่านหลักตรวจ */
function nid(seed: number) {
  const d = String(110000000000 + seed).split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i);
  return d.join("") + String((11 - (sum % 11)) % 10);
}

function input(cohortId: number, inmateNo: string, extra: Partial<RegisterInput> = {}): RegisterInput {
  return {
    cohortId, person: { firstName: "ทดสอบ", lastName: inmateNo, nationalId: null }, incarceration: { inmateNo },
    confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true, ...extra,
  };
}

beforeEach(() => {
  db = drizzle(openDatabase(":memory:"), { schema }) as DB;
  runMigrations(db);
  bootstrapReferenceData(db);
  db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
  b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
  pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!.id;
});

describe("หลักสูตร 3 วัน: ตั้งค่าและแม่แบบ (สเปก 17)", () => {
  it("เปิดใช้ มีเกณฑ์ และสร้างรุ่นได้ 13 คาบ 15 ชั่วโมง · คาบที่แบ่ง (1)/(2) ผูกหัวข้อเดียวกัน", () => {
    const course = db.select().from(schema.courses).where(eq(schema.courses.id, pre3)).get()!;
    expect(course.enabled).toBe(true);
    expect((course.intakeCriteria as { requireNationalId: boolean }).requireNationalId).toBe(true);
    const c = createCohort(db, { courseId: pre3, startDate: "2026-11-02" }, 1);
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    expect(s.length).toBe(13);
    expect(s.reduce((a, x) => a + x.hours, 0)).toBe(15);
    expect(new Set(s.map((x) => x.date)).size).toBe(3);
    const split = s.filter((x) => /\(\d\)$/.test(x.title));
    if (split.length) {
      expect(split.every((x) => x.topicId != null)).toBe(true);
      expect(new Set(split.map((x) => x.topicId)).size).toBe(1);
    }
  });

  it("อัปเกรดฐานข้อมูลเก่า (ก่อนขั้น 4): เปิดหลักสูตร + ใส่เกณฑ์และแม่แบบครั้งเดียว ไม่ทับค่าที่ตั้งไว้", () => {
    db.update(schema.courses).set({ enabled: false, intakeCriteria: null }).where(eq(schema.courses.id, pre3)).run();
    db.delete(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, pre3)).run();
    db.delete(schema.settings).where(eq(schema.settings.key, "bootstrap.step4")).run();
    bootstrapReferenceData(db);
    const c = db.select().from(schema.courses).where(eq(schema.courses.id, pre3)).get()!;
    expect(c.enabled).toBe(true);
    expect(c.intakeCriteria).not.toBeNull();
    expect(db.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, pre3)).all().length).toBe(13);
    // รันซ้ำ: ไม่เปิดใหม่ถ้าผู้ดูแลปิดไว้เอง และไม่เพิ่มแม่แบบซ้ำ
    db.update(schema.courses).set({ enabled: false }).where(eq(schema.courses.id, pre3)).run();
    bootstrapReferenceData(db);
    expect(db.select().from(schema.courses).where(eq(schema.courses.id, pre3)).get()!.enabled).toBe(false);
    expect(db.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, pre3)).all().length).toBe(13);
  });
});

describe("เกณฑ์คัดเลือก 3 วัน บังคับที่เซิร์ฟเวอร์", () => {
  it("ยืนยันรับเข้าไม่ได้ถ้าไม่มีเลขบัตร หรือยังไม่ยืนยันเกณฑ์โทษ · บันทึกเป็นร่างได้", () => {
    const c = createCohort(db, { courseId: pre3, startDate: "2026-11-02" }, 1);
    expect(() => registerEnrollment(db, input(c.id, "P-1", { intake: { exclusions: [], confirmations: ["sentence_remaining"] } }), actor)).toThrow(/เลขบัตร/);
    expect(() => registerEnrollment(db, input(c.id, "P-2", { person: { firstName: "ก", lastName: "ข", nationalId: nid(2) }, intake: { exclusions: [] } }), actor)).toThrow(/ยืนยัน/);
    const ok = registerEnrollment(db, input(c.id, "P-3", { person: { firstName: "ค", lastName: "ง", nationalId: nid(3) }, intake: { exclusions: [], confirmations: ["sentence_remaining"] } }), actor);
    expect(ok.enrollment.status).toBe("active");
    const draft = registerEnrollment(db, input(c.id, "P-4", { confirmAdmission: false, intake: { exclusions: [] } }), actor);
    expect(draft.enrollment.status).toBe("draft");
    expect(intakeGaps(db, draft.enrollment)).toEqual(["ยังไม่มีเลขบัตรประชาชน", expect.stringMatching(/^ยังไม่ได้ยืนยัน/)]);
    const r = confirmAdmissions(db, [draft.enrollment.id], actor);
    expect(r.done).toEqual([]);
    expect(r.skipped[0].reason).toMatch(/เลขบัตร/);
  });

  it("หลักสูตร 12 วันไม่ถูกบังคับเกณฑ์นี้", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-11-02" }, 1);
    const r = registerEnrollment(db, input(c.id, "B-1"), actor);
    expect(r.enrollment.status).toBe("active");
  });
});

describe("รายชื่อแนะนำ 3 วัน", () => {
  it("ผ่าน 12 วันแล้ว ยังไม่ออก ยังไม่เคยเข้า 3 วัน · เรียงวันพ้นโทษใกล้สุดก่อน", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-06-01" }, 1);
    const mk = (no: string, admitted: string, years: number) =>
      registerEnrollment(db, input(c.id, no, { incarceration: { inmateNo: no, admittedDate: admitted, sentenceYears: years, sentenceMonths: 0, sentenceDays: 0 } }), actor);
    const far = mk("C-1", "2025-01-01", 5);
    const near = mk("C-2", "2025-01-01", 2);
    const released = mk("C-3", "2025-01-01", 2);
    const already = mk("C-4", "2025-01-01", 2);
    const notDone = mk("C-5", "2025-01-01", 2);
    for (const e of [far, near, released, already]) db.update(schema.enrollments).set({ status: "completed" }).where(eq(schema.enrollments.id, e.enrollment.id)).run();
    void notDone;
    db.update(schema.incarcerations).set({ releasedDate: "2026-09-01" }).where(eq(schema.incarcerations.id, released.incarcerationId!)).run();
    const p3 = createCohort(db, { courseId: pre3, startDate: "2026-11-02" }, 1);
    registerEnrollment(db, input(p3.id, "C-4", { personId: already.personId, confirmAdmission: false }), actor);
    const list = pre3Candidates(db, "2026-10-06");
    expect(list.map((x) => x.inmateNo)).toEqual(["C-2", "C-1"]);
    expect(list[0].release).toBe("2027-01-01");
    expect(list[0].monthsLeft).toBeGreaterThan(2);
    expect(list[0].monthsLeft).toBeLessThan(3.1);
    // ถอนตัวจาก 3 วัน → กลับมาอยู่ในรายชื่อ
    db.update(schema.enrollments).set({ status: "withdrawn" }).where(eq(schema.enrollments.cohortId, p3.id)).run();
    expect(pre3Candidates(db, "2026-10-06").map((x) => x.inmateNo)).toContain("C-4");
  });

  it("วันพ้นโทษโดยประมาณ = วันรับตัว + โทษ", () => {
    expect(estimatedRelease("2025-03-15", 1, 6, 10)).toBe("2026-09-25");
    expect(estimatedRelease("2025-03-15", null, null, null)).toBeNull();
    expect(estimatedRelease(null, 1, 0, 0)).toBeNull();
  });
});

describe("สัดส่วนวิทยากร 1:50", () => {
  it("เตือนเมื่อวิทยากรไม่พอ", () => {
    expect(speakerShortfall(50, 1, 50)).toBeNull();
    expect(speakerShortfall(51, 1, 50)).toEqual({ need: 2, have: 1 });
    expect(speakerShortfall(120, 2, 50)).toEqual({ need: 3, have: 2 });
    expect(speakerShortfall(0, 0, 50)).toBeNull();
    expect(speakerShortfall(80, 0, null)).toBeNull();
  });
});

describe("ขั้นตอนโครงการ 7 ขั้น", () => {
  it("ติ๊ก/ยกเลิกได้ · บอกขั้นต่อไป · บันทึกประวัติ · กันรหัส/วันที่ผิด", () => {
    const c = createCohort(db, { courseId: pre3, startDate: "2026-11-02" }, 1);
    expect(PROJECT_STEPS.length).toBe(7);
    setProjectStep(db, c.id, "select", { done: true, date: "2026-10-01" }, { userId: 1 });
    setProjectStep(db, c.id, "project_approval", { done: true }, { userId: 1 });
    let row = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, c.id)).get()!;
    let v = projectStepsView(row.projectSteps);
    expect(v.doneCount).toBe(2);
    expect(v.next?.code).toBe("run_approval");
    setProjectStep(db, c.id, "select", { done: false }, { userId: 1 });
    row = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, c.id)).get()!;
    v = projectStepsView(row.projectSteps);
    expect(v.doneCount).toBe(1);
    expect(v.next?.code).toBe("select");
    expect(() => setProjectStep(db, c.id, "hack", { done: true }, { userId: 1 })).toThrow(/ไม่พบขั้นตอน/);
    expect(() => setProjectStep(db, c.id, "run", { done: true, date: "2026-13-40" }, { userId: 1 })).toThrow(/วันที่/);
    expect(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "cohort")).all().length).toBeGreaterThanOrEqual(3);
  });
});
