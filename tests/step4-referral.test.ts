import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveReferral, referralOf, cohortReferrals, referralSummary, normalizeReferral, physicalText, markReferralPrinted, type ReferralInput } from "@/lib/services/health-referral";

let db: DB;
let cohortId: number, b12Cohort: number;
const actor = { userId: 1, canOverride: false, consentRequired: false };
const who = { userId: 1 };

function nid(seed: number) {
  const d = String(110000000000 + seed).split("").map(Number);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i);
  return d.join("") + String((11 - (sum % 11)) % 10);
}
function enroll(cohort: number, no: string, seed: number, confirm = true) {
  return registerEnrollment(db, {
    cohortId: cohort, person: { firstName: "ทดสอบ", lastName: no, nationalId: nid(seed) }, incarceration: { inmateNo: no },
    intake: { exclusions: [], confirmations: ["sentence_remaining"] }, confirmAdmission: confirm, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true,
  }, actor).enrollment.id;
}
const need = (extra: Partial<ReferralInput> = {}): ReferralInput => ({ recordedDate: "2026-11-04", needsReferral: true, physical: ["tb"], hospital: "รพ.สมมติ", ...extra });

beforeEach(() => {
  db = drizzle(openDatabase(":memory:"), { schema }) as DB;
  runMigrations(db);
  bootstrapReferenceData(db);
  db.insert(schema.users).values({ firstName: "พยาบาล", lastName: "ทดสอบ", passwordHash: "x" }).run();
  const course = (code: string) => db.select().from(schema.courses).where(eq(schema.courses.code, code)).get()!.id;
  cohortId = createCohort(db, { courseId: course("PRE3"), startDate: "2026-11-02" }, 1).id;
  b12Cohort = createCohort(db, { courseId: course("B12"), startDate: "2026-11-02" }, 1).id;
});

describe("ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ (สเปก 17 กิจกรรม 11)", () => {
  it("บันทึก → แก้ไข ได้ 1 รายการต่อคน · ข้อความถูกตัดช่องว่าง", () => {
    const e = enroll(cohortId, "69-00001", 1);
    saveReferral(db, e, need({ physical: ["tb", "other", "tb"], physicalOther: "  หอบหืด ", mental: " ", medications: "ยา ก 30 วัน" }), who);
    let r = referralOf(db, e)!;
    expect(r.physical).toEqual(["tb", "other"]);
    expect([r.physicalOther, r.mental, r.medications]).toEqual(["หอบหืด", null, "ยา ก 30 วัน"]);
    expect(physicalText(r)).toBe("วัณโรค, อื่นๆ (หอบหืด)");
    saveReferral(db, e, need({ physical: ["diabetes"], coverage: "uc" }), who, r.version);
    r = referralOf(db, e)!;
    expect([r.physical, r.coverage, r.version]).toEqual([["diabetes"], "uc", 2]);
    expect(db.select().from(schema.healthReferrals).all().length).toBe(1);
  });

  it("ต้องส่งต่อ: ต้องมีปัญหาอย่างน้อย 1 อย่าง · อื่นๆ ต้องระบุ · รหัส/วันที่ผิดไม่รับ", () => {
    expect(() => normalizeReferral(need({ physical: [] }))).toThrow(/อย่างน้อย 1 ข้อ/);
    expect(normalizeReferral(need({ physical: [], mental: "ซึมเศร้า" })).mental).toBe("ซึมเศร้า");
    expect(() => normalizeReferral(need({ physical: ["other"] }))).toThrow(/พิมพ์ชื่อโรค/);
    expect(() => normalizeReferral(need({ coverage: "other" }))).toThrow(/ชื่อสิทธิ/);
    expect(() => normalizeReferral(need({ physical: ["xyz"] }))).toThrow(/ไม่ถูกต้อง/);
    expect(() => normalizeReferral(need({ coverage: "gold" }))).toThrow(/ไม่ถูกต้อง/);
    expect(() => normalizeReferral(need({ recordedDate: "2026-13-40" }))).toThrow(/วันที่/);
  });

  it("ไม่ต้องส่งต่อ: ไม่เก็บรายละเอียดโรคแม้ส่งมา", () => {
    const v = normalizeReferral(need({ needsReferral: false, physical: ["hiv"], mental: "x", hospital: "y", medications: "z", treatmentPlan: "p" }));
    expect([v.physical, v.mental, v.hospital, v.medications, v.treatmentPlan]).toEqual([[], null, null, null, null]);
  });

  it("บันทึกไม่ได้: ยังเป็นร่าง · หลักสูตรอื่น · มีคนแก้ก่อน (เวอร์ชันไม่ตรง)", () => {
    const draft = enroll(cohortId, "69-00002", 2, false);
    expect(() => saveReferral(db, draft, need(), who)).toThrow(/ยืนยันรับเข้า/);
    const other = registerEnrollment(db, { cohortId: b12Cohort, person: { firstName: "ก", lastName: "ข" }, incarceration: { inmateNo: "69-00003" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true }, actor).enrollment.id;
    expect(() => saveReferral(db, other, need(), who)).toThrow(/ไม่มีกิจกรรมส่งต่อ/);
    const e = enroll(cohortId, "69-00004", 4);
    saveReferral(db, e, need(), who);
    saveReferral(db, e, need({ hospital: "รพ.ใหม่" }), who, 1);
    expect(() => saveReferral(db, e, need(), who, 1)).toThrow(/โหลดหน้าใหม่/);
  });

  it("สรุปของรุ่นนับตรงกับรายชื่อ และไม่นับร่าง", () => {
    const a = enroll(cohortId, "69-00010", 10), b = enroll(cohortId, "69-00011", 11);
    enroll(cohortId, "69-00012", 12);
    enroll(cohortId, "69-00013", 13, false);
    saveReferral(db, a, need(), who);
    saveReferral(db, b, need({ needsReferral: false, physical: [] }), who);
    expect(referralSummary(db, cohortId)).toEqual({ total: 3, recorded: 2, needs: 1, pending: 1 });
    const list = cohortReferrals(db, cohortId);
    expect(list.length).toBe(3);
    expect(list.filter((x) => x.referral?.needsReferral).map((x) => x.inmateNo)).toEqual(["69-00010"]);
    markReferralPrinted(db, [referralOf(db, a)!.id], 1);
    expect(referralOf(db, a)!.printedAt).toBeInstanceOf(Date);
  });

  it("ประวัติการแก้ไขไม่มีชื่อโรค ยา หรือโรงพยาบาล", () => {
    const e = enroll(cohortId, "69-00020", 20);
    saveReferral(db, e, need({ physical: ["hiv"], medications: "ยาต้านสมมติ", mental: "วิตกกังวล" }), who);
    const logs = db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "health_referral")).all();
    expect(logs.length).toBe(1);
    const text = JSON.stringify(logs);
    for (const word of ["hiv", "HIV", "ยาต้าน", "วิตกกังวล", "รพ.สมมติ"]) expect(text).not.toContain(word);
  });
});
