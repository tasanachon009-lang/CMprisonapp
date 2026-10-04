import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import Database from "better-sqlite3";
import { desc, eq } from "drizzle-orm";
import { getDb, getSqlite, schema, closeDb, type DB } from "../db";
import { config } from "../config";
import { getSetting } from "../bootstrap";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { encryptFile, decryptFile, sha256File } from "./crypto";
import { filesToKeep, parseBackupName } from "./retention";
import { nowInTZ, todayISO } from "../thai-date";

/** ตารางที่นับจำนวนแถวไว้เทียบตอนทดสอบกู้คืน */
const COUNT_TABLES = ["users", "persons", "incarcerations", "enrollments", "cohorts", "cohort_sessions", "attendance", "audit_logs"];

export type BackupKind = "scheduled" | "nightly" | "manual" | "pre_update" | "pre_restore" | "removable";

function stamp() {
  const t = nowInTZ();
  const s = new Date().getSeconds();
  return `${t.date.replace(/-/g, "")}-${String(t.hour).padStart(2, "0")}${String(t.minute).padStart(2, "0")}${String(s).padStart(2, "0")}`;
}

export function rowCounts(sqlite: Database.Database) {
  const out: Record<string, number> = {};
  for (const t of COUNT_TABLES) out[t] = (sqlite.prepare(`SELECT count(*) AS n FROM ${t}`).get() as { n: number }).n;
  return out;
}

export function backupTargets(db: DB) {
  return {
    local: config.localBackupDir,
    external: getSetting(db, "backup.externalDir", "") || process.env.BACKUP_EXTERNAL_DIR || "",
    removable: getSetting(db, "backup.removableDir", "") || "",
  };
}

export function isDirReachable(dir: string) {
  if (!dir) return false;
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * สำรองข้อมูล 1 รอบ:
 * SQLite online backup → เข้ารหัส AES-256 → ชุดที่ 1 (ในเครื่อง) → คัดลอกชุดที่ 2 (ดิสก์ภายนอก)
 * ตรวจ checksum ทุกสำเนา
 */
export async function runBackup(kind: BackupKind, userId: number | null = null) {
  const db = getDb();
  const sqlite = getSqlite();
  if (!config.backupKey) throw new Error("ยังไม่ได้ตั้ง BACKUP_KEY ใน .env");
  const run = db.insert(schema.backupRuns).values({ startedAt: new Date(), kind, status: "running", triggeredBy: userId }).returning().get();
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rehab-bk-"));
  const targets = backupTargets(db);
  const result: Record<string, boolean | null> = { local: false, external: null, removable: null };
  try {
    const raw = path.join(tmpDir, "snapshot.db");
    await sqlite.backup(raw); // online backup API — ไม่คัดลอกไฟล์ขณะมีการเขียน
    const snap = new Database(raw, { readonly: true });
    const integrity = snap.pragma("integrity_check", { simple: true });
    const counts = rowCounts(snap);
    snap.close();
    if (integrity !== "ok") throw new Error(`ตรวจความสมบูรณ์ฐานข้อมูลไม่ผ่าน: ${integrity}`);

    const name = `rehab-${stamp()}-${kind}.rhbk`;
    fs.mkdirSync(targets.local, { recursive: true });
    const localFile = path.join(targets.local, name);
    await encryptFile(raw, localFile, config.backupKey);
    const sha = await sha256File(localFile);
    fs.writeFileSync(localFile + ".sha256", `${sha}  ${name}\n`);
    result.local = true;

    const copyTo = async (dir: string, label: "external" | "removable") => {
      if (!isDirReachable(dir)) return false;
      const dest = path.join(dir, name);
      fs.copyFileSync(localFile, dest);
      fs.copyFileSync(localFile + ".sha256", dest + ".sha256");
      const ok = (await sha256File(dest)) === sha;
      if (!ok) throw new Error(`checksum ของสำเนาใน${label === "external" ? "ดิสก์ภายนอก" : "ดิสก์ถอดเก็บ"}ไม่ตรง`);
      return true;
    };
    if (kind === "removable") {
      if (!targets.removable) throw new Error("ยังไม่ได้ตั้งตำแหน่งฮาร์ดดิสก์ถอดเก็บในหน้าตั้งค่า");
      result.removable = await copyTo(targets.removable, "removable");
      if (!result.removable) throw new Error("ไม่พบฮาร์ดดิสก์ถอดเก็บ กรุณาเสียบดิสก์แล้วลองใหม่");
      db.insert(schema.settings).values({ key: "backup.lastRemovableAt", value: Date.now() }).onConflictDoUpdate({ target: schema.settings.key, set: { value: Date.now() } }).run();
    }
    if (targets.external) result.external = await copyTo(targets.external, "external");

    const size = fs.statSync(localFile).size;
    db.update(schema.backupRuns)
      .set({ finishedAt: new Date(), status: "success", fileName: name, sizeBytes: size, sha256: sha, targets: result, rowCounts: counts })
      .where(eq(schema.backupRuns.id, run.id))
      .run();
    writeAudit(db, { userId, action: "backup", entity: "backup", entityId: run.id, after: { kind, name, targets: result } });
    if (targets.external && result.external === false) {
      notify(db, { role: "admin", severity: "danger", kind: "backup_external_missing", message: "สำรองข้อมูลลงดิสก์ภายนอกไม่ได้ (ดิสก์หลุดหรือไม่ได้เสียบ) — สำรองในเครื่องสำเร็จ", link: "/admin/backup" });
    }
    applyRetention(targets.local);
    if (result.external) applyRetention(targets.external);
    return { ok: true as const, name, size, sha, targets: result };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.update(schema.backupRuns).set({ finishedAt: new Date(), status: "failed", error: msg, targets: result }).where(eq(schema.backupRuns.id, run.id)).run();
    notify(db, { role: "admin", severity: "danger", kind: "backup_failed", message: `สำรองข้อมูลล้มเหลว: ${msg}`, link: "/admin/backup" });
    // TODO ขั้น 3: แจ้ง LINE ผู้ดูแล (ไม่มีข้อมูลผู้ต้องขัง)
    return { ok: false as const, error: msg };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

export function applyRetention(dir: string) {
  try {
    const files = fs.readdirSync(dir).map(parseBackupName).filter((f): f is NonNullable<typeof f> => !!f);
    const keep = filesToKeep(files, todayISO());
    for (const f of files) {
      if (keep.has(f.name)) continue;
      fs.rmSync(path.join(dir, f.name), { force: true });
      fs.rmSync(path.join(dir, f.name + ".sha256"), { force: true });
    }
  } catch {
    /* โฟลเดอร์ไม่พร้อม — ข้าม */
  }
}

export function listBackups(dir: string) {
  try {
    return fs
      .readdirSync(dir)
      .map(parseBackupName)
      .filter((f): f is NonNullable<typeof f> => !!f)
      .sort((a, b) => b.name.localeCompare(a.name))
      .map((f) => ({ ...f, size: fs.statSync(path.join(dir, f.name)).size }));
  } catch {
    return [];
  }
}

/** ทดสอบกู้คืนอัตโนมัติ: ถอดรหัสไฟล์ล่าสุดลงฐานทดสอบ → integrity check → นับแถวเทียบ */
export async function runRestoreTest() {
  const db = getDb();
  const last = db.select().from(schema.backupRuns).where(eq(schema.backupRuns.status, "success")).orderBy(desc(schema.backupRuns.id)).limit(1).get();
  if (!last?.fileName) {
    db.insert(schema.restoreTests).values({ at: new Date(), backupFile: "-", status: "failed", detail: { error: "ยังไม่มีไฟล์สำรอง" } }).run();
    return { ok: false, error: "ยังไม่มีไฟล์สำรอง" };
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rehab-rt-"));
  try {
    const file = path.join(config.localBackupDir, last.fileName);
    const out = path.join(tmpDir, "restore-test.db");
    const expectedSha = fs.readFileSync(file + ".sha256", "utf8").split(/\s+/)[0];
    if ((await sha256File(file)) !== expectedSha) throw new Error("checksum ไฟล์สำรองไม่ตรง (ไฟล์อาจเสีย)");
    await decryptFile(file, out, config.backupKey);
    const t = new Database(out, { readonly: true });
    const integrity = t.pragma("integrity_check", { simple: true });
    const counts = rowCounts(t);
    t.close();
    const expected = (last.rowCounts ?? {}) as Record<string, number>;
    const mismatch = Object.keys(expected).filter((k) => expected[k] !== counts[k]);
    const ok = integrity === "ok" && mismatch.length === 0;
    db.insert(schema.restoreTests).values({ at: new Date(), backupFile: last.fileName, status: ok ? "success" : "failed", detail: { integrity, counts, expected, mismatch } }).run();
    if (!ok) notify(db, { role: "admin", severity: "danger", kind: "restore_test_failed", message: "ทดสอบกู้คืนข้อมูลอัตโนมัติไม่ผ่าน กรุณาตรวจสอบ", link: "/admin/backup" });
    return { ok, counts, mismatch };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    db.insert(schema.restoreTests).values({ at: new Date(), backupFile: last.fileName, status: "failed", detail: { error: msg } }).run();
    notify(db, { role: "admin", severity: "danger", kind: "restore_test_failed", message: `ทดสอบกู้คืนข้อมูลอัตโนมัติไม่ผ่าน: ${msg}`, link: "/admin/backup" });
    return { ok: false, error: msg };
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

/**
 * กู้คืนจากไฟล์สำรอง (เรียกหลังผ่านการยืนยัน 2 คนแล้วเท่านั้น)
 * สำรองข้อมูลปัจจุบันก่อนเสมอ → ถอดรหัส → ตรวจ → แทนที่ไฟล์ฐานข้อมูล
 */
export async function restoreFromBackup(fileName: string, userId: number) {
  const pre = await runBackup("pre_restore", userId);
  if (!pre.ok) throw new Error(`สำรองข้อมูลปัจจุบันก่อนกู้คืนไม่สำเร็จ จึงยกเลิกการกู้คืน: ${pre.error}`);
  const src = path.join(config.localBackupDir, path.basename(fileName));
  const shaFile = src + ".sha256";
  if (fs.existsSync(shaFile)) {
    const expected = fs.readFileSync(shaFile, "utf8").split(/\s+/)[0];
    if ((await sha256File(src)) !== expected) throw new Error("checksum ไฟล์สำรองไม่ตรง ไม่สามารถกู้คืนได้");
  }
  const tmp = config.dbPath + ".restoring";
  await decryptFile(src, tmp, config.backupKey);
  const t = new Database(tmp, { readonly: true });
  const integrity = t.pragma("integrity_check", { simple: true });
  t.close();
  if (integrity !== "ok") {
    fs.rmSync(tmp, { force: true });
    throw new Error("ไฟล์สำรองไม่สมบูรณ์ ยกเลิกการกู้คืน");
  }
  closeDb();
  for (const ext of ["-wal", "-shm"]) fs.rmSync(config.dbPath + ext, { force: true });
  fs.renameSync(tmp, config.dbPath);
  const db = getDb(); // เปิดใหม่ + migration ถ้าไฟล์เก่ากว่าโปรแกรม
  writeAudit(db, { userId, action: "restore", entity: "backup", note: `กู้คืนจาก ${fileName} (สำรองก่อนกู้: ${pre.name})` });
  return { preBackup: pre.name };
}
