/**
 * แสดงรหัส OTP ปัจจุบันของบัญชีทดสอบ — ใช้กับฐานข้อมูลปลอม (seed) บนเครื่องพัฒนาเท่านั้น
 * ใช้: npm run dev:otp -- <ชื่อ>   เช่น  npm run dev:otp -- วิภาวรรณ
 * ต้องกด "แสดง QR สำหรับสแกน" ในหน้าตั้งค่า OTP ก่อน (ระบบจึงจะสร้างรหัสลับ) แล้วรันสคริปต์นี้เพื่อดูรหัส 6 หลัก
 */
import Database from "better-sqlite3";
import { config } from "../src/lib/config";
import { hotp, counterAt } from "../src/lib/auth/totp";

const db = new Database(config.dbPath, { readonly: true });
const demo = db.prepare("select value from settings where key = 'app.isDemoData'").get() as { value: string } | undefined;
if (demo?.value !== "true") {
  console.error("❌ ใช้ได้เฉพาะฐานข้อมูลปลอม (seed) เท่านั้น — ฐานข้อมูลนี้ไม่ได้ติดป้ายข้อมูลตัวอย่าง");
  process.exit(1);
}
const name = process.argv[2] ?? "";
const users = db.prepare("select id, first_name f, last_name l, totp_secret s, totp_enabled e from users where first_name like ? and deleted_at is null").all(`%${name}%`) as Array<{ id: number; f: string; l: string; s: string | null; e: number }>;
if (!users.length) console.log("ไม่พบผู้ใช้ชื่อนี้");
for (const u of users) {
  if (!u.s) console.log(`${u.f} ${u.l}: ยังไม่มีรหัสลับ — เข้าระบบแล้วกด "แสดง QR สำหรับสแกน" ในหน้าตั้งค่า OTP ก่อน`);
  else {
    const left = 30 - (Math.floor(Date.now() / 1000) % 30);
    console.log(`${u.f} ${u.l}: ${hotp(u.s, counterAt(Date.now()))}  (ใช้ได้อีก ${left} วินาที${u.e ? "" : " · ยังไม่ยืนยันการตั้งค่า"})`);
  }
}
db.close();
