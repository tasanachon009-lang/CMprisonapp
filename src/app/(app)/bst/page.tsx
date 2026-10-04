import Link from "next/link";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingTasks, taskCounts, dueFollowups, bstSummaryByCohort, type BstFilter } from "@/lib/queries/bst";
import { SYSTEM_LABEL, STEP_LABEL } from "@/lib/services/followup";
import { currentFiscalYear, formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState, Stat } from "@/components/ui";
import { BstTaskList } from "./task-list";

export const dynamic = "force-dynamic";

/** งาน บสต./รท.101 (สเปก 14) — โปรแกรมไม่เชื่อม บสต. โดยตรง: เตือนและเช็คว่าลงแล้วหรือยัง */
export default async function BstPage({ searchParams }: PageProps<"/bst">) {
  const auth = await requirePage("bst.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const filter = (["today", "week", "overdue", "all"].includes(String(sp.f)) ? sp.f : "overdue") as BstFilter;
  const system = sp.s === "bst" || sp.s === "rt101" ? sp.s : undefined;
  const counts = taskCounts(db, today);
  const tasks = pendingTasks(db, filter, today, system);
  const fus = dueFollowups(db, today);
  const fy = currentFiscalYear();
  const summary = [...bstSummaryByCohort(db, fy - 1, today), ...bstSummaryByCohort(db, fy, today)];
  const tab = (f: BstFilter, label: string, n?: number) => (
    <Link href={`?f=${f}${system ? `&s=${system}` : ""}`} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ${filter === f ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>
      {label}{n != null && <span className={`rounded-full px-2 text-sm ${f === "overdue" && n ? "bg-danger text-white" : "bg-lime text-ink"}`}>{n}</span>}
    </Link>
  );
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "งาน บสต./รท.101" }]} />
      <PageHeader en="Follow-up Records" title="งาน บสต./รท.101 และการติดตาม" subtitle="กด &quot;ลงแล้ว&quot; หลังลงข้อมูลในระบบ บสต./รท.101 — ระบบเตือนซ้ำจนกว่าจะกด" actions={<Link href={`/print/bst?f=${filter}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์เช็คลิสต์ค้างลง</Link>} />

      <section className="card grid grid-cols-3 gap-2">
        <Stat value={counts.today} label="ครบกำหนดวันนี้" href="?f=today" />
        <Stat value={counts.week} label="ภายใน 7 วัน" href="?f=week" />
        <Stat value={counts.overdue} label="เลยกำหนด" tone={counts.overdue ? "danger" : "ok"} href="?f=overdue" />
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {tab("overdue", "เลยกำหนด", counts.overdue)}
          {tab("today", "วันนี้", counts.today)}
          {tab("week", "7 วันข้างหน้า", counts.week)}
          {tab("all", "ค้างทั้งหมด")}
          <span className="ml-auto flex gap-1">
            {[["", "ทุกระบบ"], ["bst", "บสต."], ["rt101", "รท.101"]].map(([s, l]) => (
              <Link key={s} href={`?f=${filter}${s ? `&s=${s}` : ""}`} className={`inline-flex min-h-9 items-center rounded-full px-3 text-sm font-semibold ${(system ?? "") === s ? "bg-navy text-white" : "border border-line bg-white"}`}>{l}</Link>
            ))}
          </span>
        </div>
        {tasks.length === 0 ? <EmptyState title="ไม่มีงานค้างในช่วงนี้ 👍" /> : (
          <BstTaskList
            today={today}
            canEdit={auth.can("bst.edit")}
            rows={tasks.map((x) => ({
              id: x.t.id, enrollmentId: x.e.id, name: `${x.p.prefix ?? ""}${x.p.firstName} ${x.p.lastName}`, inmateNo: x.inc.inmateNo,
              cohort: x.label, system: SYSTEM_LABEL[x.t.system], step: STEP_LABEL[x.t.step] ?? x.t.step, dueDate: x.t.dueDate ?? "", reason: x.t.reason,
            }))}
          />
        )}
      </section>

      <section className="card">
        <h2 className="text-xl">ติดตามหลังบำบัดที่ถึงกำหนด (ภายใน 14 วัน / เลยกำหนด)</h2>
        {fus.length === 0 ? <EmptyState title="ไม่มีรายการ" /> : (
          <ul className="mt-3 divide-y divide-line">
            {fus.map((x) => (
              <li key={x.f.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/enrollments/${x.e.id}`} className="font-medium hover:underline">{x.p.firstName} {x.p.lastName}</Link>
                <span className="text-sm text-muted">{x.inc.inmateNo} · {x.course.shortName} รุ่นที่ {x.c.number}/{x.c.fiscalYear}</span>
                <span className="tag-navy">เดือนที่ {x.f.monthOffset}</span>
                <span className={x.f.dueDate < today ? "tag-danger" : "tag-warn"}>กำหนด {formatThaiDate(x.f.dueDate)}</span>
                <Link href={`/enrollments/${x.e.id}`} className="btn-ghost btn-sm ml-auto">บันทึกผล</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <h2 className="text-xl">ความครบถ้วนรายรุ่น (ปีงบ {fy - 1}–{fy})</h2>
        <div className="mt-3 overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>รุ่น</th><th>งานที่ถึงกำหนด</th><th>ลงแล้ว</th><th>% ครบถ้วน</th><th>ติดตามไม่ได้/ปิด (ไม่นับค้าง)</th><th>ไม่กลับไปเสพซ้ำ (จากผลติดตาม)</th></tr></thead>
            <tbody>
              {summary.map((s) => (
                <tr key={s.c.id}>
                  <td><Link href={`/cohorts/${s.c.id}`} className="hover:underline">{s.label}</Link></td>
                  <td>{s.due}</td><td>{s.done}</td>
                  <td className={s.pct != null && s.pct < 100 ? "font-semibold text-warn" : "text-ok"}>{s.pct ?? "-"}{s.pct != null && "%"}</td>
                  <td>{s.excluded}</td>
                  <td>{s.relapse.pct != null ? `${s.relapse.pct}% (${s.relapse.noRelapse}/${s.relapse.people} คน)` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
