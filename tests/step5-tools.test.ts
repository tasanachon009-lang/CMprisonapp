import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { recordReleases, cancelRelease } from "@/lib/services/release";
import {
  createRecord, closeRecord, deleteRecord, suggestTool, suggestNextTool, openItems, recordSummary, cohortRecords, tcList, TOOL_LADDER,
} from "@/lib/services/tc-tools";
import { houseChart } from "@/lib/services/tc-house";
import { monthHelper, helperSummary } from "@/lib/services/member-book";
import { todayISO, addDays } from "@/lib/thai-date";

describe("เครื่องมือบ้าน กฎ 5 ข้อใหญ่ วินัย รางวัล (สเปก 16)", () => {
  let db: DB;
  let cohortId: number, a: number, b: number, b12Enr: number, admin: number;
  const actor = { userId: 1, canOverride: false, consentRequired: false };
  const who = { userId: 1 };
  const base = (enrollmentId: number) => ({ enrollmentId, recordDate: "2026-07-20", behavior: "มาร่วมกิจกรรมสาย" });

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    admin = db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
    db.insert(schema.userRoles).values({ userId: admin, role: "admin" }).run();
    bootstrapReferenceData(db);
    const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
    cohortId = createCohort(db, { courseId: fast.id, startDate: "2026-07-06" }, 1).id;
    const reg = (no: string) => registerEnrollment(db, {
      cohortId, person: { firstName: "สมาชิก", lastName: no, nationalId: null, birthDate: "1990-03-15" }, incarceration: { inmateNo: no, prisonerClass: "good" },
      intake: { exclusions: [], confirmations: ["sentence_condition", "voluntary"] }, confirmAdmission: true, consentSigned: true, consentDate: "2026-07-01", enrolledDate: "2026-07-06", acknowledgeWarnings: true,
    }, actor).enrollment.id;
    a = reg("F-1"); b = reg("F-2");
    const c12 = createCohort(db, { courseId: b12.id, startDate: "2026-09-01" }, 1);
    b12Enr = registerEnrollment(db, { cohortId: c12.id, person: { firstName: "สิบสอง", lastName: "วัน", nationalId: null }, incarceration: { inmateNo: "B-1" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01", acknowledgeWarnings: true }, actor).enrollment.id;
  });

  it("เครื่องมือ 8 ชนิด: 5 ขั้นเรียงตามความรุนแรง + ใช้ได้ทุกระยะ 3 ชนิด · กฎ 5 ข้อใหญ่", () => {
    expect(tcList(db, "tool").map((t) => t.code)).toEqual(["talking_to", "pull_up", "hair_cut", "shot_down", "house_meeting", "confrontation", "hot_chair", "le"]);
    expect(TOOL_LADDER).toEqual(["talking_to", "pull_up", "hair_cut", "shot_down", "house_meeting"]);
    expect(tcList(db, "cardinal").map((t) => t.code)).toEqual(["drugs", "violence", "sex", "theft", "gambling"]);
    expect(tcList(db, "reward").map((t) => t.label)).toEqual(["เลื่อนตำแหน่ง", "ชมเชย", "เพิ่มเวลาโทรศัพท์"]);
  });

  it("แนะนำเครื่องมือขั้นถัดไปเมื่อผิดซ้ำเรื่องเดิม (เฉพาะเรื่องเดียวกันของคนเดียวกัน)", () => {
    expect(suggestTool([])).toEqual({ code: "talking_to", repeat: 0 });
    expect(suggestTool(["talking_to"])).toEqual({ code: "pull_up", repeat: 1 });
    expect(suggestTool(["talking_to", "pull_up", "hot_chair"])).toEqual({ code: "hair_cut", repeat: 2 });
    expect(suggestTool(["house_meeting"]).code).toBe("house_meeting");
    expect(suggestTool(["confrontation", "le"])).toEqual({ code: "talking_to", repeat: 0 });
    createRecord(db, { ...base(a), kind: "tool", code: "talking_to", topic: "participation" }, who);
    createRecord(db, { ...base(a), kind: "tool", code: "pull_up", topic: "participation", recordDate: "2026-07-25" }, who);
    expect(suggestNextTool(db, a, "participation")).toEqual({ code: "hair_cut", repeat: 2 });
    expect(suggestNextTool(db, a, "smoking").code).toBe("talking_to");
    expect(suggestNextTool(db, b, "participation").code).toBe("talking_to");
    expect(suggestNextTool(db, a, null).code).toBe("talking_to");
  });

  it("บันทึกเครื่องมือ: ต้องมีพฤติกรรม · ผู้ใช้เครื่องมือ = ผู้บันทึกถ้าไม่ระบุ · วันที่ไม่เป็นอนาคต · ใช้กับชุมชนบำบัดเท่านั้น", () => {
    expect(() => createRecord(db, { ...base(a), behavior: " ", kind: "tool", code: "talking_to" }, who)).toThrow(/พฤติกรรมที่พบ/);
    expect(() => createRecord(db, { ...base(a), kind: "tool", code: "whip" }, who)).toThrow(/ไม่พบรายการเครื่องมือบ้าน/);
    expect(() => createRecord(db, { ...base(a), recordDate: "2099-01-01", kind: "tool", code: "talking_to" }, who)).toThrow(/อนาคต/);
    expect(() => createRecord(db, { ...base(a), recordDate: "2026-07-01", kind: "tool", code: "talking_to" }, who)).toThrow(/ก่อนวันเข้าโปรแกรม/);
    expect(() => createRecord(db, { ...base(a), kind: "tool", code: "talking_to", topic: "nope" }, who)).toThrow(/หมวดพฤติกรรม/);
    expect(() => createRecord(db, { ...base(b12Enr), recordDate: "2026-09-02", kind: "tool", code: "talking_to" }, who)).toThrow(/ไม่ใช่สมาชิกชุมชนบำบัด/);
    const r = createRecord(db, { ...base(a), kind: "tool", code: "talking_to", observer: "Expeditor" }, who);
    expect([r.status, r.appliedBy, r.observer, r.startDate]).toEqual(["closed", 1, "Expeditor", null]);
  });

  it("Hair cut: ต้องมีใบร้องขอ (ผู้ขอ) และผู้ให้คำแนะนำ 3–4 คน", () => {
    const hc = (advisers: string[], requester = "Chief Expeditor") => createRecord(db, { ...base(a), kind: "tool", code: "hair_cut", haircut: { requester, when: "ระหว่างประชุมเช้า", advisers } }, who);
    expect(() => hc(["ก", "ข"])).toThrow(/3–4 คน/);
    expect(() => hc(["ก", "ข", "ค", "ง", "จ"])).toThrow(/3–4 คน/);
    expect(() => hc(["ก", "ข", "ค"], "")).toThrow(/ผู้ขอ/);
    expect(hc(["ก", "ข", " ", "ค"]).details).toEqual({ requester: "Chief Expeditor", when: "ระหว่างประชุมเช้า", advisers: ["ก", "ข", "ค"] });
  });

  it("Shot down / LE: มีวันเริ่ม–ครบกำหนด (LE ไม่เกิน 4 วัน) · แจ้งเมื่อครบกำหนด · ปลดพร้อมผลลัพธ์", () => {
    const le = createRecord(db, { ...base(a), kind: "tool", code: "le" }, who);
    expect([le.status, le.startDate, le.endDate]).toEqual(["open", "2026-07-20", "2026-07-23"]);
    expect(() => createRecord(db, { ...base(b), kind: "tool", code: "le", endDate: "2026-07-26" }, who)).toThrow(/ไม่เกิน 4 วัน/);
    expect(() => createRecord(db, { ...base(b), kind: "tool", code: "shot_down", endDate: "2026-07-10" }, who)).toThrow(/ก่อนวันเริ่ม/);
    const sd = createRecord(db, { ...base(b), kind: "tool", code: "shot_down", endDate: "2026-07-30" }, who);
    expect(openItems(db, cohortId, "2026-07-22")).toMatchObject({ due: [], running: [{}, {}] });
    expect(openItems(db, cohortId, "2026-07-23").due.map((x) => x.r.id)).toEqual([le.id]);
    expect(() => closeRecord(db, le.id, { date: "2026-07-23", outcome: "" }, who)).toThrow(/ผลลัพธ์/);
    expect(() => closeRecord(db, le.id, { date: "2026-07-19", outcome: "ปฏิบัติครบ" }, who)).toThrow(/ก่อนวันเริ่ม/);
    closeRecord(db, le.id, { date: "2026-07-23", outcome: "ปฏิบัติครบ ปรับตัวดีขึ้น" }, who);
    expect(() => closeRecord(db, le.id, { date: "2026-07-24", outcome: "ซ้ำ" }, who)).toThrow(/ปิดไปแล้ว/);
    expect(openItems(db, cohortId, "2026-08-01").due.map((x) => x.r.id)).toEqual([sd.id]);
  });

  it("กฎ 5 ข้อใหญ่: บันทึกแยก แจ้งผู้ดูแลทันที เปิดเรื่องไว้จนบันทึกผล · วินัยอื่นต้องมีระดับ · รางวัล", () => {
    const c = createRecord(db, { ...base(a), kind: "cardinal", code: "violence", behavior: "ชกต่อยเพื่อนสมาชิก" }, who);
    expect(c.status).toBe("open");
    const n = db.select().from(schema.notifications).where(eq(schema.notifications.kind, "tc_cardinal_rule")).all();
    expect(n.map((x) => [x.role, x.severity])).toEqual([["admin", "danger"]]);
    expect(n[0].message).toContain("ห้ามใช้ความรุนแรง");
    expect(openItems(db, cohortId).cardinal.length).toBe(1);
    closeRecord(db, c.id, { date: "2026-07-21", outcome: "จัด House meeting" }, who);
    expect(openItems(db, cohortId).cardinal).toEqual([]);
    expect(() => createRecord(db, { ...base(a), kind: "violation", code: "late" }, who)).toThrow(/ระดับความผิด/);
    expect(createRecord(db, { ...base(a), kind: "violation", code: "late", level: "minor" }, who).level).toBe("minor");
    expect(() => createRecord(db, { ...base(a), behavior: "", kind: "reward", code: "praise" }, who)).toThrow(/เหตุที่ให้รางวัล/);
    createRecord(db, { ...base(b), behavior: "ช่วยงานส่วนรวม", kind: "reward", code: "phone" }, who);
    // เครื่องมือบ้านไม่แจ้งเตือนแบบกฎ 5 ข้อ
    createRecord(db, { ...base(b), kind: "tool", code: "talking_to" }, who);
    expect(db.select().from(schema.notifications).where(eq(schema.notifications.kind, "tc_cardinal_rule")).all().length).toBe(1);
    const s = recordSummary(db, cohortId);
    expect([s.total, s.members, s.cardinal.find((x) => x.code === "violence")!.n, s.levels.find((x) => x.level === "minor")!.n, s.rewards.find((x) => x.code === "phone")!.n]).toEqual([4, 2, 1, 1, 1]);
    expect(JSON.stringify(s)).not.toMatch(/F-1|ชกต่อย/);
  });

  it("แปลงบันทึกพฤติกรรมด่วนเป็นบันทึกวินัย: ผูกต้นทาง แปลงซ้ำไม่ได้ · ลบรายการแล้วคืนสถานะบันทึกเดิม", () => {
    const inc = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, a)).get()!.incarcerationId;
    const note = db.insert(schema.behaviorNotes).values({ enrollmentId: a, incarcerationId: inc, noteDate: "2026-07-19", tone: "negative", category: "fighting", text: "ทะเลาะกับเพื่อน" }).returning().get();
    expect(() => createRecord(db, { ...base(b), kind: "violation", code: "disrespect", level: "moderate", sourceNoteId: note.id }, who)).toThrow(/ไม่พบบันทึกพฤติกรรมต้นทาง/);
    const r = createRecord(db, { ...base(a), behavior: note.text, topic: "fighting", kind: "violation", code: "disrespect", level: "moderate", sourceNoteId: note.id }, who);
    expect(db.select().from(schema.behaviorNotes).where(eq(schema.behaviorNotes.id, note.id)).get()!.convertedTo).toBe(`tc_record:${r.id}`);
    expect(() => createRecord(db, { ...base(a), kind: "tool", code: "talking_to", sourceNoteId: note.id }, who)).toThrow(/ถูกแปลงไปแล้ว/);
    expect(() => deleteRecord(db, r.id, "", who)).toThrow(/เหตุผล/);
    deleteRecord(db, r.id, "บันทึกผิดคน", who);
    expect(db.select().from(schema.behaviorNotes).where(eq(schema.behaviorNotes.id, note.id)).get()!.convertedTo).toBeNull();
    expect(cohortRecords(db, cohortId)).toEqual([]);
  });

  it("ออกจากเรือนจำ: ยกเลิก Shot down/LE ที่ยังไม่ปลด และไม่อยู่ในผังบ้าน · ยกเลิกบันทึกออกแล้วย้อนกลับ", () => {
    const today = todayISO();
    db.update(schema.enrollments).set({ enrolledDate: addDays(today, -30) }).where(eq(schema.enrollments.id, a)).run();
    const sd = createRecord(db, { enrollmentId: a, recordDate: addDays(today, -1), behavior: "ฝ่าฝืนกฎบ้าน", kind: "tool", code: "shot_down", endDate: addDays(today, 5) }, who);
    const closed = createRecord(db, { enrollmentId: a, recordDate: addDays(today, -2), behavior: "มาสาย", kind: "tool", code: "talking_to" }, who);
    const inc = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.inmateNo, "F-1")).get()!;
    const res = recordReleases(db, { incarcerationIds: [inc.id], releasedDate: today, reason: "released" }, who);
    expect(res.summary[0].actions.join(" ")).toMatch(/ยกเลิกเครื่องมือบ้านที่ยังไม่ปลด 1 รายการ/);
    const get = (id: number) => db.select().from(schema.tcRecords).where(eq(schema.tcRecords.id, id)).get()!;
    expect([get(sd.id).status, get(closed.id).status]).toEqual(["cancelled", "closed"]);
    expect(openItems(db, cohortId).running).toEqual([]);
    expect(houseChart(db, cohortId).members.map((m) => m.enrollmentId)).toEqual([b]);
    const ev = db.select().from(schema.releaseEvents).where(eq(schema.releaseEvents.incarcerationId, inc.id)).get()!;
    cancelRelease(db, ev.id, "บันทึกผิดคน", who);
    expect([get(sd.id).status, get(sd.id).cancelledByReleaseId]).toEqual(["open", null]);
    expect(houseChart(db, cohortId).members.length).toBe(2);
  });

  it("สมุดส่วนที่ 3: ข้อมูลช่วยเขียนรวมเครื่องมือบ้านและการละเมิดกฎของเดือนนั้น", () => {
    createRecord(db, { ...base(a), kind: "tool", code: "talking_to", topic: "participation" }, who);
    createRecord(db, { ...base(a), recordDate: "2026-07-25", kind: "tool", code: "pull_up", topic: "participation" }, who);
    createRecord(db, { ...base(a), kind: "violation", code: "late", level: "minor" }, who);
    createRecord(db, { ...base(a), recordDate: "2026-08-03", kind: "reward", code: "praise", behavior: "ปรับตัวดี" }, who);
    const h = monthHelper(db, a, "2026-07");
    expect(h.records.map((r) => [r.kind, r.label])).toEqual([["tool", "Talking to"], ["violation", "ไม่ตรงต่อเวลา"], ["tool", "Pull up"]]);
    const text = helperSummary(h);
    expect(text).toContain("เครื่องมือบ้าน 2 ครั้ง (Talking to, Pull up)");
    expect(text).toContain("ความผิดวินัย 1 ครั้ง (ไม่ตรงต่อเวลา)");
    expect(helperSummary(monthHelper(db, a, "2026-08"))).toContain("รางวัล/สิทธิพิเศษ 1 ครั้ง (ชมเชย)");
  });
});
