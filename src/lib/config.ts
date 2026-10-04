import path from "node:path";

/**
 * ค่าตั้งจาก .env — อ่านที่เดียว
 * DATA_DIR แยกได้ระหว่าง "ใช้จริง" กับ "ทดสอบ" (สภาพแวดล้อมทดสอบใช้โฟลเดอร์คนละที่)
 */
export const config = {
  dataDir: path.resolve(process.env.DATA_DIR ?? "./data"),
  get dbPath() {
    return path.join(this.dataDir, "rehab.db");
  },
  get uploadsDir() {
    return path.join(this.dataDir, "uploads");
  },
  get localBackupDir() {
    return path.resolve(process.env.BACKUP_LOCAL_DIR ?? path.join(this.dataDir, "..", "backups"));
  },
  /** กุญแจเข้ารหัสไฟล์สำรอง (hex 64 ตัว = 256 บิต) */
  backupKey: process.env.BACKUP_KEY ?? "",
  /** ป้ายสภาพแวดล้อม: production | staging | development */
  envLabel: process.env.APP_ENV ?? "development",
  /** โหมดฝึกหัด/สาธิต ใช้ข้อมูลปลอม */
  isTraining: process.env.APP_ENV === "training",
  timeZone: "Asia/Bangkok",
};
