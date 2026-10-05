import { and, eq } from "drizzle-orm";
import { getDb, schema } from "./db";
import { addDays, nowInTZ, weekdayOf } from "./thai-date";
import { runBackup, runRestoreTest, backupTargets, isDirReachable } from "./backup/runner";
import { notify } from "./notify";
import { config } from "./config";

/**
 * งานตั้งเวลา (เวลาไทยเสมอ) — ถ้าเครื่องปิดตอนถึงเวลา จะทำรอบล่าสุดที่พลาดทันทีเมื่อเปิดเครื่อง
 * บันทึกผลทุกครั้งในตาราง job_runs
 */
type Job = { name: string; slots: (date: string) => string[] /* HH:MM */; run: () => Promise<string> };

const isWeekday = (d: string) => ![0, 6].includes(weekdayOf(d));

const JOBS: Job[] = [
  {
    name: "backup.office",
    slots: (d) => (isWeekday(d) ? ["08:00", "12:00", "16:00"] : []),
    run: async () => {
      const r = await runBackup("scheduled");
      if (!r.ok) throw new Error(r.error);
      return r.name;
    },
  },
  {
    name: "backup.nightly",
    slots: () => ["22:00"],
    run: async () => {
      const r = await runBackup("nightly");
      if (!r.ok) throw new Error(r.error);
      return r.name;
    },
  },
  {
    // เรื่องส่งเวรค้างเกินกำหนด → เตือนหัวหน้า/รอง
    name: "shift.overdue",
    slots: () => ["08:30"],
    run: async () => {
      const { notifyOverdue } = await import("./services/shift");
      return `แจ้ง ${notifyOverdue(getDb(), addDays(nowInTZ().date, 0))} เรื่อง`;
    },
  },
  {
    // สเปก 22B: คาบที่เลยวันแล้วยังไม่บันทึกผล → แจ้งหัวหน้า/รองวันถัดไป (ไม่มีข้อมูลผู้ต้องขัง)
    name: "report.overdue",
    slots: (d) => (isWeekday(d) ? ["08:30"] : []),
    run: async () => {
      const { overdueReports } = await import("./services/session-close");
      const db = getDb();
      const rows = overdueReports(db, nowInTZ().date);
      if (rows.length) notify(db, { role: "admin", severity: "warning", kind: "report_overdue", message: `มีคาบที่เลยวันแล้วยังไม่บันทึกผล ${rows.length} คาบ (${new Set(rows.map((r) => r.cohortId)).size} รุ่น) — ตามผู้รับผิดชอบประจำวัน/ผู้สอน`, link: "/" });
      return `ค้าง ${rows.length} คาบ`;
    },
  },
  {
    // ทุกวันศุกร์บ่าย เตือนพิมพ์ชุดกระดาษสำรองฉุกเฉินของสัปดาห์หน้า (สเปก 22B)
    name: "emergency.reminder",
    slots: (d) => (weekdayOf(d) === 5 ? ["13:00"] : []),
    run: async () => {
      notify(getDb(), { role: "rehab", severity: "info", kind: "emergency_kit", message: "วันศุกร์: กรุณาพิมพ์ \"ชุดกระดาษสำรองฉุกเฉิน\" ของสัปดาห์หน้า เก็บแฟ้มไว้ที่ห้องอบรม", link: "/print/emergency?days=3" });
      return "แจ้งแล้ว";
    },
  },
  {
    name: "restore.test",
    slots: (d) => (weekdayOf(d) === 0 ? ["23:00"] : []),
    run: async () => {
      const r = await runRestoreTest();
      if (!r.ok) throw new Error("error" in r ? r.error : "จำนวนข้อมูลไม่ตรง");
      return "ผ่าน";
    },
  },
];

/** รอบล่าสุดที่ควรทำแล้ว (ย้อนหลังไม่เกิน 7 วัน) */
export function latestDueSlot(job: Pick<Job, "slots">, now = nowInTZ()): string | null {
  const nowHM = `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
  for (let back = 0; back < 7; back++) {
    const d = addDays(now.date, -back);
    const due = job.slots(d).filter((hm) => back > 0 || hm <= nowHM).sort();
    if (due.length) return `${d}T${due[due.length - 1]}`;
  }
  return null;
}

const running = new Set<string>();

async function tick() {
  const db = getDb();
  for (const job of JOBS) {
    const slot = latestDueSlot(job);
    if (!slot || running.has(job.name)) continue;
    const done = db.select().from(schema.jobRuns).where(and(eq(schema.jobRuns.job, job.name), eq(schema.jobRuns.slot, slot))).get();
    if (done) continue;
    running.add(job.name);
    const row = db.insert(schema.jobRuns).values({ job: job.name, slot, startedAt: new Date(), status: "running" }).returning().get();
    try {
      const msg = await job.run();
      db.update(schema.jobRuns).set({ finishedAt: new Date(), status: "success", message: msg }).where(eq(schema.jobRuns.id, row.id)).run();
    } catch (e) {
      db.update(schema.jobRuns).set({ finishedAt: new Date(), status: "failed", message: e instanceof Error ? e.message : String(e) }).where(eq(schema.jobRuns.id, row.id)).run();
    } finally {
      running.delete(job.name);
    }
  }
}

// ตรวจฮาร์ดดิสก์ภายนอกทุก 5 นาที: หลุด → แจ้ง, เสียบกลับ → ทำงานต่อเอง
let lastExternal: boolean | null = null;
function checkExternal() {
  const db = getDb();
  const dir = backupTargets(db).external;
  if (!dir) return;
  const ok = isDirReachable(dir);
  if (lastExternal !== null && ok !== lastExternal) {
    notify(db, {
      role: "admin",
      severity: ok ? "info" : "danger",
      kind: ok ? "external_disk_back" : "external_disk_missing",
      message: ok ? "ฮาร์ดดิสก์ภายนอกกลับมาเชื่อมต่อแล้ว ระบบสำรองข้อมูลทำงานต่อตามปกติ" : "ฮาร์ดดิสก์ภายนอกหลุด/ไม่ได้เสียบ กรุณาตรวจสอบ",
      link: "/admin/backup",
    });
  }
  lastExternal = ok;
}

const g = globalThis as unknown as { __rehabScheduler?: boolean };

export function startScheduler() {
  if (g.__rehabScheduler) return;
  if (process.env.DISABLE_SCHEDULER === "true") return;
  if (!config.backupKey) {
    console.warn("[scheduler] ไม่มี BACKUP_KEY — ปิดการสำรองอัตโนมัติ");
    return;
  }
  g.__rehabScheduler = true;
  setTimeout(() => void tick(), 15000); // ทำงานที่พลาดหลังเปิดเครื่อง
  setInterval(() => void tick(), 60000);
  checkExternal();
  setInterval(checkExternal, 5 * 60000);
  console.log("[scheduler] เริ่มงานตั้งเวลา (เวลาไทย)");
}
