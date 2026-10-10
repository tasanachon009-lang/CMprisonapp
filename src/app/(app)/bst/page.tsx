import Link from "next/link";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingTasks, taskCounts, dueFollowups, systemReport, type BstFilter } from "@/lib/queries/bst";
import { STEP_LABEL, DONE_BUTTON_LABEL } from "@/lib/services/followup";
import { currentFiscalYear, formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState, Stat } from "@/components/ui";
import { BstTaskList } from "./task-list";
import { FyPicker } from "./fy-picker";

export const dynamic = "force-dynamic";

const pctText = (p: number | null) => (p == null ? "-" : `${p}%`);
const pctCls = (p: number | null) => (p == null ? "text-muted" : p >= 100 ? "text-ok" : p >= 80 ? "text-warn" : "font-semibold text-danger");

/** งาน บสต. (สเปก 14.1) — ลงทะเบียน → คัดกรอง → บำบัด → จำหน่าย → ติดตาม 1/3/6/12 · โปรแกรมไม่เชื่อม บสต. โดยตรง */
export default async function BstPage({ searchParams }: PageProps<"/bst">) {
  const auth = await requirePage("bst.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const filter = (["today", "week", "overdue", "all"].includes(String(sp.f)) ? sp.f : "overdue") as BstFilter;
  const fy = Number(sp.fy) || currentFiscalYear();
  const counts = taskCounts(db, "bst", today);
  const tasks = pendingTasks(db, "bst", filter, today);
  const fus = dueFollowups(db, today);
  const report = systemReport(db, "bst", fy, today);
  const t = report.total.bst!;
  const tab = (f: BstFilter, label: string, n?: number) => (
    <Link href={`?f=${f}&fy=${fy}`} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ${filter === f ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>
      {label}{n != null && <span className={`rounded-full px-2 text-sm ${f === "overdue" && n ? "bg-danger text-white" : "bg-lime text-ink"}`}>{n}</span>}
    </Link>
  );
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "งาน บสต." }]} />
      <PageHeader en="BST Records" title="งาน บสต. และการติดตามหลังบำบัด" help="กด “ลง บสต. แล้ว” หลังลงข้อมูลในระบบ บสต. ระบบจะเตือนจนกว่าจะบันทึก ผลการติดตามบันทึกในแฟ้มของแต่ละคน" actions={<Link href={`/print/bst?s=bst&f=${filter}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์เช็คลิสต์ค้างลง</Link>} />

      <section className="card grid grid-cols-3 gap-2">
        <Stat value={counts.today} label="ครบกำหนดวันนี้" href={`?f=today&fy=${fy}`} />
        <Stat value={counts.week} label="ภายใน 7 วัน" href={`?f=week&fy=${fy}`} />
        <Stat value={counts.overdue} label="เลยกำหนด" tone={counts.overdue ? "danger" : "ok"} href={`?f=overdue&fy=${fy}`} />
      </section>

      <section className="card space-y-3">
        <div className="flex flex-wrap gap-2">
          {tab("overdue", "เลยกำหนด", counts.overdue)}
          {tab("today", "วันนี้", counts.today)}
          {tab("week", "7 วันข้างหน้า", counts.week)}
          {tab("all", "ค้างทั้งหมด", counts.total)}
        </div>
        {tasks.length === 0 ? <EmptyState title="ไม่มีงาน บสต. ค้างในช่วงนี้ 👍" /> : (
          <BstTaskList
            today={today}
            canEdit={auth.can("bst.edit")}
            doneLabel={DONE_BUTTON_LABEL.bst}
            rows={tasks.map((x) => ({
              id: x.t.id, enrollmentId: x.e.id, name: `${x.p.prefix ?? ""}${x.p.firstName} ${x.p.lastName}`, inmateNo: x.inc.inmateNo,
              cohort: x.label, step: STEP_LABEL[x.t.step] ?? x.t.step, dueDate: x.t.dueDate ?? "", reason: x.t.reason,
            }))}
          />
        )}
      </section>

      <section className="card">
        <h2 className="text-xl">ติดตามหลังบำบัดที่ถึงกำหนด (ภายใน 14 วัน / เลยกำหนด)</h2>
        <p className="text-sm text-muted">นับจากวันจำหน่าย (เดือนที่ 1, 3, 6, 12)</p>
        {fus.length === 0 ? <EmptyState title="ไม่มีรายการ" /> : (
          <ul className="mt-3 divide-y divide-line">
            {fus.map((x) => (
              <li key={x.f.id} className="flex flex-wrap items-center gap-3 py-2">
                <Link href={`/enrollments/${x.e.id}`} className="font-medium hover:underline">{x.p.firstName} {x.p.lastName}</Link>
                <span className="text-sm text-muted">{x.inc.inmateNo} · {x.course.shortName} รุ่นที่ {x.c.number}/{x.c.fiscalYear}</span>
                <span className="tag-navy">ครั้งที่ {x.f.seq} (เดือนที่ {x.f.monthOffset})</span>
                <span className={x.f.dueDate < today ? "tag-danger" : "tag-warn"}>กำหนด {formatThaiDate(x.f.dueDate)}</span>
                <Link href={`/enrollments/${x.e.id}`} className="btn-ghost btn-sm ml-auto">บันทึกผล</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl">ตัวชี้วัด บสต. ปีงบ {fy}</h2>
          <FyPicker fy={fy} current={currentFiscalYear()} />
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          <Stat value={pctText(t.register.pct)} label={`ลงทะเบียน บสต. ครบ (${t.register.done}/${t.register.due} คน)`} />
          <Stat value={pctText(t.followup4.pct)} label={`ติดตามครบ 4 ครั้ง (${t.followup4.complete}/${t.followup4.eligible} คน)`} />
          <Stat value={pctText(t.relapse.pct)} label={`ไม่กลับไปเสพซ้ำ (${t.relapse.noRelapse}/${t.relapse.people} คน จากผลติดตาม)`} />
        </div>
        <div className="overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>รุ่น</th><th>ลงทะเบียนครบ</th><th>ทุกขั้นที่ถึงกำหนด</th><th>ค้าง</th><th>ติดตามครบ 4 ครั้ง</th><th>ติดตามไม่ได้/ปิด (คน)</th><th>ไม่เสพซ้ำ</th></tr></thead>
            <tbody>
              {report.rows.map((r) => (
                <tr key={r.c.id}>
                  <td><Link href={`/cohorts/${r.c.id}`} className="hover:underline">{r.label}</Link></td>
                  <td className={pctCls(r.bst!.register.pct)}>{pctText(r.bst!.register.pct)} <span className="text-xs text-muted">({r.bst!.register.done}/{r.bst!.register.due})</span></td>
                  <td className={pctCls(r.bst!.allSteps.pct)}>{pctText(r.bst!.allSteps.pct)} <span className="text-xs text-muted">({r.bst!.allSteps.done}/{r.bst!.allSteps.due})</span></td>
                  <td>{r.bst!.allSteps.pending || "-"}</td>
                  <td className={pctCls(r.bst!.followup4.pct)}>{pctText(r.bst!.followup4.pct)} <span className="text-xs text-muted">({r.bst!.followup4.complete}/{r.bst!.followup4.eligible})</span></td>
                  <td>{r.bst!.followup4.excluded || "-"}</td>
                  <td>{pctText(r.bst!.relapse.pct)}</td>
                </tr>
              ))}
              {report.courses.map((c) => (
                <tr key={`c${c.course.id}`} className="bg-cream font-semibold">
                  <td>รวม {c.course.shortName}</td>
                  <td>{pctText(c.bst!.register.pct)}</td><td>{pctText(c.bst!.allSteps.pct)}</td><td>{c.bst!.allSteps.pending || "-"}</td>
                  <td>{pctText(c.bst!.followup4.pct)}</td><td>{c.bst!.followup4.excluded || "-"}</td><td>{pctText(c.bst!.relapse.pct)}</td>
                </tr>
              ))}
              {!report.rows.length && <tr><td colSpan={7} className="text-muted">ไม่มีรุ่นที่ต้องลง บสต. ในปีงบนี้</td></tr>}
            </tbody>
          </table>
        </div>
        {t.excludedReasons.length > 0 && (
          <div>
            <h3 className="font-semibold">ติดตามไม่ได้/ปิดการติดตาม แยกตามเหตุผล (ไม่นับเป็นค้าง)</h3>
            <ul className="mt-1 flex flex-wrap gap-2">{t.excludedReasons.map((x) => <li key={x.reason} className="tag-muted">{x.reason}: {x.n} งาน</li>)}</ul>
          </div>
        )}
      </section>
    </div>
  );
}
