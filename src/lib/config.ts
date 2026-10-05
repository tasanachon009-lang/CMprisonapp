import path from "node:path";

/**
 * ค่าตั้งจาก .env — อ่านที่เดียว
 * DATA_DIR แยกได้ระหว่าง "ใช้จริง" กับ "ทดสอบ" (สภาพแวดล้อมทดสอบใช้โฟลเดอร์คนละที่)
 * (turbopackIgnore: โฟลเดอร์ข้อมูลอยู่นอกโค้ด ไม่ต้องรวมตอน build)
 */
export const config = {
  dataDir: path.resolve(/*turbopackIgnore: true*/ process.env.DATA_DIR ?? "./data"),
  get dbPath() {
    return path.join(/*turbopackIgnore: true*/ this.dataDir, "rehab.db");
  },
  get uploadsDir() {
    return path.join(/*turbopackIgnore: true*/ this.dataDir, "uploads");
  },
  get localBackupDir() {
    return path.resolve(/*turbopackIgnore: true*/ process.env.BACKUP_LOCAL_DIR ?? path.join(this.dataDir, "..", "backups"));
  },
  /** กุญแจเข้ารหัสไฟล์สำรอง (hex 64 ตัว = 256 บิต) */
  backupKey: process.env.BACKUP_KEY ?? "",
  /** ป้ายสภาพแวดล้อม: production | staging | development | training */
  envLabel: process.env.APP_ENV ?? "development",
  /** โหมดฝึกหัด/สาธิต ใช้ข้อมูลปลอม */
  isTraining: process.env.APP_ENV === "training",
  timeZone: "Asia/Bangkok",
  /** LINE Messaging API — ใส่ใน .env ที่เครื่องทำงานเท่านั้น (ห้ามส่งในแชต/ห้ามเข้า Git) · ไม่มี = โหมดทดลอง */
  lineToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? "",
};
