import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { saveAttendance, cohortAttendanceSummary } from "@/lib/services/attendance";
import { fillConsent, DEFAULT_CONSENT_TEXT } from "@/lib/consent-text";

describe("เช็คชื่อ: เบิกตัวอื่นๆ ต้องระบุเหตุ + ชั่วโมงสะสม (สเปก 9)", () => {
  let db: DB;
  let sessionId: number, sessionHours: number, cohortId: number, eid: number;
  const actor = { userId: 1, isAdmin: false };
  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    const c = createCohort(db, { courseId: b12, startDate: "2026-09-01" }, 1);
    cohortId = c.id;
    eid = registerEnrollment(db, { cohortId: c.id, person: { firstName: "ทดสอบ", lastName: "เช็คชื่อ", nationalId: null }, incarceration: { inmateNo: "AT-1" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-09-01", enrolledDate: "2026-09-01" }, { userId: 1, canOverride: false, consentRequired: true }).enrollment.id;
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, c.id)).all().find((x) => x.takesAttendance && x.hours >= 2)!;
    sessionId = s.id;
    sessionHours = s.hours;
  });

  it("เบิกตัวอื่นๆ ไม่มีหมายเหตุ → บันทึกไม่ได้ / มีหมายเหตุ → บันทึกได้ และไม่นับเป็นขาด", () => {
    expect(() => saveAttendance(db, sessionId, [{ enrollmentId: eid, status: "corrections", correctionsType: "other", note: "  " }], actor)).toThrow(/ระบุเหตุ/);
    saveAttendance(db, sessionId, [{ enrollmentId: eid, status: "corrections", correctionsType: "other", note: "เบิกตัวไปสอบสวน" }], actor);
    const s = cohortAttendanceSummary(db, cohortId, 80, 60).get(eid)!;
    expect(s).toMatchObject({ corrections: 1, counted: 0, pct: null, presentHours: 0 });
  });
  it("ไปศาล/พบทนาย ไม่บังคับหมายเหตุ", () => {
    expect(() => saveAttendance(db, sessionId, [{ enrollmentId: eid, status: "corrections", correctionsType: "court" }], actor)).not.toThrow();
  });
  it("ชั่วโมงสะสม = ชั่วโมงของคาบที่มา", () => {
    saveAttendance(db, sessionId, [{ enrollmentId: eid, status: "present" }], actor);
    expect(cohortAttendanceSummary(db, cohortId, 80, 60).get(eid)).toMatchObject({ present: 1, counted: 1, presentHours: sessionHours, targetHours: 60 });
  });
});

describe("แบบฟอร์มยินยอม PDPA", () => {
  it("แทน {org} {unit} ทุกตำแหน่ง", () => {
    expect(fillConsent("{unit} ของ {org} — {org}", "เรือนจำกลางเชียงใหม่", "สถานฟื้นฟู")).toBe("สถานฟื้นฟู ของ เรือนจำกลางเชียงใหม่ — เรือนจำกลางเชียงใหม่");
    expect(DEFAULT_CONSENT_TEXT.length).toBeGreaterThan(0);
  });
});
