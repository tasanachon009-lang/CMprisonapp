import { desc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { backupHealth } from "@/lib/backup/status";
import { listBackups } from "@/lib/backup/runner";
import { formatThaiDateTime, formatThaiDate } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { BackupActions, BackupDirsForm, RestoreRequest } from "./backup-client";

export const dynamic = "force-dynamic";

const KIND: Record<string, string> = { scheduled: "อัตโนมัติ (เวลาราชการ)", nightly: "อัตโนมัติ (กลางคืน)", manual: "สำรองทันที", pre_update: "ก่อนอัปเดต", pre_restore: "ก่อนกู้คืน", removable: "ลงดิสก์ถอดเก็บ" };
const gb = (b: number) => `${(b / 1024 ** 3).toFixed(1)} GB`;
const mb = (b: number | null) => (b == null ? "-" : `${(b / 1024 ** 2).toFixed(2)} MB`);

export default async function BackupPage() {
  await requirePage("backup.manage");
  const db = getDb();
  const h = backupHealth(db);
  const runs = db.select().from(schema.backupRuns).orderBy(desc(schema.backupRuns.id)).limit(20).all();
  const tests = db.select().from(schema.restoreTests).orderBy(desc(schema.restoreTests.id)).limit(5).all();
  const files = listBackups(h.targets.local);
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "สำรอง/กู้คืนข้อมูล" }]} />
      <PageHeader en="Backup & Restore" title="สำรองและกู้คืนข้อมูล" help="สำรองอัตโนมัติทุก 4 ชั่วโมงในเวลาราชการ (08.00 12.00 16.00) และทุกคืน 22.00 น. เข้ารหัส AES-256 ทดสอบกู้คืนอัตโนมัติทุกวันอาทิตย์" />
      {h.problems.length > 0 ? <Alert tone="danger">{h.problems.map((p) => <p key={p}>• {p}</p>)}</Alert> : <Alert tone="ok">ระบบสำรองข้อมูลปกติ</Alert>}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="card"><p className="text-sm text-muted">สำรองสำเร็จล่าสุด</p><p className="mt-1 text-lg font-semibold">{h.lastSuccess ? formatThaiDateTime(h.lastSuccess.startedAt) : "ยังไม่เคย"}</p></div>
        <div className="card"><p className="text-sm text-muted">ทดสอบกู้คืนล่าสุด</p><p className="mt-1 text-lg font-semibold">{h.lastTest ? `${formatThaiDateTime(h.lastTest.at)} — ${h.lastTest.status === "success" ? "ผ่าน" : "ไม่ผ่าน"}` : "ยังไม่เคย"}</p></div>
        <div className="card"><p className="text-sm text-muted">ฮาร์ดดิสก์ภายนอก (ชุดที่ 2)</p><p className={`mt-1 text-lg font-semibold ${h.externalOk ? "text-ok" : "text-danger"}`}>{!h.targets.external ? "ยังไม่ได้ตั้งค่า" : h.externalOk ? `เชื่อมต่อ${h.externalDisk ? ` · เหลือ ${gb(h.externalDisk.free)} (ใช้ ${h.externalDisk.usedPct}%)` : ""}` : "ไม่ได้เชื่อมต่อ"}</p></div>
        <div className="card"><p className="text-sm text-muted">ดิสก์ในเครื่อง (ชุดที่ 1)</p><p className="mt-1 text-lg font-semibold">{h.localDisk ? `เหลือ ${gb(h.localDisk.free)} (ใช้ ${h.localDisk.usedPct}%)` : "-"}</p><p className="text-sm text-muted">ดิสก์ถอดเก็บล่าสุด: {h.lastRemovable ? formatThaiDateTime(h.lastRemovable) : "ยังไม่เคย"}</p></div>
      </section>

      <BackupActions />
      <BackupDirsForm externalDir={h.targets.external} removableDir={h.targets.removable} localDir={h.targets.local} />

      <section className="card">
        <h2 className="text-xl">ประวัติการสำรอง</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>เวลา</th><th>ประเภท</th><th>ผล</th><th>ขนาด</th><th>ชุดที่ 2 / 3</th></tr></thead>
            <tbody>
              {runs.map((r) => {
                const t = (r.targets ?? {}) as { external?: boolean | null; removable?: boolean | null };
                return (
                  <tr key={r.id}>
                    <td>{formatThaiDateTime(r.startedAt)}</td><td>{KIND[r.kind] ?? r.kind}</td>
                    <td>{r.status === "success" ? <span className="tag-ok">สำเร็จ</span> : r.status === "running" ? <span className="tag-warn">กำลังทำ</span> : <span className="tag-danger" title={r.error ?? ""}>ล้มเหลว</span>}</td>
                    <td>{mb(r.sizeBytes)}</td>
                    <td className="text-sm">{t.external == null ? "-" : t.external ? "✓" : "✗"} / {t.removable == null ? "-" : t.removable ? "✓" : "✗"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {tests.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold">ทดสอบกู้คืน</h3>
            <ul className="text-sm">{tests.map((t) => <li key={t.id}>{formatThaiDateTime(t.at)} — {t.status === "success" ? "ผ่าน" : "ไม่ผ่าน"} ({t.backupFile})</li>)}</ul>
          </div>
        )}
      </section>

      <RestoreRequest files={files.slice(0, 60).map((f) => ({ name: f.name, label: `${formatThaiDate(f.date)} ${f.time.slice(0, 2)}:${f.time.slice(2)} น. · ${mb(f.size)} · ${f.name.split("-").pop()?.replace(".rhbk", "")}` }))} />
    </div>
  );
}
