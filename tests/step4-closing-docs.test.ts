import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { completeEnrollments, markTask } from "@/lib/services/followup";
import { addStaff } from "@/lib/services/schedule";
import { saveSessionReport } from "@/lib/services/session-close";
import { createBatch, approveBatch } from "@/lib/services/pay";
import { cohortVariables, createDocument } from "@/lib/services/documents";
import { courseReport } from "@/lib/services/course-report";
import { DOC_TEMPLATES } from "@/lib/docs/templates";

/** เลขบัตรปลอมที่ผ่านหลักตรวจ */
function nid(seed: number) {
  const d = String(110000000000 + seed).split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i);
  return d.join("") + String((11 - (sum % 11)) % 10);
}

describe("ขั้น 4: เอกสารหลังจบรุ่น (สเปก 18.4)", () => {
  let db: DB;
  let head: number, nurse: number, cohortId: number;
  const user = (firstName: string, roles: string[]) => {
    const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    for (const r of roles) db.insert(schema.userRoles).values({ userId: id, role: r }).run();
    return id;
  };
  const enroll = (no: string, gender: "male" | "female", seed: number) =>
    registerEnrollment(db, {
      cohortId, person: { firstName: "ชื่อลับ", lastName: no, nationalId: nid(seed), gender }, incarceration: { inmateNo: no },
      intake: { exclusions: [], confirmations: ["sentence_remaining"] }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-07", acknowledgeWarnings: true,
    }, { userId: head, canOverride: false, consentRequired: false }).enrollment.id;

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = user("หัวหน้า", ["admin", "rehab"]);
    nurse = user("พยาบาล", ["rehab"]);
    bootstrapReferenceData(db);
    const pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!;
    cohortId = createCohort(db, { courseId: pre3.id, startDate: "2026-09-07", targetCount: 50, location: "หอประชุม" }, head).id;
    setSetting(db, "org.headName", "นายผู้บัญชาการ สมมติ", head);
    setSetting(db, "org.headTitle", "ผู้บัญชาการเรือนจำทดสอบ", head);
  });

  it("แม่แบบใหม่ 3 ฉบับ: หนังสือนำส่งรายงาน 2 แบบ และบันทึกขอเบิกค่าตอบแทน", () => {
    const codes = DOC_TEMPLATES.map((t) => t.code);
    expect(codes).toEqual(expect.arrayContaining(["letter_submit_report_central", "letter_submit_report_provincial", "memo_pay_request"]));
    const a = enroll("69-10001", "male", 1), b = enroll("69-10002", "female", 2);
    completeEnrollments(db, [a], "completed", "2026-09-09", { userId: head });
    void b;
    const central = createDocument(db, cohortId, "letter_submit_report_central", { userId: head });
    expect([central.kind, central.toLine, central.signerName]).toEqual(["letter", "อธิบดีกรมราชทัณฑ์", "นายผู้บัญชาการ สมมติ"]);
    expect(central.body).toContain("จำนวน 2 คน ผ่านการอบรม จำนวน 1 คน");
    expect(central.body).not.toMatch(/\{\{/);
    // เรือนจำจังหวัด/อำเภอ: ออกในนามจังหวัด → เว้นผู้ลงนามไว้ให้เติม
    const prov = createDocument(db, cohortId, "letter_submit_report_provincial", { userId: head });
    expect([prov.signerName, prov.signerTitle]).toEqual([null, null]);
    expect(prov.body).toContain("จังหวัด…………");
    // ยังไม่มีรอบเบิกที่อนุมัติ → เว้นยอดเป็น …………
    const memo = createDocument(db, cohortId, "memo_pay_request", { userId: head });
    expect([memo.kind, memo.toLine]).toEqual(["memo", "ผู้บัญชาการเรือนจำทดสอบ"]);
    expect(memo.body).toContain("เป็นเงินทั้งสิ้น ………… บาท");
  });

  it("บันทึกขอเบิก: ยอดและจำนวนวิทยากรมาจากรอบเบิกที่อนุมัติแล้วเท่านั้น", () => {
    const ext = db.insert(schema.instructors).values({ kind: "external", externalType: "gov", firstName: "วิทยากร", lastName: "ราชการ", organization: "โรงพยาบาลสมมติ" }).returning().get().id;
    db.update(schema.cohortSessions).set({ takesAttendance: false }).where(eq(schema.cohortSessions.cohortId, cohortId)).run();
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all().find((x) => x.topicId != null && x.hours >= 1)!;
    addStaff(db, s.id, { instructorId: ext }, { userId: head });
    saveSessionReport(db, s.id, { outcome: "planned" }, { userId: nurse, isAdmin: true });
    const batch = createBatch(db, { cohortId }, { userId: nurse });
    expect(cohortVariables(db, cohortId)["ค่าตอบแทนวิทยากร"]).toBe(""); // ร่าง ยังไม่นับ
    approveBatch(db, batch.id, { userId: head });
    const vars = cohortVariables(db, cohortId);
    const total = db.select().from(schema.payLines).where(eq(schema.payLines.batchId, batch.id)).all().reduce((t, l) => t + l.amountSatang, 0);
    expect(total).toBeGreaterThan(0);
    expect(vars["ค่าตอบแทนวิทยากร"]).toBe((total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
    expect(vars["ค่าตอบแทนวิทยากรตัวอักษร"]).toMatch(/บาท/);
    expect(vars["จำนวนวิทยากรที่เบิก"]).toBe("1");
    // แบบรายงาน: วิทยากรภายนอกพร้อมหน่วยงาน และคาบที่ดำเนินการแล้ว
    const r = courseReport(db, cohortId)!;
    expect(r.activity.external).toEqual([{ name: "วิทยากร ราชการ", organization: "โรงพยาบาลสมมติ" }]);
    expect(r.activity.done).toBe(1);
    expect(r.activity.hoursTarget).toBe(15);
  });

  it("แบบรายงานผล: แยกชาย/หญิง · เข้า = ครบ + ไม่ครบ + คงเหลือ · รท.101 เป้า/จริง · ไม่ลง บสต. · ไม่มีชื่อผู้ต้องขัง", () => {
    const a = enroll("69-10001", "male", 1), b = enroll("69-10002", "female", 2), c = enroll("69-10003", "male", 3), d = enroll("69-10004", "male", 4);
    completeEnrollments(db, [a, b], "completed", "2026-09-09", { userId: head });
    completeEnrollments(db, [c], "failed", "2026-09-09", { userId: head });
    void d; // ยังกำลังอบรม
    // ร่าง (ยังไม่ยืนยันรับเข้า) ไม่นับในตาราง
    registerEnrollment(db, { cohortId, person: { firstName: "ร่าง", lastName: "รอ", nationalId: null }, incarceration: { inmateNo: "69-10009" }, confirmAdmission: false, consentSigned: false, enrolledDate: "2026-09-07", acknowledgeWarnings: true }, { userId: head, canOverride: false, consentRequired: false });
    const rt = db.select().from(schema.bstTasks).where(eq(schema.bstTasks.system, "rt101")).all();
    expect(rt.length).toBe(2);
    markTask(db, rt[0].id, "2026-09-10", { userId: head });

    const r = courseReport(db, cohortId)!;
    expect(r.people.target).toBe(50);
    expect([r.people.entered, r.people.completed, r.people.notCompleted, r.people.remaining]).toEqual([
      { male: 3, female: 1, total: 4 }, { male: 1, female: 1, total: 2 }, { male: 1, female: 0, total: 1 }, { male: 1, female: 0, total: 1 },
    ]);
    expect(r.people.reasons).toEqual([{ label: "ไม่ผ่านเกณฑ์", n: 1 }]);
    expect(r.people.draft).toBe(1);
    expect(r.consistent).toBe(true);
    expect(r.records.bst).toBeNull(); // 3 วันไม่ลง บสต.
    expect(r.records.rt101).toEqual({ target: 2, done: 1 });
    expect(r.referral).toEqual({ total: 3, recorded: 0, needs: 0, pending: 3 }); // นับผู้กำลังอบรม+ครบหลักสูตร
    expect(r.assessments.map((x) => x.code)).toContain("ROSE3");
    const text = JSON.stringify(r, (k, v) => (k === "cohort" || k === "course" ? undefined : v));
    for (const w of ["ชื่อลับ", "69-10001", nid(1)]) expect(text).not.toContain(w);
  });
});
