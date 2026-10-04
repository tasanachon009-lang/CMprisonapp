/**
 * ตั้งค่าครั้งแรก (install.ps1 เรียก) — สร้างฐานข้อมูลว่าง + ข้อมูลอ้างอิง + รหัสหน่วยงาน + บัญชีหัวหน้าคนแรก + รหัสฉุกเฉิน
 * รับค่าผ่านตัวแปรแวดล้อม (ไม่ใส่ในบรรทัดคำสั่ง เพื่อไม่ให้รหัสค้างในประวัติ):
 *   SETUP_ORG_CODE, SETUP_ADMIN_PREFIX, SETUP_ADMIN_FIRST, SETUP_ADMIN_LAST, SETUP_ADMIN_POSITION, SETUP_ADMIN_PASSWORD, SETUP_SECRETS_FILE
 */
import fs from "node:fs";
import { randomBytes } from "node:crypto";

// อ่าน .env ก่อนโหลดโมดูลที่ใช้ค่าตั้ง
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const { drizzle } = await import("drizzle-orm/better-sqlite3");
const { openDatabase, runMigrations, schema } = await import("../src/lib/db");
const { config } = await import("../src/lib/config");
const { bootstrapReferenceData, getSetting, setSetting } = await import("../src/lib/bootstrap");
const { hashPassword } = await import("../src/lib/auth/password");
const { checkPassword } = await import("../src/lib/password-policy");
type DB = import("../src/lib/db").DB;

async function main() {
  const sqlite = openDatabase(config.dbPath);
  const db = drizzle(sqlite, { schema }) as DB;
  runMigrations(db);
  bootstrapReferenceData(db);
  console.log(`✓ ฐานข้อมูลพร้อม: ${config.dbPath}`);

  const orgCode = process.env.SETUP_ORG_CODE;
  if (orgCode) {
    if (orgCode.length < 8) throw new Error("รหัสหน่วยงานต้องยาวอย่างน้อย 8 ตัว");
    setSetting(db, "auth.orgCodeHash", await hashPassword(orgCode), null);
    console.log("✓ ตั้งรหัสหน่วยงานแล้ว");
  }

  const hasAdmin = db.select().from(schema.userRoles).all().some((r) => r.role === "admin");
  const first = process.env.SETUP_ADMIN_FIRST;
  if (!hasAdmin && first) {
    const pw = process.env.SETUP_ADMIN_PASSWORD ?? "";
    const problem = checkPassword(pw, { firstName: first, lastName: process.env.SETUP_ADMIN_LAST, isAdmin: true });
    if (problem) throw new Error(`รหัสผ่านหัวหน้า: ${problem}`);
    const u = db
      .insert(schema.users)
      .values({
        prefix: process.env.SETUP_ADMIN_PREFIX || null, firstName: first, lastName: process.env.SETUP_ADMIN_LAST ?? "",
        position: process.env.SETUP_ADMIN_POSITION || "หัวหน้าสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด", profession: process.env.SETUP_ADMIN_PROFESSION || "nurse",
        level: "lead", titleLabel: "หัวหน้า", passwordHash: await hashPassword(pw), mustChangePassword: false, sortOrder: 1, color: "#2E8B57",
      })
      .returning()
      .get();
    for (const r of ["admin", "rehab"]) db.insert(schema.userRoles).values({ userId: u.id, role: r }).run();
    console.log(`✓ สร้างบัญชีหัวหน้า: ${first} ${process.env.SETUP_ADMIN_LAST ?? ""}`);
  } else if (hasAdmin) {
    console.log("• มีบัญชีผู้ดูแลอยู่แล้ว — ข้ามการสร้างบัญชีหัวหน้า");
  }

  // รหัสฉุกเฉิน (สร้างครั้งแรก) → เขียนลงไฟล์ชั่วคราวให้พิมพ์ใส่ซอง แล้ว install.ps1 จะลบไฟล์ทิ้ง
  if (!getSetting(db, "auth.emergencyCodeHash", null) && process.env.SETUP_SECRETS_FILE) {
    const code = randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16).replace(/(.{4})(?=.)/g, "$1-");
    setSetting(db, "auth.emergencyCodeHash", await hashPassword(code), null);
    setSetting(db, "auth.emergencyCodeCreatedAt", Date.now(), null);
    fs.appendFileSync(process.env.SETUP_SECRETS_FILE, `\r\nรหัสฉุกเฉิน (ใช้ยืนยันแทนผู้ดูแลอีกคนเมื่อไม่อยู่นาน): ${code}\r\n`, "utf8");
    console.log("✓ สร้างรหัสฉุกเฉินแล้ว");
  }
  sqlite.close();
}

main().catch((e) => {
  console.error("✗", e instanceof Error ? e.message : e);
  process.exit(1);
});
