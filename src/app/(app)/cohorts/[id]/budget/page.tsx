import Link from "next/link";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { lookupsOf } from "@/lib/queries/lookups";
import { cohortLabel } from "@/lib/services/cohorts";
import { cohortBudget, allocationsForCohort, cohortReport } from "@/lib/services/budget";
import { BUDGET_CATEGORIES, categoryOf, lineFormula, type BudgetCategory, type Factor } from "@/lib/budget/calc";
import { getSetting } from "@/lib/bootstrap";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { LineForm, LineRowActions, TemplateForm, ExpenseForm, RefundForm, DeleteExpense, ConfirmOverrun } from "../../../budget/budget-client";

export const dynamic = "force-dynamic";

const b = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const LEVEL: Record<string, { cls: string; label: string }> = { ok: { cls: "tag-ok", label: "ไม่เกินงบ" }, yellow: { cls: "tag-warn", label: "เกินหมวด — ถัวได้" }, red: { cls: "tag-danger", label: "เกินงบ" } };

/** งบประมาณของรุ่น (สเปก 13.2–13.4) — ตั้งงบตามสูตร · ใช้จ่ายจริง · ค่าวิทยากรตัดงบจากรอบเบิกที่อนุมัติแล้ว · รายงานแยกหมวด */
export default async function CohortBudgetPage({ params }: PageProps<"/cohorts/[id]/budget">) {
  const auth = await requirePage("budget.view");
  const { id } = await params;
  const db = getDb();
  const { cohort, course } = getCohort(db, Number(id))!;
  const data = cohortBudget(db, cohort.id);
  const allowed = allocationsForCohort(db, cohort.id);
  const sources = new Map(lookupsOf(db, "fund_source").map((l) => [l.code, l.label]));
  const items = lookupsOf(db, "budget_item").map((l) => ({ code: l.code, label: l.label }));
  const itemLabel = new Map(items.map((i) => [i.code, i.label]));
  const allocLabel = (a: { id: number; source: string; docNo: string | null; flexible: boolean }) => `${sources.get(a.source) ?? a.source}${a.docNo ? ` ${a.docNo}` : ""} · ${a.flexible ? "ถัวได้" : "ห้ามถัว"}`;
  const allocById = new Map([...allowed, ...data.allocations].map((a) => [a.id, a]));
  const allocOpts = allowed.map((a) => ({ id: a.id, label: allocLabel(a), flexible: a.flexible }));
  const canManage = auth.can("budget.manage");
  const canSpend = auth.can("budget.spend");
  const canConfirm = auth.can("budget.approve");
  const closed = cohort.status === "closed";
  const prevCohorts = db.select({ c: schema.cohorts }).from(schema.cohorts)
    .where(and(eq(schema.cohorts.courseId, course.id), ne(schema.cohorts.id, cohort.id), isNull(schema.cohorts.deletedAt))).orderBy(asc(schema.cohorts.startDate)).all()
    .map((r) => ({ id: r.c.id, label: `${course.shortName} ${cohortLabel(r.c)}` })).reverse();
  const hasTemplate = !!getSetting<Record<string, unknown>>(db, "budget.templates", {})[course.code];
  const batches = db.select().from(schema.payBatches).where(and(eq(schema.payBatches.cohortId, cohort.id), eq(schema.payBatches.status, "approved"), isNull(schema.payBatches.deletedAt))).all();
  const report = cohortReport(db, cohort.id);
  const today = todayISO();

  return (
    <div className="space-y-6">
      {!auth.can("budget.manage") && !canSpend && <Alert tone="info">ดูอย่างเดียว</Alert>}
      {data.status.unbudgetedCompensation > 0 && <Alert tone="danger">ค่าวิทยากรที่อนุมัติแล้ว {b(data.status.unbudgetedCompensation)} บาท ยังไม่มีบรรทัดงบรองรับ — เพิ่มรายการ &quot;ค่าตอบแทนวิทยากรภายใน/ภายนอก&quot; ในงบของรุ่น</Alert>}
      {data.needsConfirmation && <Alert tone="danger">มีหมวดที่ใช้เกินงบและยังไม่ได้รับการยืนยัน</Alert>}

      {/* สถานะต่อแหล่งเงิน */}
      {data.status.allocations.length === 0 ? <EmptyState title="รุ่นนี้ยังไม่มีงบประมาณ">{canManage ? "เพิ่มรายการงบด้านล่าง หรือใช้แม่แบบของหลักสูตร" : "ยังไม่ได้ตั้งงบของรุ่น"}</EmptyState> : (
        <section className="grid gap-4">
          {data.status.allocations.map((a) => {
            const alloc = allocById.get(a.allocationId);
            return (
              <div key={a.allocationId} className="card space-y-2">
                <h2 className="text-lg">{alloc ? allocLabel(alloc) : `การจัดสรร #${a.allocationId}`}</h2>
                <p className="text-sm text-muted">งบของรุ่น {b(a.budget)} · ใช้แล้ว {b(a.spent)}{a.refunded ? ` · คืน ${b(a.refunded)}` : ""} · <b className={a.remaining < 0 ? "text-danger" : ""}>คงเหลือ {b(a.remaining)}</b> บาท</p>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted"><th className="py-1">หมวด</th><th className="text-right">งบ</th><th className="text-right">ใช้</th><th className="text-right">คงเหลือ</th><th className="w-1/2 pl-4">สถานะ</th></tr></thead>
                  <tbody>
                    {a.categories.map((c) => (
                      <tr key={c.category} className={`border-t border-line align-top ${c.level === "red" ? "bg-danger/5" : c.level === "yellow" ? "bg-warn-bg/10" : ""}`}>
                        <td className="py-1">{BUDGET_CATEGORIES[c.category]}</td><td className="text-right">{b(c.budget)}</td><td className="text-right">{b(c.spent)}</td><td className={`text-right ${c.remaining < 0 ? "font-semibold text-danger" : ""}`}>{b(c.remaining)}</td>
                        <td className="pl-4">
                          <span className={LEVEL[c.level].cls}>{LEVEL[c.level].label}</span>
                          {c.level === "yellow" && c.borrowFrom.length > 0 && <span className="block text-xs">ถัวจาก {c.borrowFrom.map((x) => BUDGET_CATEGORIES[x]).join(", ")}</span>}
                          {c.level === "red" && c.over > 0 && (c.confirmed ? <span className="tag-ok ml-1">ยืนยันแล้ว</span> : <span className="ml-2 text-sm text-danger">เกิน {b(c.over)} บาท — รอยืนยัน</span>)}
                          {c.level === "red" && c.over > 0 && !c.confirmed && canConfirm && <ConfirmOverrun cohortId={cohort.id} allocationId={a.allocationId} category={c.category} label={`${BUDGET_CATEGORIES[c.category]} เกิน ${b(c.over)} บาท`} />}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {canConfirm && alloc && !alloc.flexible && (
                  <details className="text-sm"><summary className="cursor-pointer text-muted">ยืนยันล่วงหน้า (ให้การเงินบันทึกเกินงบหมวดได้ภายในยอดที่อนุญาต)</summary>
                    <div className="mt-1 flex flex-wrap gap-2">{a.categories.map((c) => <ConfirmOverrun key={c.category} advance cohortId={cohort.id} allocationId={a.allocationId} category={c.category} label={BUDGET_CATEGORIES[c.category]} />)}</div>
                  </details>
                )}
              </div>
            );
          })}
        </section>
      )}

      {/* งบของรุ่น */}
      <section className="card space-y-3">
        <h2 className="text-xl">งบของรุ่น (ตั้งตามสูตร)</h2>
        {data.lines.length === 0 ? <p className="text-muted">ยังไม่มีรายการ</p> : (
          <div className="space-y-3">
            {(Object.keys(BUDGET_CATEGORIES) as BudgetCategory[]).map((cat) => {
              const ls = data.lines.filter((l) => categoryOf(l.item) === cat);
              if (!ls.length) return null;
              return (
                <div key={cat}>
                  <h3 className="font-semibold">{BUDGET_CATEGORIES[cat]} <span className="text-sm font-normal text-muted">รวม {b(ls.reduce((s, l) => s + l.amountSatang, 0))} บาท</span></h3>
                  <ul className="mt-1 space-y-1">
                    {ls.map((l) => (
                      <li key={l.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-cream px-3 py-2 text-sm">
                        <span className="font-medium">{itemLabel.get(l.item) ?? l.item}{l.label ? ` — ${l.label}` : ""}</span>
                        <span className="text-muted">{lineFormula(l.unitSatang, l.factors as Factor[])}</span>
                        <span className="tag-muted">{allocById.get(l.allocationId) ? sources.get(allocById.get(l.allocationId)!.source) : ""}</span>
                        <span className="ml-auto font-semibold">{b(l.amountSatang)} บาท</span>
                        {canManage && !closed && <LineRowActions cohortId={cohort.id} allocations={allocOpts} items={items} initial={{ id: l.id, allocationId: l.allocationId, item: l.item, label: l.label, unitSatang: l.unitSatang, factors: l.factors as Factor[] }} />}
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
            <p className="text-right font-semibold">รวมงบของรุ่น {b(data.lines.reduce((s, l) => s + l.amountSatang, 0))} บาท</p>
          </div>
        )}
        {canManage && !closed && (
          <>
            <TemplateForm cohortId={cohort.id} allocations={allocOpts} hasTemplate={hasTemplate} prevCohorts={prevCohorts} />
            <details className="rounded-2xl border border-line p-3"><summary className="cursor-pointer font-semibold">+ เพิ่มรายการเอง</summary><div className="mt-2"><LineForm cohortId={cohort.id} allocations={allocOpts} items={items} /></div></details>
          </>
        )}
      </section>

      {/* ใช้จ่ายจริง */}
      <section className="card space-y-3">
        <h2 className="text-xl">ใช้จ่ายจริง</h2>
        <div>
          <h3 className="font-semibold">ค่าตอบแทนวิทยากร (จากรอบเบิกที่อนุมัติแล้ว — ตัดงบอัตโนมัติ)</h3>
          {batches.length === 0 ? <p className="text-sm text-muted">ยังไม่มีรอบเบิกที่อนุมัติ (รอบร่างยังไม่ตัดงบ)</p> : (
            <ul className="mt-1 space-y-1 text-sm">
              {batches.map((x) => <li key={x.id} className="flex flex-wrap justify-between gap-2 rounded-xl bg-cream px-3 py-2"><span>{formatThaiDate(x.dateFrom)} – {formatThaiDate(x.dateTo)} {auth.can("pay.view") ? <Link className="underline" href={`/pay/batches/${x.id}`}>ดูรอบเบิก</Link> : null}</span><b>{b(x.totalSatang ?? 0)} บาท</b></li>)}
              <li className="text-right">ภายใน {b(data.comp.internalSatang)} · ภายนอก {b(data.comp.externalSatang)} บาท</li>
            </ul>
          )}
        </div>
        <div>
          <h3 className="font-semibold">รายการอื่น</h3>
          {data.expenses.length === 0 ? <p className="text-sm text-muted">ยังไม่มีรายการ</p> : (
            <table className="mt-1 w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-1">วันที่</th><th>หมวด/รายการ</th><th>รายการ</th><th>เลขที่เอกสาร</th><th className="text-right">จำนวน</th><th /></tr></thead>
              <tbody>
                {data.expenses.map((e) => (
                  <tr key={e.id} className="border-t border-line">
                    <td className="py-1 whitespace-nowrap">{formatThaiDate(e.date)}</td>
                    <td>{e.kind === "refund" ? <span className="tag-navy">คืนเงินเหลือ</span> : itemLabel.get(e.item ?? "") ?? e.item}</td>
                    <td>{e.description}</td><td>{e.docNo ?? "-"}</td><td className="text-right">{b(e.amountSatang)}</td>
                    <td className="text-right">{canSpend && <DeleteExpense cohortId={cohort.id} id={e.id} />}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {closed && canSpend && <p className="hint">รุ่นนี้ปิดแล้ว บันทึกได้เฉพาะรายจ่ายจริงและคืนเงินเหลือ</p>}
        {canSpend && (
          <>
            <ExpenseForm cohortId={cohort.id} allocations={allocOpts} items={items} today={today} canConfirm={canConfirm} />
            <RefundForm cohortId={cohort.id} allocations={data.status.allocations.map((a) => ({ id: a.allocationId, label: allocById.get(a.allocationId) ? allocLabel(allocById.get(a.allocationId)!) : String(a.allocationId), flexible: !!allocById.get(a.allocationId)?.flexible, remaining: a.remaining }))} today={today} />
          </>
        )}
      </section>

      {/* รายงานตามแบบกรมฯ */}
      {report.length > 0 && (
        <section className="card space-y-3">
          <h2 className="text-xl">รายงานการใช้จ่ายงบประมาณ (แยกหมวด)</h2>
          {report.map((r) => (
            <div key={r.allocation.id} className="overflow-x-auto">
              <p className="font-semibold">{allocLabel(r.allocation)} — ได้รับจัดสรร {b(r.received)} บาท · ใช้สะสมทุกรุ่นถึงรุ่นนี้ {b(r.cumulativeAll)} บาท</p>
              <table className="mt-1 w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="py-1">หมวด</th><th className="text-right">งบของรุ่น</th><th className="text-right">ใช้ครั้งนี้</th><th className="text-right">สะสม</th><th className="text-right">คงเหลือ</th></tr></thead>
                <tbody>{r.rows.map((x) => <tr key={x.category} className="border-t border-line"><td className="py-1">{BUDGET_CATEGORIES[x.category]}</td><td className="text-right">{b(x.budget)}</td><td className="text-right">{b(x.thisTime)}</td><td className="text-right">{b(x.cumulative)}</td><td className={`text-right ${x.remaining < 0 ? "text-danger" : ""}`}>{b(x.remaining)}</td></tr>)}</tbody>
              </table>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
