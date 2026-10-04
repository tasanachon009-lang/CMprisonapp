/**
 * กู้คืนไฟล์ฐานข้อมูลจากไฟล์สำรอง ขณะที่บริการหยุดอยู่ (update.ps1 ใช้ตอนย้อนกลับ)
 *   npx tsx scripts/restore-cli.mts <ชื่อไฟล์.rhbk>
 * การกู้คืนปกติให้ทำผ่านหน้าเว็บ (ยืนยัน 2 คน)
 */
import fs from "node:fs";
import path from "node:path";
if (fs.existsSync(".env")) process.loadEnvFile(".env");
const { config } = await import("../src/lib/config");
const { decryptFile, sha256File } = await import("../src/lib/backup/crypto");
const Database = (await import("better-sqlite3")).default;

const name = process.argv[2];
if (!name) {
  console.error("ใช้: npx tsx scripts/restore-cli.mts <ชื่อไฟล์.rhbk>");
  process.exit(1);
}
const src = path.isAbsolute(name) ? name : path.join(config.localBackupDir, name);
const shaFile = src + ".sha256";
if (fs.existsSync(shaFile) && (await sha256File(src)) !== fs.readFileSync(shaFile, "utf8").split(/\s+/)[0]) {
  console.error("✗ checksum ไม่ตรง ไฟล์สำรองอาจเสีย");
  process.exit(1);
}
const tmp = config.dbPath + ".restoring";
await decryptFile(src, tmp, config.backupKey);
const t = new Database(tmp, { readonly: true });
const ok = t.pragma("integrity_check", { simple: true }) === "ok";
t.close();
if (!ok) {
  fs.rmSync(tmp, { force: true });
  console.error("✗ ไฟล์สำรองไม่สมบูรณ์");
  process.exit(1);
}
for (const ext of ["-wal", "-shm"]) fs.rmSync(config.dbPath + ext, { force: true });
if (fs.existsSync(config.dbPath)) fs.renameSync(config.dbPath, config.dbPath + `.before-restore-${Date.now()}`);
fs.renameSync(tmp, config.dbPath);
console.log(`✓ กู้คืนฐานข้อมูลจาก ${path.basename(src)} แล้ว`);
