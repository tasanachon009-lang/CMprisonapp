import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { completeEnrollments } from "@/lib/services/followup";
import { assign, assignmentHistory, houseChart, houseMembers, houseSummary, saveTeamReview, teamReviews, teamsWithoutReview, tcLookups } from "@/lib/services/tc-house";
import { monthHelper, helperSummary } from "@/lib/services/member-book";

describe("โครงสร้างบ้านของชุมชนบำบัด (สเปก 16)", () => {
  let db: DB;
  let cohortId: number, ids: number[], b12Enr: number, staff: number, staff2: number, helper: number;
  const actor = { userId: 1, canOverride: false, consentRequired: false };
  const who = { userId: 1 };
  const user = (firstName: string, roles: string[]) => {
    const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    for (const r of roles) db.insert(schema.userRoles).values({ userId: id, role: r }).run();
    return id;
  };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    staff = user("ที่ปรึกษาหนึ่ง", ["rehab"]);
    staff2 = user("ที่ปรึกษาสอง", ["rehab"]);
    helper = user("ผู้ช่วย", ["assistant"]);
    bootstrapReferenceData(db);
    const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    cohortId = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1).id;
    ids = Array.from({ length: 12 }, (_, i) => registerEnrollment(db, {
      cohortId, person: { firstName: "สมาชิก", lastName: `F-${i + 1}`, nationalId: null, birthDate: "1990-03-15" }, incarceration: { inmateNo: `F-${i + 1}`, prisonerClass: "good" },
      intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] }, confirmAdmission: true, consentSigned: true, consentDate: "2026-07-01", enrolledDate: "2026-07-06", acknowledgeWarnings: true,
    }, actor).enrollment.id);
    const c12 = createCohort(db, { courseId: b12.id, startDate: "2026-09-01" }, 1);
    b12Enr = registerEnrollment(db, { cohortId: c12.id, person: { firstName: "สิบสอง", lastName: "วัน", nationalId: null }, incarceration: { inmateNo: "B-1" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01", acknowledgeWarnings: true }, actor).enrollment.id;
  });

  it("ตำแหน่งเรียงสูงไปต่ำ: C.O.D → Chief Expeditor → Expeditor → Work Leader → Resident → Newcomer · ทีมงานเริ่มต้น 3 ทีม", () => {
    expect(tcLookups(db, "tc_position").map((p) => p.code)).toEqual(["cod", "chief_expeditor", "expeditor", "work_leader", "resident", "newcomer"]);
    expect(tcLookups(db, "tc_team").map((t) => t.label)).toEqual(["ประชาสัมพันธ์", "ครัวและความสะอาด", "ตกแต่งและเกษตรกรรม"]);
  });

  it("สมาชิกใหม่ = Newcomer · เปลี่ยนตำแหน่งต้องมีเหตุผล · ระบบตัดสินเลื่อน/ลด และเก็บประวัติพร้อมวันเริ่ม–สิ้นสุด", () => {
    expect(houseMembers(db, cohortId, "2026-07-10").every((m) => m.position === "newcomer" && m.positionSince === "2026-07-06")).toBe(true);
    expect(() => assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2026-07-20" }, who)).toThrow(/เหตุผล/);
    expect(() => assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "king", date: "2026-07-20", reason: "ทดสอบ" }, who)).toThrow(/ไม่พบตำแหน่ง/);
    expect(() => assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2099-01-01", reason: "ทดสอบ" }, who)).toThrow(/อนาคต/);
    expect(assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2026-07-20", reason: "ผ่านระยะแรกรับ" }, who).done).toEqual([ids[0]]);
    assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "work_leader", date: "2026-08-10", reason: "รับผิดชอบดี" }, who);
    assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2026-09-01", reason: "ละเมิดกฎบ้าน" }, who);
    const h = assignmentHistory(db, ids[0]).filter((x) => x.kind === "position").reverse();
    expect(h.map((x) => [x.value, x.startDate, x.endDate, x.changeType, x.reason])).toEqual([
      ["resident", "2026-07-20", "2026-08-09", "promote", "ผ่านระยะแรกรับ"],
      ["work_leader", "2026-08-10", "2026-08-31", "promote", "รับผิดชอบดี"],
      ["resident", "2026-09-01", null, "demote", "ละเมิดกฎบ้าน"],
    ]);
    // ตำแหน่งเดิม / วันที่ย้อนก่อนรายการปัจจุบัน / ก่อนเข้าโปรแกรม
    expect(assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2026-09-05", reason: "ซ้ำ" }, who).errors[0].error).toMatch(/เดิมอยู่แล้ว/);
    expect(assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "cod", date: "2026-08-15", reason: "ย้อน" }, who).errors[0].error).toMatch(/หลังวันเริ่มของรายการปัจจุบัน/);
    expect(assign(db, { enrollmentIds: [ids[1]], kind: "position", value: "resident", date: "2026-07-01", reason: "ก่อนเข้า" }, who).errors[0].error).toMatch(/ก่อนวันเข้าโปรแกรม/);
    expect(houseMembers(db, cohortId, "2026-09-10").find((m) => m.enrollmentId === ids[0])).toMatchObject({ position: "resident", positionSince: "2026-09-01" });
    expect(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "tc_assignment")).all().length).toBe(3);
  });

  it("ทีมงาน: กำหนดหลายคนพร้อมกัน · หมุนทีมเก็บประวัติ · เตือนอยู่ทีมเดิมเกิน 2 เดือน", () => {
    const r = assign(db, { enrollmentIds: ids.slice(0, 4), kind: "team", value: "kitchen", date: "2026-07-07" }, who);
    expect(r.done.length).toBe(4);
    expect(houseMembers(db, cohortId, "2026-09-06").find((m) => m.enrollmentId === ids[0])).toMatchObject({ team: "kitchen", teamSince: "2026-07-07", teamDays: 61 });
    expect(houseChart(db, cohortId, "2026-09-06").warnings.join(" ")).not.toMatch(/เกิน 2 เดือน/);
    expect(houseChart(db, cohortId, "2026-09-07").warnings.join(" ")).toMatch(/อยู่ทีมงานเดิมเกิน 2 เดือน 4 คน/);
    assign(db, { enrollmentIds: ids.slice(0, 4), kind: "team", value: "garden", date: "2026-09-07" }, who);
    expect(houseChart(db, cohortId, "2026-09-08").warnings.join(" ")).not.toMatch(/เกิน 2 เดือน/);
    expect(assignmentHistory(db, ids[0]).filter((x) => x.kind === "team").map((x) => [x.value, x.changeType, x.endDate])).toEqual([["garden", "rotate", null], ["kitchen", "assign", "2026-09-06"]]);
    expect(() => assign(db, { enrollmentIds: [ids[0]], kind: "team", value: "nope", date: "2026-09-10" }, who)).toThrow(/ไม่พบทีมงาน/);
  });

  it("ที่ปรึกษาต้องเป็นเจ้าหน้าที่หลัก · พี่เลี้ยงเป็นชื่อ · เตือนอัตราส่วน 1:15 และ 1:10 · เตือนผู้ที่ยังไม่กำหนด", () => {
    expect(() => assign(db, { enrollmentIds: ids, kind: "counselor", value: String(helper), date: "2026-07-07" }, who)).toThrow(/เจ้าหน้าที่หลัก/);
    expect(() => assign(db, { enrollmentIds: ids, kind: "counselor", value: "9999", date: "2026-07-07" }, who)).toThrow(/เจ้าหน้าที่หลัก/);
    expect(() => assign(db, { enrollmentIds: ids, kind: "mentor", value: "ก", date: "2026-07-07" }, who)).toThrow(/ชื่อพี่เลี้ยง/);
    let c = houseChart(db, cohortId, "2026-07-10");
    expect(c.warnings).toEqual(expect.arrayContaining(["ยังไม่ได้กำหนดที่ปรึกษา 12 คน", "ยังไม่ได้กำหนดพี่เลี้ยง 12 คน", "ยังไม่ได้กำหนดทีมงาน 12 คน"]));
    assign(db, { enrollmentIds: ids, kind: "counselor", value: String(staff), date: "2026-07-07" }, who);
    assign(db, { enrollmentIds: ids, kind: "mentor", value: "อส.รจ. สมหมาย", date: "2026-07-07" }, who);
    c = houseChart(db, cohortId, "2026-07-10");
    expect(c.counselors).toEqual([{ userId: staff, n: 12 }]);
    expect(c.warnings.join(" ")).toMatch(/พี่เลี้ยงดูแลสมาชิกเกิน 1:10/);
    expect(c.warnings.join(" ")).not.toMatch(/ที่ปรึกษาดูแลสมาชิกเกิน/);
    assign(db, { enrollmentIds: ids.slice(0, 6), kind: "mentor", value: "อส.รจ. บุญช่วย", date: "2026-07-08" }, who);
    assign(db, { enrollmentIds: ids.slice(0, 6), kind: "counselor", value: String(staff2), date: "2026-07-08" }, who);
    c = houseChart(db, cohortId, "2026-07-10");
    expect(c.warnings.filter((w) => /เกิน 1:/.test(w))).toEqual([]);
    expect(c.mentors.map((m) => m.n).sort()).toEqual([6, 6]);
  });

  it("ผังบ้านมีเฉพาะผู้กำลังอบรม (ออก/จบแล้วไม่อยู่ในผัง) · ใช้กับชุมชนบำบัดเท่านั้น · สรุปไม่ระบุชื่อ", () => {
    assign(db, { enrollmentIds: ids.slice(0, 2), kind: "position", value: "resident", date: "2026-07-20", reason: "ผ่านระยะแรกรับ" }, who);
    completeEnrollments(db, [ids[0]], "failed", "2026-08-01", who);
    const c = houseChart(db, cohortId, "2026-08-02");
    expect(c.members.length).toBe(11);
    expect(c.tiers.map((t) => [t.code, t.members.length])).toEqual([["cod", 0], ["chief_expeditor", 0], ["expeditor", 0], ["work_leader", 0], ["resident", 1], ["newcomer", 10]]);
    expect(assign(db, { enrollmentIds: [ids[0]], kind: "team", value: "pr", date: "2026-08-02" }, who).errors[0].error).toMatch(/ไม่ได้อยู่ในสถานะกำลังอบรม/);
    expect(assign(db, { enrollmentIds: [b12Enr], kind: "team", value: "pr", date: "2026-09-02" }, who).errors[0].error).toMatch(/ไม่ใช่สมาชิกชุมชนบำบัด/);
    const s = houseSummary(db, cohortId, "2026-08-02");
    expect(s.total).toBe(11);
    expect(JSON.stringify(s)).not.toMatch(/F-\d|สมาชิก F/);
  });

  it("ประเมินทีมรายสัปดาห์: 1 ผลต่อทีมต่อสัปดาห์ (ซ้ำ = แก้ไข) · เตือนทีมที่ยังไม่ประเมินของสัปดาห์ที่แล้ว", () => {
    assign(db, { enrollmentIds: ids.slice(0, 4), kind: "team", value: "kitchen", date: "2026-07-07" }, who);
    assign(db, { enrollmentIds: ids.slice(4, 8), kind: "team", value: "pr", date: "2026-07-07" }, who);
    expect(teamsWithoutReview(db, cohortId, "2026-07-08").teams).toEqual([]); // สัปดาห์แรก: ยังไม่มีสัปดาห์ที่แล้ว
    expect(teamsWithoutReview(db, cohortId, "2026-07-15")).toEqual({ weekStart: "2026-07-06", teams: ["pr", "kitchen"] });
    expect(saveTeamReview(db, cohortId, { team: "kitchen", weekStart: "2026-07-09", rating: "good", note: "สะอาดดี" }, who)).toBe("2026-07-06");
    saveTeamReview(db, cohortId, { team: "kitchen", weekStart: "2026-07-06", rating: "excellent" }, who);
    expect(teamReviews(db, cohortId).map((r) => [r.team, r.weekStart, r.rating, r.note])).toEqual([["kitchen", "2026-07-06", "excellent", null]]);
    expect(teamsWithoutReview(db, cohortId, "2026-07-15").teams).toEqual(["pr"]);
    expect(() => saveTeamReview(db, cohortId, { team: "kitchen", weekStart: "2026-07-06", rating: "great" }, who)).toThrow(/ผลการประเมิน/);
    expect(() => saveTeamReview(db, cohortId, { team: "kitchen", weekStart: "2099-01-05", rating: "good" }, who)).toThrow(/อนาคต/);
    expect(() => saveTeamReview(db, cohortId, { team: "kitchen", weekStart: "2026-06-01", rating: "good" }, who)).toThrow(/นอกช่วงของรุ่น/);
    expect(() => saveTeamReview(db, cohortId, { team: "nope", weekStart: "2026-07-06", rating: "good" }, who)).toThrow(/ไม่พบทีมงาน/);
  });

  it("สมุดส่วนที่ 3: ข้อมูลช่วยเขียนรวมตำแหน่ง/ทีมที่เปลี่ยนในเดือนนั้น", () => {
    assign(db, { enrollmentIds: [ids[0]], kind: "team", value: "kitchen", date: "2026-07-07" }, who);
    assign(db, { enrollmentIds: [ids[0]], kind: "position", value: "resident", date: "2026-07-20", reason: "ผ่านระยะแรกรับ" }, who);
    assign(db, { enrollmentIds: [ids[0]], kind: "counselor", value: String(staff), date: "2026-07-07" }, who);
    const h = monthHelper(db, ids[0], "2026-07");
    expect(h.assignments.map((x) => [x.kind, x.label, x.changeType])).toEqual([["team", "ครัวและความสะอาด", "assign"], ["position", "Resident", "promote"]]);
    const text = helperSummary(h);
    expect(text).toContain("กำหนดไป ครัวและความสะอาด");
    expect(text).toContain("เลื่อนตำแหน่งเป็น Resident (ผ่านระยะแรกรับ)");
    expect(monthHelper(db, ids[0], "2026-08").assignments).toEqual([]);
  });
});
