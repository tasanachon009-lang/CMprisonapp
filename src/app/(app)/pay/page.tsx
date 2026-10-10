import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { paySummary, listBatches, taxSetting, BATCH_STATUS_LABEL } from "@/lib/services/pay";
import { personTotals, lineFormula, baht } from "@/lib/pay/calc";
import { cohortLabel } from "@/lib/services/cohorts";
import { currentFiscalYear, fiscalYearRange, formatThaiDate } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, EmptyState } from "@/components/ui";
import { CreateBatchForm, DocSettingsForm } from "./pay-client";
import { unsignedCount } from "@/lib/services/pay-docs";
import { getSetting } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = { internal: "ภายใน", external: "ภายนอก" };

/**
 * ค่าตอบแทนวิทยากร (สเปก 11.6): สรุปรายคน/รุ่น/เดือน/ปีงบ แยกภายใน-ภายนอก · รอบเบิก (อนุมัติ = ล็อกคาบ) · ภาระงานชั่วโมงสอน
 * เจ้าหน้าที่หลัก (ไม่มีสิทธิ์ดูเงิน) เห็นเฉพาะภาระงาน (ชั่วโมงสอน)
 */
export default async function PayPage({ searchParams }: PageProps<"/pay">) {
  const auth = await requirePage("pay.view", "reports.view");
  const sp = await searchParams;
  const db = getDb();
  const money = auth.can("pay.view");
  const tab = !money ? "workload" : sp.tab === "batches" || sp.tab === "workload" ? sp.tab : "summary";
  const fy = Number(sp.fy) || currentFiscalYear();
  const fyRange = fiscalYearRange(fy);
  const month = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : "";
  const from = month ? `${month}-01` : fyRange.start;
  const to = month ? (() => { const [y, m] = month.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); })() : fyRange.end;
  const cohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).orderBy(asc(schema.cohorts.startDate)).all();
  const cohortName = new Map(cohorts.map((r) => [r.c.id, `${r.course.shortName} ${cohortLabel(r.c)}`]));
  const courseOf = new Map(cohorts.map((r) => [r.c.id, r.course.shortName]));
  const cohortId = Number(sp.cohort) || null;
  const kind = sp.kind === "internal" || sp.kind === "external" ? sp.kind : "";
  const person = typeof sp.person === "string" ? sp.person : "";
  const all = paySummary(db, { from, to, cohortIds: cohortId ? [cohortId] : undefined }).filter((l) => !kind || l.kind === kind);
  const tax = taxSetting(db);
  const qs = (o: Record<string, string | number | null>) => {
    const base: Record<string, string> = { tab, fy: String(fy), ...(month ? { month } : {}), ...(cohortId ? { cohort: String(cohortId) } : {}), ...(kind ? { kind } : {}) };
    for (const [k, v] of Object.entries(o)) { if (v == null || v === "") delete base[k]; else base[k] = String(v); }
    return `?${new URLSearchParams(base).toString()}`;
  };
  const tabs: Array<[string, string]> = money ? [["summary", "สรุปค่าตอบแทน"], ["batches", "รอบเบิก / อนุมัติ"], ["workload", "ภาระงานชั่วโมงสอน"]] : [["workload", "ภาระงานชั่วโมงสอน"]];

  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ label: "ค่าตอบแทน" }]} />
      <PageHeader en="Speaker Fees" title="ค่าตอบแทนวิทยากร" help="คิดจากการสอนจริงของคาบที่ปิดคาบแล้ว สร้างรอบเบิกต่อรุ่น (ทั้งรุ่นหรือช่วงวันที่) ตรวจยอดแล้วอนุมัติ เมื่ออนุมัติยอดจะคงที่และล็อกเช็คชื่อ/ผลกิจกรรมของคาบในรอบ คาบที่เบิกแล้วไม่ถูกนำไปเบิกซ้ำ" />
      <div className="flex flex-wrap gap-2">
        {tabs.map(([k, l]) => <Link key={k} href={qs({ tab: k, person: null })} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${tab === k ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{l}</Link>)}
      </div>

      {tab !== "batches" && (
        <form className="card flex flex-wrap items-end gap-2" action="">
          <input type="hidden" name="tab" value={tab} />
          <label><span className="label">ปีงบประมาณ</span><select name="fy" className="input w-auto" defaultValue={String(fy)}>{[fy + 1, fy, fy - 1, fy - 2].map((y) => <option key={y} value={y}>{y}</option>)}</select></label>
          <label><span className="label">เดือน (ไม่เลือก = ทั้งปีงบ)</span><input type="month" name="month" className="input w-auto" defaultValue={month} /></label>
          <label><span className="label">รุ่น</span><select name="cohort" className="input w-auto" defaultValue={cohortId ? String(cohortId) : ""}><option value="">ทุกรุ่น</option>{cohorts.map((r) => <option key={r.c.id} value={r.c.id}>{cohortName.get(r.c.id)}</option>)}</select></label>
          <label><span className="label">ประเภทวิทยากร</span><select name="kind" className="input w-auto" defaultValue={kind}><option value="">ทั้งหมด</option><option value="internal">ภายใน</option><option value="external">ภายนอก</option></select></label>
          <button className="btn-secondary">แสดง</button>
          <span className="text-sm text-muted">{formatThaiDate(from)} – {formatThaiDate(to)}</span>
        </form>
      )}

      {tab === "summary" && <Summary lines={all} tax={tax} person={person} qs={qs} cohortName={cohortName} courseOf={courseOf} />}
      {tab === "workload" && <Workload lines={all.filter((l) => l.kind === "internal")} />}
      {tab === "batches" && <Batches canManage={auth.can("pay.manage")} cohorts={cohorts.filter((r) => r.c.status !== "planned").map((r) => ({ id: r.c.id, label: cohortName.get(r.c.id)!, start: r.c.startDate, end: r.c.endDate }))} />}
    </div>
  );
}

type Line = ReturnType<typeof paySummary>[number];

function Summary({ lines, tax, person, qs, cohortName, courseOf }: { lines: Line[]; tax: { enabled: boolean; pct: number }; person: string; qs: (o: Record<string, string | number | null>) => string; cohortName: Map<number, string>; courseOf: Map<number, string> }) {
  const approved = personTotals(lines.filter((l) => l.status === "approved"), tax);
  const pending = personTotals(lines.filter((l) => l.status === "pending"), tax);
  const totals = personTotals(lines, tax);
  const sum = (arr: typeof totals, k: "grossSatang" | "taxSatang" | "netSatang") => arr.reduce((a, x) => a + x[k], 0);
  const byKind = (k: string) => totals.filter((t) => t.kind === k);
  // สัดส่วนชั่วโมงภายใน:ภายนอก รายหลักสูตร (สเปก 11.5A)
  const courses = new Map<string, { internal: number; external: number; inMoney: number; exMoney: number }>();
  for (const l of lines) {
    const c = courseOf.get(l.cohortId) ?? "-";
    const v = courses.get(c) ?? { internal: 0, external: 0, inMoney: 0, exMoney: 0 };
    if (l.kind === "internal") { v.internal += l.hours; v.inMoney += l.amountSatang; } else { v.external += l.hours; v.exMoney += l.amountSatang; }
    courses.set(c, v);
  }
  if (!lines.length) return <EmptyState title="ยังไม่มีคาบที่ปิดคาบแล้วในช่วงนี้">ค่าตอบแทนคิดจากคาบที่บันทึกผล &quot;บันทึกและปิดคาบ&quot; แล้ว</EmptyState>;
  const detail = person ? lines.filter((l) => l.key === person) : [];
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-muted">ภายใน</p><p className="text-2xl font-semibold">{baht(sum(byKind("internal"), "grossSatang"))}</p><p className="text-sm text-muted">{byKind("internal").length} คน</p></div>
        <div className="card"><p className="text-sm text-muted">ภายนอก</p><p className="text-2xl font-semibold">{baht(sum(byKind("external"), "grossSatang"))}</p><p className="text-sm text-muted">{byKind("external").length} คน</p></div>
        <div className="card"><p className="text-sm text-muted">รวมทั้งสิ้น</p><p className="text-2xl font-semibold">{baht(sum(totals, "grossSatang"))}</p><p className="text-sm text-muted">อนุมัติแล้ว {baht(sum(approved, "grossSatang"))} · รออนุมัติ {baht(sum(pending, "grossSatang"))}</p></div>
      </div>

      <section className="card overflow-x-auto">
        <h2 className="text-xl">รายวิทยากร</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ</th><th>ประเภท</th><th className="text-right">คาบ</th><th className="text-right">ชม.สอน</th><th className="text-right">ชม.เบิกได้</th><th className="text-right">อนุมัติแล้ว</th><th className="text-right">รออนุมัติ</th><th className="text-right">รวม</th></tr></thead>
          <tbody>
            {totals.map((t) => (
              <tr key={t.key} className={`border-t border-line ${person === t.key ? "bg-lime-soft" : ""}`}>
                <td className="py-2"><Link href={qs({ person: t.key })} className="underline">{t.name}</Link></td>
                <td><span className={t.kind === "external" ? "tag-orange" : "tag-navy"}>{KIND_LABEL[t.kind]}</span></td>
                <td className="text-right">{t.sessions}</td><td className="text-right">{t.hours}</td><td className="text-right">{t.payableHours}</td>
                <td className="text-right">{baht(approved.find((x) => x.key === t.key)?.grossSatang ?? 0)}</td>
                <td className="text-right">{baht(pending.find((x) => x.key === t.key)?.grossSatang ?? 0)}</td>
                <td className="text-right font-semibold">{baht(t.grossSatang)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {person && (
        <section className="card overflow-x-auto">
          <h2 className="text-xl">ที่มาของยอด: {detail[0]?.name ?? "-"}</h2>
          <table className="mt-2 w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2">วันที่</th><th>รุ่น</th><th>หัวข้อ</th><th>วิธีคิด</th><th>สถานะ</th></tr></thead>
            <tbody>
              {detail.map((l, i) => (
                <tr key={i} className="border-t border-line align-top">
                  <td className="py-2 whitespace-nowrap">{formatThaiDate(l.date)}</td>
                  <td>{cohortName.get(l.cohortId) ?? "-"}</td>
                  <td>{l.title}</td>
                  <td>{l.payable ? lineFormula(l) : <span className="text-muted">{l.hours} ชม. — เบิกไม่ได้: {l.note}</span>}</td>
                  <td>{l.status === "approved" ? <Link href={`/pay/batches/${l.batchId}`} className="tag-ok">อนุมัติแล้ว</Link> : <span className="tag-warn">รออนุมัติ</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section className="card overflow-x-auto">
        <h2 className="text-xl">สัดส่วนภายใน : ภายนอก รายหลักสูตร</h2>
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-2">หลักสูตร</th><th className="text-right">ชม.ภายใน</th><th className="text-right">ชม.ภายนอก</th><th className="text-right">สัดส่วน (ชม.)</th><th className="text-right">เงินภายใน</th><th className="text-right">เงินภายนอก</th></tr></thead>
          <tbody>
            {[...courses].map(([c, v]) => {
              const total = v.internal + v.external;
              return (
                <tr key={c} className="border-t border-line">
                  <td className="py-2">{c}</td><td className="text-right">{v.internal}</td><td className="text-right">{v.external}</td>
                  <td className="text-right">{total ? `${Math.round((v.internal / total) * 100)} : ${Math.round((v.external / total) * 100)}` : "-"}</td>
                  <td className="text-right">{baht(v.inMoney)}</td><td className="text-right">{baht(v.exMoney)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** ภาระงาน: ชั่วโมงสอนของเจ้าหน้าที่รายเดือน รวมคาบที่เบิกไม่ได้ (สเปก 11.5A, 11.6) */
function Workload({ lines }: { lines: Line[] }) {
  if (!lines.length) return <EmptyState title="ยังไม่มีชั่วโมงสอนของเจ้าหน้าที่ในช่วงนี้" />;
  const months = Array.from(new Set(lines.map((l) => l.date.slice(0, 7)))).sort();
  const people = new Map<string, { name: string; byMonth: Map<string, number>; sessions: number; total: number }>();
  for (const l of lines) {
    const p = people.get(l.key) ?? { name: l.name, byMonth: new Map(), sessions: 0, total: 0 };
    p.byMonth.set(l.date.slice(0, 7), (p.byMonth.get(l.date.slice(0, 7)) ?? 0) + l.hours);
    p.sessions += 1;
    p.total += l.hours;
    people.set(l.key, p);
  }
  const fmtMonth = (m: string) => formatThaiDate(`${m}-01`).replace(/^1 /, "");
  return (
    <section className="card overflow-x-auto">
      <h2 className="text-xl">ชั่วโมงสอนของเจ้าหน้าที่ (วิทยากรภายใน)</h2>
      <p className="text-sm text-muted">รวมคาบที่เบิกไม่ได้</p>
      <table className="mt-2 w-full text-sm">
        <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ</th>{months.map((m) => <th key={m} className="text-right">{fmtMonth(m)}</th>)}<th className="text-right">คาบ</th><th className="text-right">รวม ชม.</th></tr></thead>
        <tbody>
          {[...people.values()].sort((a, b) => b.total - a.total).map((p) => (
            <tr key={p.name} className="border-t border-line">
              <td className="py-2">{p.name}</td>
              {months.map((m) => <td key={m} className="text-right">{Math.round((p.byMonth.get(m) ?? 0) * 10) / 10 || "-"}</td>)}
              <td className="text-right">{p.sessions}</td><td className="text-right font-semibold">{Math.round(p.total * 10) / 10}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function Batches({ canManage, cohorts }: { canManage: boolean; cohorts: Array<{ id: number; label: string; start: string; end: string }> }) {
  const db = getDb();
  const batches = listBatches(db);
  return (
    <div className="space-y-4">
      
      {(() => { const n = unsignedCount(db); return n > 0 ? <Alert tone="warn">ใบสำคัญรับเงินที่พิมพ์แล้วแต่ยังไม่ได้ลายเซ็น {n} ใบ — เปิดรอบเบิกแล้วติ๊ก &quot;เซ็นรับแล้ว&quot; เมื่อได้ใบคืน</Alert> : null; })()}
      {canManage && <CreateBatchForm cohorts={cohorts} />}
      {canManage && <DocSettingsForm initial={{ payerName: getSetting<string>(db, "docs.payerName", ""), corner: getSetting<string>(db, "docs.voucherCorner", ""), showKtbForm: getSetting<boolean>(db, "docs.showKtbForm", true) !== false, intro: getSetting<{ intro: string }>(db, "docs.ktbTemplate", { intro: "" }).intro, companyNote: getSetting<{ companyNote: string }>(db, "docs.ktbTemplate", { companyNote: "" }).companyNote }} />}
      {batches.length === 0 ? <EmptyState title="ยังไม่มีรอบเบิก" /> : (
        <ul className="space-y-2">
          {batches.map((b) => (
            <li key={b.id}>
              <Link href={`/pay/batches/${b.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 hover:bg-lime-soft">
                <span><b>{b.cohortLabel}</b><span className="block text-sm text-muted">{formatThaiDate(b.dateFrom)} – {formatThaiDate(b.dateTo)}{b.note ? ` · ${b.note}` : ""}</span></span>
                <span className="flex items-center gap-2">{b.totalSatang != null && <b>{baht(b.totalSatang)}</b>}<span className={b.status === "approved" ? "tag-ok" : b.status === "cancelled" ? "tag-muted" : "tag-warn"}>{BATCH_STATUS_LABEL[b.status]}</span></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

