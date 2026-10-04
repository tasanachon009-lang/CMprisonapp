/**
 * สำรองข้อมูลจากบรรทัดคำสั่ง (update.ps1 เรียกก่อนอัปเดต)
 *   npx tsx scripts/backup-now.ts pre_update
 * ใช้ SQLite online backup — ปลอดภัยแม้ระบบกำลังทำงาน
 */
import fs from "node:fs";
if (fs.existsSync(".env")) process.loadEnvFile(".env");

const kind = (process.argv[2] ?? "manual") as "manual" | "pre_update";
const { runBackup } = await import("../src/lib/backup/runner");
const r = await runBackup(kind, null);
if (r.ok) {
  console.log(`✓ สำรองข้อมูลแล้ว: ${r.name}`);
  process.exit(0);
} else {
  console.error(`✗ สำรองข้อมูลไม่สำเร็จ: ${r.error}`);
  process.exit(1);
}
