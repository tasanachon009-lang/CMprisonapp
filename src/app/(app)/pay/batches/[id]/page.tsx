import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { batchView, BATCH_STATUS_LABEL } from "@/lib/services/pay";
import { lineFormula, baht } from "@/lib/pay/calc";
import { delegationNote } from "@/lib/services/delegation";
import { cohortLabel } from "@/lib/services/cohorts";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, EmptyState } from "@/components/ui";
import { BatchActions, SignedToggle } from "../../pay-client";
import { payees, voucherStatuses, VOUCHER_STATUS_LABEL } from "@/lib/services/pay-docs";
import { Printer, FileSpreadsheet } from "lucide-react";

export const dynamic = "force-dynamic";

/** รอบเบิก: ตรวจยอดรายคน/รายคาบ → อนุมัติ (ล็อกคาบ) · อนุมัติแล้วแสดงยอดที่เก็บไว้ + เตือนถ้าข้อมูลเปลี่ยนหลังอนุมัติ */
export default async function BatchPage({ params }: PageProps<"/pay/batches/[id]">) {
  const auth = await requirePage("pay.view");
  const { id } = await params;
  const db = getDb();
  let v;
  try { v = batchView(db, Number(id)); } catch { notFound(); }
  const { batch: b } = v;
  const c = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, b.cohortId)).get()!;
  const names = userNameMap(db);
  const total = v.totals.reduce((a, x) => a + x.grossSatang, 0);
  const tax = v.totals.reduce((a, x) => a + x.taxSatang, 0);
  const via = auth.viaDelegation("pay.approve");
  const viaRow = b.approvedViaDelegationId ? db.select().from(schema.delegations).where(eq(schema.delegations.id, b.approvedViaDelegationId)).get() : null;
  return (
    <div className="space-y-5">
      <Breadcrumb items={[{ href: "/pay", label: "ค่าตอบแทน" }, { href: "/pay?tab=batches", label: "รอบเบิก" }, { label: `${c.course.shortName} ${cohortLabel(c.c)}` }]} />
      <PageHeader en="Pay Batch" title={`รอบเบิก ${c.course.shortName} ${cohortLabel(c.c)}`} subtitle={`${formatThaiDate(b.dateFrom)} – ${formatThaiDate(b.dateTo)}${b.note ? ` · ${b.note}` : ""}`} />
      <div className="flex flex-wrap items-center gap-3">
        <span className={b.status === "approved" ? "tag-ok" : b.status === "cancelled" ? "tag-muted" : "tag-warn"}>{BATCH_STATUS_LABEL[b.status]}</span>
        {b.approvedAt && <span className="text-sm text-muted">อนุมัติโดย {names.get(b.approvedBy ?? 0)} เมื่อ {formatThaiDateTime(b.approvedAt)}{viaRow ? ` (อนุมัติแทน — มอบอำนาจโดย ${names.get(viaRow.fromUserId)})` : ""}</span>}
      </div>
      <BatchActions id={b.id} status={b.status} canApprove={auth.can("pay.approve")} canManage={auth.can("pay.manage")} isAdmin={auth.isAdmin} blockSelf={v.lines.some((l) => l.userId === auth.user.id)} delegationNote={via ? delegationNote(via) : null} />

      {b.status === "approved" && <DocsSection batchId={b.id} canManage={auth.can("pay.manage")} />}

      {v.changedAfterApproval > 0 && <Alert tone="warn">ข้อมูลสอนจริง/อัตราของคาบในรอบนี้เปลี่ยนหลังอนุมัติ {v.changedAfterApproval} รายการ — ยอดที่อนุมัติยังเป็นยอดเดิม ถ้าต้องแก้ให้หัวหน้า/รองปลดล็อกแล้วอนุมัติใหม่ (เอกสารที่พิมพ์แล้วต้องพิมพ์ใหม่)</Alert>}
      {v.unrecorded.length > 0 && (
        <Alert tone="warn">
          <p className="font-semibold">คาบในช่วงนี้ที่ยังไม่ปิดคาบ {v.unrecorded.length} คาบ — ไม่ถูกนับในรอบนี้</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{v.unrecorded.slice(0, 10).map((s) => <li key={s.id}><Link className="underline" href={`/sessions/${s.id}`}>{formatThaiDate(s.date)} {s.title}</Link></li>)}</ul>
          {v.unrecorded.length > 10 && <p className="text-sm">และอีก {v.unrecorded.length - 10} คาบ</p>}
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-muted">รวมก่อนหักภาษี</p><p className="text-2xl font-semibold">{baht(total)}</p></div>
        <div className="card"><p className="text-sm text-muted">ภาษี ณ ที่จ่าย{v.tax.enabled ? ` ${v.tax.pct}% (ภายนอก)` : " (ปิดอยู่)"}</p><p className="text-2xl font-semibold">{baht(tax)}</p></div>
        <div className="card"><p className="text-sm text-muted">สุทธิ</p><p className="text-2xl font-semibold">{baht(total - tax)}</p></div>
      </div>

      {v.lines.length === 0 ? <EmptyState title="ไม่มีรายการที่เบิกได้ในช่วงนี้">ตรวจว่าปิดคาบแล้ว หัวข้อตั้งเป็นเบิกได้ และกำหนดอัตราไว้</EmptyState> : (
        <>
          <section className="card overflow-x-auto">
            <h2 className="text-xl">สรุปรายคน</h2>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ</th><th>ประเภท</th><th className="text-right">คาบ</th><th className="text-right">ชม.</th><th className="text-right">ก่อนหักภาษี</th><th className="text-right">ภาษี</th><th className="text-right">สุทธิ</th></tr></thead>
              <tbody>
                {v.totals.map((t) => (
                  <tr key={t.key} className="border-t border-line">
                    <td className="py-2">{t.name}</td><td><span className={t.kind === "external" ? "tag-orange" : "tag-navy"}>{t.kind === "external" ? "ภายนอก" : "ภายใน"}</span></td>
                    <td className="text-right">{t.sessions}</td><td className="text-right">{t.hours}</td><td className="text-right">{baht(t.grossSatang)}</td><td className="text-right">{baht(t.taxSatang)}</td><td className="text-right font-semibold">{baht(t.netSatang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <section className="card overflow-x-auto">
            <h2 className="text-xl">รายละเอียดรายคาบ (ที่มาของยอด)</h2>
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-2">วันที่</th><th>หัวข้อ</th><th>วิทยากร</th><th>วิธีคิด</th></tr></thead>
              <tbody>
                {v.lines.map((l) => (
                  <tr key={`${l.sessionId}:${l.staffId}`} className="border-t border-line align-top">
                    <td className="py-2 whitespace-nowrap">{formatThaiDate(l.date)}</td><td>{l.title}</td><td>{l.name}</td><td>{lineFormula(l)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      {v.notPayable.length > 0 && (
        <details className="card">
          <summary className="cursor-pointer font-semibold">คาบ/วิทยากรที่เบิกไม่ได้ในช่วงนี้ ({v.notPayable.length}) — นับเป็นภาระงานเท่านั้น</summary>
          <ul className="mt-2 space-y-1 text-sm">{v.notPayable.map((l) => <li key={`${l.sessionId}:${l.staffId}`}>{formatThaiDate(l.date)} {l.title} — {l.name}: <span className="text-muted">{l.note}</span></li>)}</ul>
        </details>
      )}
    </div>
  );
}

const STATUS_TAG: Record<string, string> = { none: "tag-muted", printed: "tag-warn", signed: "tag-ok", reprint: "tag-danger" };

/** เอกสารการเงิน (สเปก 11.5C/D): พิมพ์ชุดเอกสาร / Excel · สถานะรายใบ ยังไม่พิมพ์ / พิมพ์แล้ว / เซ็นรับแล้ว / ต้องพิมพ์ใหม่ */
function DocsSection({ batchId, canManage }: { batchId: number; canManage: boolean }) {
  const db = getDb();
  const people = payees(db, batchId);
  const st = voucherStatuses(db, batchId, people);
  const count = (s: string) => people.filter((p) => st.get(p.key)?.status === s).length;
  const incomplete = people.filter((p) => p.missing.length).length;
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">เอกสารส่งการเงิน</h2>
      <div className="flex flex-wrap gap-2">
        <Link href={`/print/pay-bundle/${batchId}`} target="_blank" className="btn-primary"><Printer size={18} aria-hidden /> พิมพ์ชุดเอกสาร (สรุป + ใบสำคัญฯ + KTB)</Link>
        <Link href={`/print/pay-bundle/${batchId}?parts=summary,vouchers,detail`} target="_blank" className="btn-ghost">+ ตารางรายละเอียด</Link>
        <a href={`/api/export/pay/${batchId}`} className="btn-ghost"><FileSpreadsheet size={18} aria-hidden /> Excel</a>
      </div>
      <p className="text-sm text-muted">ยังไม่พิมพ์ {count("none")} · พิมพ์แล้วรอเซ็น {count("printed")} · เซ็นรับแล้ว {count("signed")}{count("reprint") ? ` · ต้องพิมพ์ใหม่ ${count("reprint")}` : ""}{incomplete ? ` · ข้อมูลวิทยากรไม่ครบ ${incomplete} คน` : ""}</p>
      {count("reprint") > 0 && <Alert tone="danger">มีใบที่ยอดหรือข้อมูลวิทยากรเปลี่ยนหลังพิมพ์ — ต้องพิมพ์ใหม่แล้วให้เซ็นใหม่</Alert>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ</th><th>ประเภท</th><th className="text-right">ยอด</th><th>ข้อมูลเบิก</th><th>สถานะ</th><th>เซ็นรับ</th><th /></tr></thead>
          <tbody>
            {people.map((p) => {
              const s = st.get(p.key)!;
              return (
                <tr key={p.key} className="border-t border-line align-middle">
                  <td className="py-2">{p.fullName}</td>
                  <td><span className={p.kind === "external" ? "tag-orange" : "tag-navy"}>{p.kind === "external" ? "ภายนอก" : "ภายใน"}</span></td>
                  <td className="text-right">{baht(p.grossSatang)}</td>
                  <td>{p.missing.length ? <span className="tag-danger" title={p.missing.join(", ")}>ไม่ครบ: {p.missing.slice(0, 2).join(", ")}{p.missing.length > 2 ? "…" : ""}</span> : <span className="tag-ok">พร้อมเบิก</span>}</td>
                  <td><span className={STATUS_TAG[s.status]}>{VOUCHER_STATUS_LABEL[s.status]}</span>{s.row?.printCount ? <span className="text-xs text-muted"> ({s.row.printCount} ครั้ง)</span> : null}</td>
                  <td><SignedToggle batchId={batchId} personKey={p.key} signed={!!s.row?.signedAt && s.status === "signed"} disabled={!canManage || s.status === "none" || s.status === "reprint"} /></td>
                  <td><Link href={`/print/pay-bundle/${batchId}?parts=vouchers&keys=${p.key}`} target="_blank" className="text-navy underline">พิมพ์เฉพาะคนนี้</Link></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}