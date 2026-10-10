import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { lookupsOf } from "@/lib/queries/lookups";
import { fiscalSummary } from "@/lib/services/budget";
import { currentFiscalYear, formatThaiDate } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, EmptyState } from "@/components/ui";
import { AllocationForm, EditAllocation } from "./budget-client";

export const dynamic = "force-dynamic";

const b = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** งบประมาณ (สเปก 13): การจัดสรรต่อปีงบ · งบรายรุ่น · รายงานรายหลักสูตร/แหล่งเงิน งบต่อหัว % ประหยัด */
export default async function BudgetPage({ searchParams }: PageProps<"/budget">) {
  const auth = await requirePage("budget.view");
  const sp = await searchParams;
  const db = getDb();
  const fy = Number(sp.fy) || currentFiscalYear();
  const s = fiscalSummary(db, fy);
  const sources = lookupsOf(db, "fund_source").map((l) => [l.code, l.label] as [string, string]);
  const srcLabel = new Map(sources);
  const courses = db.select().from(schema.courses).orderBy(asc(schema.courses.sortOrder)).all();
  const courseName = new Map(courses.map((c) => [c.id, c.shortName]));
  const canManage = auth.can("budget.manage");
  const tot = (k: "amountSatang" | "distributed" | "spent" | "refunded" | "remaining") => s.perAllocation.reduce((a, x) => a + x[k], 0);
  // รายหลักสูตร / รายแหล่งเงิน
  const byCourse = courses.map((c) => {
    const list = s.perCohort.filter((x) => x.courseId === c.id);
    const budget = list.reduce((a, x) => a + x.budget, 0), spent = list.reduce((a, x) => a + x.spent, 0), people = list.reduce((a, x) => a + x.people, 0);
    return { name: c.shortName, cohorts: list.length, budget, spent, people, perHead: people ? Math.round(spent / people) : null, saving: budget ? Math.round(((budget - spent) / budget) * 1000) / 10 : null };
  }).filter((x) => x.cohorts && (x.budget || x.spent));
  const bySource = sources.map(([code, label]) => {
    const list = s.perAllocation.filter((a) => a.source === code);
    return { label, amount: list.reduce((a, x) => a + x.amountSatang, 0), spent: list.reduce((a, x) => a + x.spent, 0), remaining: list.reduce((a, x) => a + x.remaining, 0), n: list.length };
  }).filter((x) => x.n);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "งบประมาณ" }]} />
      <PageHeader en="Budget" title={`งบประมาณ ปีงบ ${fy}`} help="จัดสรรต่อปีงบแล้วแบ่งให้รุ่น ยอดรวมทุกรุ่นต้องไม่เกินที่จัดสรร ค่าวิทยากรตัดงบเมื่ออนุมัติรอบเบิก" />
      <div className="flex flex-wrap gap-2">
        {[fy - 1, fy, fy + 1].map((y) => <Link key={y} href={`?fy=${y}`} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${y === fy ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>ปีงบ {y}</Link>)}
      </div>
      {!canManage && <Alert tone="info">{auth.can("budget.spend") ? "การเงิน: ดูการจัดสรร และบันทึกใช้จ่ายจริงได้ที่แท็บ งบประมาณ ของแต่ละรุ่น" : "ดูอย่างเดียว"}</Alert>}

      <div className="grid gap-3 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-muted">ได้รับจัดสรร</p><p className="text-2xl font-semibold">{b(tot("amountSatang"))}</p></div>
        <div className="card"><p className="text-sm text-muted">แบ่งให้รุ่นแล้ว</p><p className="text-2xl font-semibold">{b(tot("distributed"))}</p></div>
        <div className="card"><p className="text-sm text-muted">ใช้จริง{tot("refunded") ? ` (+คืน ${b(tot("refunded"))})` : ""}</p><p className="text-2xl font-semibold">{b(tot("spent"))}</p></div>
        <div className="card"><p className="text-sm text-muted">คงเหลือ</p><p className={`text-2xl font-semibold ${tot("remaining") < 0 ? "text-danger" : ""}`}>{b(tot("remaining"))}</p></div>
      </div>

      <section className="card space-y-3">
        <h2 className="text-xl">การจัดสรรงบ</h2>
        {s.perAllocation.length === 0 ? <EmptyState title={`ยังไม่มีการจัดสรรของปีงบ ${fy}`} /> : (
          <ul className="space-y-2">
            {s.perAllocation.map((a) => (
              <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3">
                <span>
                  <b>{srcLabel.get(a.source) ?? a.source}</b> {a.docNo && <span className="text-muted">· {a.docNo}{a.docDate ? ` ลงวันที่ ${formatThaiDate(a.docDate)}` : ""}</span>}
                  <span className={a.flexible ? "tag-ok ml-2" : "tag-danger ml-2"}>{a.flexible ? "ถัวเฉลี่ยได้" : "ห้ามถัว"}</span>
                  <span className="block">{a.subject}{a.courseId ? ` · ${courseName.get(a.courseId)}` : " · ทุกหลักสูตร"}{a.targetPeople ? ` · เป้าหมาย ${a.targetPeople} คน` : ""}{a.targetCohorts ? ` ${a.targetCohorts} รุ่น` : ""}</span>
                  <span className="block text-sm text-muted">จัดสรร {b(a.amountSatang)} · แบ่งให้รุ่น {b(a.distributed)} (ยังไม่แบ่ง {b(a.undistributed)}) · ใช้ {b(a.spent)}{a.refunded ? ` · คืน ${b(a.refunded)}` : ""} · <b className={a.remaining < 0 ? "text-danger" : ""}>คงเหลือ {b(a.remaining)}</b> บาท</span>
                </span>
                {canManage && <EditAllocation fy={fy} sources={sources} courses={courses.map((c) => ({ id: c.id, name: c.name }))} initial={a} canDelete={a.distributed === 0} />}
              </li>
            ))}
          </ul>
        )}
        {canManage && <details className="rounded-2xl border border-line p-3"><summary className="cursor-pointer font-semibold">+ เพิ่มการจัดสรร ปีงบ {fy}</summary><div className="mt-3"><AllocationForm fy={fy} sources={sources} courses={courses.map((c) => ({ id: c.id, name: c.name }))} /></div></details>}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="text-xl">รายรุ่น</h2>
        {s.perCohort.length === 0 ? <p className="text-muted">ไม่มีรุ่นในปีงบนี้</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2">รุ่น</th><th className="text-right">งบของรุ่น</th><th className="text-right">ใช้จริง</th><th className="text-right">คืน</th><th className="text-right">คน</th><th className="text-right">ต่อหัว</th><th className="text-right">% ประหยัด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {s.perCohort.map((c) => (
                <tr key={c.cohortId} className="border-t border-line">
                  <td className="py-2"><Link className="underline" href={`/cohorts/${c.cohortId}/budget`}>{c.label}</Link></td>
                  <td className="text-right">{b(c.budget)}</td><td className="text-right">{b(c.spent)}</td><td className="text-right">{c.refunded ? b(c.refunded) : "-"}</td>
                  <td className="text-right">{c.people}</td><td className="text-right">{c.perHead != null ? b(c.perHead) : "-"}</td><td className="text-right">{c.savingPct != null ? `${c.savingPct}%` : "-"}</td>
                  <td>{c.budget === 0 && c.spent === 0 ? <span className="tag-muted">ยังไม่ตั้งงบ</span> : c.needsConfirmation ? <span className="tag-danger">เกินงบ รอยืนยัน</span> : c.byAllocation.some((a) => a.categories.some((x) => x.level !== "ok")) ? <span className="tag-warn">มีหมวดเกิน</span> : <span className="tag-ok">ปกติ</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="card overflow-x-auto">
          <h2 className="text-xl">รายหลักสูตร</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2">หลักสูตร</th><th className="text-right">รุ่น</th><th className="text-right">งบ</th><th className="text-right">ใช้</th><th className="text-right">ต่อหัว</th><th className="text-right">% ประหยัด</th></tr></thead>
            <tbody>{byCourse.map((c) => <tr key={c.name} className="border-t border-line"><td className="py-2">{c.name}</td><td className="text-right">{c.cohorts}</td><td className="text-right">{b(c.budget)}</td><td className="text-right">{b(c.spent)}</td><td className="text-right">{c.perHead != null ? b(c.perHead) : "-"}</td><td className="text-right">{c.saving != null ? `${c.saving}%` : "-"}</td></tr>)}</tbody>
          </table>
        </section>
        <section className="card overflow-x-auto">
          <h2 className="text-xl">รายแหล่งเงิน</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2">แหล่งเงิน</th><th className="text-right">จัดสรร</th><th className="text-right">ใช้</th><th className="text-right">คงเหลือ</th></tr></thead>
            <tbody>{bySource.map((x) => <tr key={x.label} className="border-t border-line"><td className="py-2">{x.label}</td><td className="text-right">{b(x.amount)}</td><td className="text-right">{b(x.spent)}</td><td className="text-right">{b(x.remaining)}</td></tr>)}</tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
