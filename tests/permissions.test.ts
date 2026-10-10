import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { resolvePermissions, scopedPermissions, scopedCohorts, canInCohorts, ROLE_PERMISSIONS, type Grant } from "@/lib/auth/permissions";
import { createMessage, messagesFor, type Viewer } from "@/lib/services/shift";

const TODAY = "2026-10-04";
const g = (permission: string, scope: string | null, extra: Partial<Grant> = {}): Grant => ({ permission, allow: true, scope, validFrom: null, validTo: null, ...extra });

describe("สิทธิ์ตามบทบาท (สเปก 2.2-0, 20)", () => {
  it("ผู้บริหารไม่เห็นรายชื่องาน บสต./รท.101 (ดูสรุปเท่านั้น)", () => {
    expect(ROLE_PERMISSIONS.executive).not.toContain("bst.view");
    expect(ROLE_PERMISSIONS.executive).toContain("dashboard.view");
  });
  it("การเงินและผู้บริหารไม่มีกล่องจดหมายเวร · กลุ่ม B มี (แบบจำกัด)", () => {
    expect(ROLE_PERMISSIONS.finance).not.toContain("shift.use");
    expect(ROLE_PERMISSIONS.executive).not.toContain("shift.use");
    expect(ROLE_PERMISSIONS.assistant).toContain("shift.use");
  });
  it("กลุ่ม B ไม่มีสิทธิ์ญาติ/ติดตามทั้งระบบโดยตั้งต้น", () => {
    const p = resolvePermissions(["assistant"], [], TODAY);
    expect(p.has("contacts.edit")).toBe(false);
    expect(p.has("bst.edit")).toBe(false);
  });
});

describe("มอบหมายรายรุ่น (กลุ่ม B)", () => {
  it("สิทธิ์รายรุ่นใช้ได้เฉพาะรุ่นที่มอบหมาย ไม่กลายเป็นสิทธิ์ทั้งระบบ", () => {
    const grants = [g("contacts.edit", "cohort:5"), g("bst.edit", "cohort:7")];
    const perms = resolvePermissions(["assistant"], grants, TODAY);
    const scoped = scopedPermissions(grants, TODAY);
    expect(perms.has("contacts.edit")).toBe(false);
    expect(canInCohorts(perms, scoped, "contacts.edit", [5])).toBe(true);
    expect(canInCohorts(perms, scoped, "contacts.edit", [7])).toBe(false);
    expect(canInCohorts(perms, scoped, "bst.edit", [7, 9])).toBe(true);
    expect(canInCohorts(perms, scoped, "bst.edit", [])).toBe(false);
  });
  it("หมดช่วงวันที่ → หมดสิทธิ์อัตโนมัติ", () => {
    const grants = [g("contacts.edit", "cohort:5", { validTo: "2026-09-30" })];
    expect(scopedPermissions(grants, TODAY)["contacts.edit"]).toBeUndefined();
    expect(scopedCohorts(grants, TODAY)).toEqual([]);
  });
  it("สิทธิ์ที่ไม่อนุญาตให้มอบหมายรายรุ่น (เช่น ทะเบียน) ไม่มีผล", () => {
    const grants = [g("registry.edit", "cohort:5"), g("health.view", "cohort:5")];
    expect(scopedPermissions(grants, TODAY)).toEqual({});
  });
  it("ผู้มีสิทธิ์ทั้งระบบผ่านทุกรุ่น", () => {
    const perms = resolvePermissions(["rehab"], [], TODAY);
    expect(canInCohorts(perms, {}, "contacts.edit", [123])).toBe(true);
  });
});

describe("กล่องจดหมายเวร: ผู้รับ (สเปก 20)", () => {
  let db: DB;
  let c1: number, c2: number;
  const lead: Viewer = { userId: 1, full: true, cohortIds: [], canHealth: true };
  const helper: Viewer = { userId: 2, full: false, cohortIds: [], canHealth: false };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values([{ firstName: "หัวหน้า", lastName: "ก", passwordHash: "x" }, { firstName: "ผู้ช่วย", lastName: "ข", passwordHash: "x" }]).run();
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    c1 = createCohort(db, { courseId: b12, startDate: "2026-10-05" }, 1).id;
    c2 = createCohort(db, { courseId: b12, startDate: "2027-01-04" }, 1).id;
    helper.cohortIds = [c1];
  });

  const send = (recipientType: string, extra: object = {}, author = 1) =>
    createMessage(db, { level: "normal", body: `ถึง ${recipientType}`, healthRelated: false, recipientType, needsAction: false, ...extra }, { userId: author });

  it("กลุ่ม B ไม่เห็นข้อความทั่วไปของเวร (ผลัดถัดไป/ทุกคน) แต่เห็นข้อความถึงตนและถึงรุ่นที่ตนสอน", () => {
    send("next_shift");
    send("all");
    send("user", { recipientUserId: 2 });
    send("cohort", { recipientCohortId: c1 });
    send("cohort", { recipientCohortId: c2 });
    const seen = messagesFor(db, helper).map((m) => m.body).sort();
    expect(seen).toEqual(["ถึง cohort", "ถึง user"]);
    expect(messagesFor(db, helper).find((m) => m.recipientType === "cohort")?.recipientCohortId).toBe(c1);
  });
  it("หัวหน้า/กลุ่ม A เห็นทุกข้อความยกเว้นข้อความส่วนตัวของคนอื่น", () => {
    send("next_shift", {}, 2);
    send("all", {}, 2);
    send("cohort", { recipientCohortId: c2 }, 2);
    send("user", { recipientUserId: 99 }, 2);
    expect(messagesFor(db, lead).length).toBe(3);
  });
  it("กลุ่ม B ส่งได้ แต่ส่งถึงทีมของรุ่นได้เฉพาะรุ่นที่ตนสอน", () => {
    expect(() => createMessage(db, { level: "normal", body: "พฤติกรรมในคาบ", healthRelated: false, recipientType: "next_shift", needsAction: false }, { userId: 2, viewer: helper })).not.toThrow();
    expect(() => createMessage(db, { level: "normal", body: "x", healthRelated: false, recipientType: "cohort", recipientCohortId: c2, needsAction: false }, { userId: 2, viewer: helper })).toThrow(/เฉพาะรุ่นที่รับผิดชอบ/);
    // ข้อความที่ตนเขียนเองยังเห็นได้
    expect(messagesFor(db, helper).some((m) => m.body === "พฤติกรรมในคาบ")).toBe(true);
  });
  it("เรื่องสุขภาพถูกปิดข้อความสำหรับผู้ไม่มีสิทธิ์สุขภาพ", () => {
    send("user", { recipientUserId: 2, healthRelated: true });
    expect(messagesFor(db, helper)[0].body).toBe("มีเรื่องสุขภาพ — ติดต่อพยาบาล");
  });
});
