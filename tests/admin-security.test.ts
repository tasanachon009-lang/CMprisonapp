import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, getSetting, setSetting } from "@/lib/bootstrap";
import { checkPassword } from "@/lib/password-policy";
import { isOffHours, notifyOffHoursLogin } from "@/lib/auth/off-hours";

// เวลาไทย (UTC+7) → Date
const bkk = (iso: string) => new Date(`${iso}+07:00`);

describe("ผู้ดูแลระบบไม่ใช้ OTP (สเปก 2.1)", () => {
  let db: DB;
  let head: number, deputy: number, nurse: number;
  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    const mk = (firstName: string, roles: string[]) => {
      const id = db.insert(schema.users).values({ firstName, lastName: "ทดสอบ", passwordHash: "x" }).returning().get().id;
      for (const role of roles) db.insert(schema.userRoles).values({ userId: id, role }).run();
      return id;
    };
    head = mk("หัวหน้า", ["admin", "rehab"]);
    deputy = mk("รอง", ["admin", "rehab"]);
    nurse = mk("พยาบาล", ["rehab"]);
  });

  it("ค่าเริ่มต้น: ปิด OTP ผู้ดูแล", () => {
    expect(getSetting<boolean>(db, "security.adminOtp", true)).toBe(false);
  });

  it("รหัสผ่านผู้ดูแลอย่างน้อย 12 ตัว / ผู้ใช้ทั่วไป 8 ตัว", () => {
    expect(checkPassword("rehab-2569", { isAdmin: true })).toMatch(/12 ตัว/);
    expect(checkPassword("rehab-admin-2569", { isAdmin: true })).toBeNull();
    expect(checkPassword("rehab-2569")).toBeNull();
  });

  it("นอกเวลาราชการ = นอกช่วงเวลา, เสาร์-อาทิตย์, วันหยุดราชการ", () => {
    setSetting(db, "security.officeHours", { start: "08:30", end: "16:30" }, null);
    expect(isOffHours(db, bkk("2026-10-05T10:00:00")).off).toBe(false); // จันทร์
    expect(isOffHours(db, bkk("2026-10-05T07:59:00")).off).toBe(true);
    expect(isOffHours(db, bkk("2026-10-05T17:00:00")).off).toBe(true);
    expect(isOffHours(db, bkk("2026-10-04T10:00:00")).off).toBe(true); // อาทิตย์
    db.insert(schema.holidays).values({ date: "2026-10-13", name: "วันนวมินทรมหาราช" }).onConflictDoNothing().run();
    expect(isOffHours(db, bkk("2026-10-13T10:00:00"))).toMatchObject({ off: true, holiday: true });
  });

  it("ผู้ดูแลเข้านอกเวลา → แจ้งเฉพาะผู้ดูแลอีกคน (ไม่แจ้งตัวเอง) · ในเวลาไม่แจ้ง", () => {
    expect(notifyOffHoursLogin(db, { id: head, firstName: "หัวหน้า", lastName: "ทดสอบ" }, true, bkk("2026-10-05T10:00:00"))).toBe(false);
    expect(notifyOffHoursLogin(db, { id: head, firstName: "หัวหน้า", lastName: "ทดสอบ" }, true, bkk("2026-10-05T21:15:00"))).toBe(true);
    const notes = db.select().from(schema.notifications).where(eq(schema.notifications.kind, "off_hours_admin_login")).all();
    expect(notes.map((n) => n.userId)).toEqual([deputy]);
    expect(notes[0].severity).toBe("warning");
    expect(notes[0].message).toContain("21:15");
  });

  it("ผู้ใช้ทั่วไปเข้านอกเวลา → แจ้งผู้ดูแล (ตามบทบาท)", () => {
    notifyOffHoursLogin(db, { id: nurse, firstName: "พยาบาล", lastName: "ทดสอบ" }, false, bkk("2026-10-04T09:00:00"));
    const n = db.select().from(schema.notifications).where(eq(schema.notifications.kind, "off_hours_login")).get()!;
    expect(n.role).toBe("admin");
  });
});
