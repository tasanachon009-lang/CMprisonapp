import fs from "node:fs";
import { desc, eq } from "drizzle-orm";
import { schema, type DB } from "../db";
import { getSetting } from "../bootstrap";
import { backupTargets, isDirReachable } from "./runner";

export function diskUsage(dir: string): { total: number; free: number; usedPct: number } | null {
  try {
    const s = fs.statfsSync(dir);
    const total = s.blocks * s.bsize;
    const free = s.bavail * s.bsize;
    return { total, free, usedPct: total ? Math.round(((total - free) / total) * 100) : 0 };
  } catch {
    return null;
  }
}

/** สถานะสำรองข้อมูลสำหรับหน้าผู้ดูแล + แถบแดง */
export function backupHealth(db: DB) {
  const targets = backupTargets(db);
  const lastRun = db.select().from(schema.backupRuns).orderBy(desc(schema.backupRuns.id)).limit(1).get();
  const lastSuccess = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.status, "success")).orderBy(desc(schema.backupRuns.id)).limit(1).get();
  const lastTest = db.select().from(schema.restoreTests).orderBy(desc(schema.restoreTests.id)).limit(1).get();
  const lastRemovable = getSetting<number | null>(db, "backup.lastRemovableAt", null);
  const externalOk = targets.external ? isDirReachable(targets.external) : null;
  const localDisk = diskUsage(fs.existsSync(targets.local) ? targets.local : process.cwd());
  const externalDisk = externalOk ? diskUsage(targets.external) : null;

  const problems: string[] = [];
  if (lastRun?.status === "failed") problems.push(`สำรองข้อมูลครั้งล่าสุดล้มเหลว: ${lastRun.error ?? ""}`);
  if (!lastSuccess) problems.push("ยังไม่เคยสำรองข้อมูลสำเร็จ");
  else if (Date.now() - lastSuccess.startedAt.getTime() > 26 * 3600000) problems.push("ไม่ได้สำรองข้อมูลสำเร็จมาเกิน 1 วัน");
  if (!targets.external) problems.push("ยังไม่ได้ตั้งตำแหน่งฮาร์ดดิสก์ภายนอก (ชุดที่ 2)");
  else if (!externalOk) problems.push("ฮาร์ดดิสก์ภายนอกหลุด/ไม่ได้เสียบ — เสียบกลับแล้วระบบจะทำงานต่อเอง");
  if (localDisk && localDisk.usedPct > 80) problems.push(`พื้นที่ดิสก์ในเครื่องใช้ไปแล้ว ${localDisk.usedPct}%`);
  if (externalDisk && externalDisk.usedPct > 80) problems.push(`พื้นที่ฮาร์ดดิสก์ภายนอกใช้ไปแล้ว ${externalDisk.usedPct}%`);
  if (!lastRemovable || Date.now() - lastRemovable > 30 * 86400000) problems.push("ยังไม่ได้สำรองลงฮาร์ดดิสก์ถอดเก็บ (ชุดที่ 3) เกิน 30 วัน");
  if (lastTest && lastTest.status !== "success") problems.push("ทดสอบกู้คืนอัตโนมัติครั้งล่าสุดไม่ผ่าน");

  return { targets, lastRun, lastSuccess, lastTest, lastRemovable, externalOk, localDisk, externalDisk, problems };
}
