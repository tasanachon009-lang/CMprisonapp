import Link from "next/link";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingTasks, taskCounts, systemReport, type BstFilter } from "@/lib/queries/bst";
import { DONE_BUTTON_LABEL } from "@/lib/services/followup";
import { currentFiscalYear, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState, Stat } from "@/components/ui";
import { BstTaskList } from "../bst/task-list";
import { FyPicker } from "../bst/fy-picker";

export const dynamic = "force-dynamic";

const pctText = (p: number | null) => (p == null ? "-" : `${p}%`);
const pctCls = (p: number | null) => (p == null ? "text-muted" : p >= 100 ? "text-ok" : p >= 80 ? "text-warn" : "font-semibold text-danger");

/** งาน รท.101 (สเปก 14.2) — 1 งานต่อคนต่อหลักสูตรเมื่อ "ครบหลักสูตร" · ไม่มีหลายขั้น ไม่มีติดตาม */
export default async function Rt101Page({ searchParams }: PageProps<"/rt101">) {
  const auth = await requirePage("bst.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const filter = (["overdue", "all"].includes(String(sp.f)) ? sp.f : "all") as BstFilter;
  const fy = Number(sp.fy) || currentFiscalYear();
  const counts = taskCounts(db, "rt101", today);
  const tasks = pendingTasks(db, "rt101", filter, today);
  const report = systemReport(db, "rt101", fy, today);
  const t = report.total.rt101!;
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "งาน รท.101" }]} />
      <PageHeader en="RT.101 Records" title="งาน รท.101 — บันทึกผ่านการฟื้นฟู" help="ผู้ครบหลักสูตรต้องลงในระบบข้อมูลผู้ต้องขัง (รท.101) ว่าผ่านการฟื้นฟูแล้ว คนละ 1 ครั้งต่อหลักสูตร เลือกหลายคนแล้วกด “ลง รท.101 แล้ว”" actions={<Link href={`/print/bst?s=rt101&f=${filter}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์เช็คลิสต์ค้างลง</Link>} />

      <section className="card grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat value={counts.total} label="รท.101 ค้างลง (คน)" href={`?f=all&fy=${fy}`} tone={counts.total ? "warn" : "ok"} />
        <Stat value={counts.overdue} label="เลยกำหนด" tone={counts.overdue ? "danger" : "ok"} href={`?f=overdue&fy=${fy}`} />
        <Stat value={pctText(t.pct)} label={`ลงครบ ปีงบ ${fy} (${t.done}/${t.completed} คน)`} />
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {([["all", "ค้างทั้งหมด", counts.total], ["overdue", "เลยกำหนด", counts.overdue]] as const).map(([f, label, n]) => (
            <Link key={f} href={`?f=${f}&fy=${fy}`} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ${filter === f ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>
              {label}<span className={`rounded-full px-2 text-sm ${f === "overdue" && n ? "bg-danger text-white" : "bg-lime text-ink"}`}>{n}</span>
            </Link>
          ))}
        </div>
        {tasks.length === 0 ? <EmptyState title="ไม่มีผู้จบหลักสูตรที่ค้างลง รท.101 👍" /> : (
          <BstTaskList
            today={today}
            canEdit={auth.can("bst.edit")}
            doneLabel={DONE_BUTTON_LABEL.rt101}
            rows={tasks.map((x) => ({
              id: x.t.id, enrollmentId: x.e.id, name: `${x.p.prefix ?? ""}${x.p.firstName} ${x.p.lastName}`, inmateNo: x.inc.inmateNo,
              cohort: x.label, step: null, dueDate: x.t.dueDate ?? "", reason: x.inc.releasedDate ? "ออกจากเรือนจำแล้ว — ยังต้องลง" : x.t.reason,
            }))}
          />
        )}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl">ตัวชี้วัด รท.101 ปีงบ {fy}</h2>
          <FyPicker fy={fy} current={currentFiscalYear()} />
        </div>
        <div className="overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>รุ่น</th><th>ผู้ครบหลักสูตร</th><th>ลง รท.101 แล้ว</th><th>ค้าง</th><th>% ลงครบ</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.c.id}>
                  <td><Link href={`/cohorts/${r.c.id}`} className="hover:underline">{r.label}</Link></td>
                  <td>{r.rt101!.completed}</td><td>{r.rt101!.done}</td><td>{r.rt101!.pending || "-"}</td>
                  <td className={pctCls(r.rt101!.pct)}>{pctText(r.rt101!.pct)}</td>
                </tr>
              ))}
              {report.courses.map((c) => (
                <tr key={`c${c.course.id}`} className="bg-cream font-semibold">
                  <td>รวม {c.course.shortName}</td><td>{c.rt101!.completed}</td><td>{c.rt101!.done}</td><td>{c.rt101!.pending || "-"}</td><td>{pctText(c.rt101!.pct)}</td>
                </tr>
              ))}
              {report.rows.length > 0 && <tr className="font-bold"><td>รวมทั้งปีงบ</td><td>{t.completed}</td><td>{t.done}</td><td>{t.pending || "-"}</td><td>{pctText(t.pct)}</td></tr>}
              {!report.rows.length && <tr><td colSpan={5} className="text-muted">ไม่มีรุ่นที่ต้องลง รท.101 ในปีงบนี้</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
