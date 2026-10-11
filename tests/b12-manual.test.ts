import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { B12_TEMPLATE, B12_DRAFT_TITLES, B12_CHIPS, TOPIC_SEEDS } from "@/lib/reference-data";
import { createCohort } from "@/lib/services/cohorts";
import { updateSession } from "@/lib/services/schedule-edit";
import { summarizeAttendance } from "@/lib/rules/attendance-rules";

describe("แม่แบบตาราง 12 วันตามคู่มือกรมราชทัณฑ์ (ตารางการปฏิบัติประจำวัน ข้อ 11)", () => {
  let db: DB;
  let b12: number;
  const template = () => db.select().from(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, b12)).all();
  const topics = () => db.select().from(schema.activityTopics).where(eq(schema.activityTopics.courseId, b12)).all();
  const day = (n: number) => B12_TEMPLATE.filter((t) => t.dayNo === n).map((t) => `${t.startTime} ${t.title}`);

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    bootstrapReferenceData(db);
    b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
  });

  it("12 วัน 60 ชั่วโมง: นับเฉพาะ 09.00–12.00 และ 13.00–15.00 วันละ 5 ชม. · ประชุมเช้าและบันทึกประจำวันไม่นับชั่วโมง", () => {
    expect(B12_TEMPLATE.reduce((t, x) => t + x.hours, 0)).toBe(60);
    for (let d = 1; d <= 12; d++) expect(B12_TEMPLATE.filter((t) => t.dayNo === d).reduce((t, x) => t + x.hours, 0)).toBe(5);
    expect(B12_TEMPLATE.filter((t) => t.startTime === "08:00" || t.title === "เขียนบันทึกประจำวัน").every((t) => t.hours === 0)).toBe(true);
    expect(B12_TEMPLATE.filter((t) => t.title === "เขียนบันทึกประจำวัน").map((t) => `${t.startTime}-${t.endTime}`)).toEqual(Array(12).fill("16:30-18:00"));
    expect(B12_TEMPLATE.filter((t) => t.title === "ประชุมเช้า").map((t) => t.dayNo)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("ลำดับหัวข้อรายวันตรงตามตารางในคู่มือ", () => {
    expect(day(1)).toEqual(["08:00 ลงทะเบียนและพิธีเปิด", "09:00 ประเมินก่อนเข้ารับการบำบัด", "13:00 ประเมินก่อนเข้ารับการบำบัด (ต่อ)", "16:30 เขียนบันทึกประจำวัน"]);
    expect(day(4)).toEqual(["08:00 ประชุมเช้า", "09:00 ทบทวนจิตตนเอง", "10:30 รู้ตน พ้นทุกข์", "13:00 บทเรียนสอนตน", "16:30 เขียนบันทึกประจำวัน"]);
    expect(day(6).slice(1, 4)).toEqual(["09:00 สมองติดยา และโทษพิษภัยของยาเสพติด", "10:30 ความรู้เกี่ยวกับกฎหมายและบทลงโทษในคดีความผิดยาเสพติด", "13:00 สัมมนาผลกระทบของยาเสพติดต่อตนเอง สังคม และประเทศชาติ"]);
    // วันที่ 7 และ 8 ช่วงเช้าเป็นคาบเดียว 3 ชั่วโมง
    expect(B12_TEMPLATE.filter((t) => t.dayNo === 7 || t.dayNo === 8).filter((t) => t.hours === 3).map((t) => t.title)).toEqual(["ทักษะการปฏิเสธและ Self-assertion", "กลุ่มเสริมสร้างแรงจูงใจครั้งที่ 3 “การตัดสินใจ”"]);
    expect(day(11).slice(1, 4)).toEqual(["09:00 สายใยรัก", "10:30 การทำหน้าที่ของครอบครัว 1", "13:00 การทำหน้าที่ของครอบครัว 2"]);
    expect(day(12).slice(1, 3)).toEqual(["09:00 สายสัมพันธ์ครอบครัว (ทางเลือก) หรือกิจกรรม Walk Rally", "13:00 ประเมินหลังเข้ารับการบำบัดและพิธีปิดการอบรม"]);
    // กลุ่มเสริมสร้างแรงจูงใจ 4 ครั้ง วันที่ 3, 5, 8, 8
    expect(B12_TEMPLATE.filter((t) => /^กลุ่มเสริมสร้างแรงจูงใจครั้งที่/.test(t.title)).map((t) => t.dayNo)).toEqual([3, 5, 8, 8]);
  });

  it("ติดตั้งใหม่: แม่แบบและคลังหัวข้อใช้ชุดตามคู่มือ · ทุกคาบผูกหัวข้อ · ชิปมาจากจุดประสงค์การเรียนรู้", () => {
    expect(template().length).toBe(B12_TEMPLATE.length);
    expect(template().every((t) => t.topicId != null)).toBe(true);
    expect(topics().some((t) => B12_DRAFT_TITLES.includes(t.name) && !B12_CHIPS[t.name])).toBe(false);
    const t = topics().find((x) => x.name === "การจัดการตัวกระตุ้น")!;
    expect(t.outcomeChips).toEqual([...B12_CHIPS["การจัดการตัวกระตุ้น"], "ใช้เวลาเกิน", "เวลาไม่พอ"]);
    expect(t.chipsReviewedAt).toBeNull(); // ยังรอผู้ดูแลตรวจ
    // หัวข้อที่มีผู้สอน (ไม่ใช่กิจกรรมทั้งทีม) มีชิปจากคู่มือทุกหัวข้อ ยกเว้นกลุ่มเสริมสร้างแรงจูงใจครั้งที่ 4 (ไม่มีแผนในเล่ม)
    expect(TOPIC_SEEDS.B12.filter((x) => x.staffingType !== "team" && !B12_CHIPS[x.name]).map((x) => x.name)).toEqual(["กลุ่มเสริมสร้างแรงจูงใจครั้งที่ 4 “ก้าวต่อไป”"]);
  });

  it("สร้างรุ่น: ชั่วโมงรวม 60 · คาบ 0 ชั่วโมงแก้ไขได้ · ร้อยละการเข้าร่วมยังนับตามจำนวนคาบ (รวมคาบ 0 ชั่วโมง) เหมือนเดิม", () => {
    const c = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
    const ss = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all();
    expect(ss.reduce((t, x) => t + x.hours, 0)).toBe(60);
    const meet = ss.find((x) => x.title === "ประชุมเช้า")!;
    expect(() => updateSession(db, meet.id, { location: "ลานกิจกรรม" }, { userId: 1 })).not.toThrow();
    expect(() => updateSession(db, meet.id, { hours: -1 }, { userId: 1 })).toThrow(/ระหว่าง 0 ถึง 12/);
    // กติกาเดิมไม่เปลี่ยน: ขาดประชุมเช้า 1 คาบจาก 3 คาบ = 66.7% แต่ชั่วโมงที่เข้าร่วมยังครบ 5 ชม.
    const missedMeeting = summarizeAttendance([{ status: "absent", hours: 0 }, { status: "present", hours: 3 }, { status: "present", hours: 2 }], 60, 80);
    expect(missedMeeting).toMatchObject({ pct: 66.7, presentHours: 5, countedHours: 5 });
  });

  describe("ฐานข้อมูลเดิมที่ยังใช้แม่แบบร่าง", () => {
    const toDraft = (extraTitle?: string) => {
      db.delete(schema.courseTemplateSessions).where(eq(schema.courseTemplateSessions.courseId, b12)).run();
      const titles = [...B12_DRAFT_TITLES.slice(0, 6), "ประชุมเช้า", "เขียนบันทึกประจำวัน", ...(extraTitle ? [extraTitle] : [])];
      titles.forEach((title, i) => db.insert(schema.courseTemplateSessions).values({ courseId: b12, dayNo: 1 + (i % 3), startTime: "09:00", endTime: "11:00", title, hours: 2, sortOrder: i }).run());
      for (const name of ["ปฐมนิเทศและสร้างสัมพันธภาพ", "การจัดการอารมณ์"]) {
        if (!topics().some((t) => t.name === name)) db.insert(schema.activityTopics).values({ courseId: b12, name, outcomeChips: ["ชิปร่างเดิม"] }).run();
      }
      db.update(schema.activityTopics).set({ outcomeChips: ["ชิปร่างเดิม"], chipsReviewedAt: null }).where(and(eq(schema.activityTopics.courseId, b12), eq(schema.activityTopics.name, "การจัดการอารมณ์"))).run();
      db.delete(schema.settings).where(eq(schema.settings.key, "bootstrap.b12manual")).run();
    };

    it("แม่แบบยังเป็นร่างเดิมทุกคาบ → เปลี่ยนเป็นชุดตามคู่มือ · หัวข้อร่างที่ไม่มีในคู่มือถูกปิดใช้งาน (ไม่ลบ) · รุ่นเดิมไม่ถูกแก้", () => {
      const old = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1);
      const before = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, old.id)).all().length;
      toDraft();
      bootstrapReferenceData(db);
      expect(template().map((t) => t.title).sort()).toEqual(B12_TEMPLATE.map((t) => t.title).sort());
      expect(template().every((t) => t.topicId != null)).toBe(true);
      expect(topics().find((t) => t.name === "ปฐมนิเทศและสร้างสัมพันธภาพ")!.active).toBe(false);
      const emo = topics().find((t) => t.name === "การจัดการอารมณ์")!; // ชื่อเดียวกับในคู่มือ → ใช้ต่อ และเปลี่ยนชิปร่างเป็นชุดจากคู่มือ
      expect(emo.active).toBe(true);
      expect(emo.outcomeChips).toContain("ได้ฝึกทักษะการควบคุมอารมณ์");
      expect(db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, old.id)).all().length).toBe(before);
      // ทำซ้ำได้ ไม่เพิ่มซ้ำ
      const n = topics().length;
      bootstrapReferenceData(db);
      expect([template().length, topics().length]).toEqual([B12_TEMPLATE.length, n]);
    });

    it("ผู้ดูแลแก้แม่แบบแล้ว (มีคาบที่ไม่ใช่ร่างเดิม) → ไม่ทับ", () => {
      toDraft("หัวข้อที่ผู้ดูแลเพิ่มเอง");
      bootstrapReferenceData(db);
      expect(template().some((t) => t.title === "หัวข้อที่ผู้ดูแลเพิ่มเอง")).toBe(true);
      expect(template().some((t) => t.title === "ทบทวนจิตตนเอง")).toBe(false);
      expect(topics().find((t) => t.name === "ปฐมนิเทศและสร้างสัมพันธภาพ")!.active).toBe(true);
    });
  });
});
