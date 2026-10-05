import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listWeekly } from "@/lib/services/weekly-report";
import { addDays, formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { CreateWeekly } from "./weekly-client";

export const dynamic = "force-dynamic";

/** คลังรายงานประจำสัปดาห์ (สเปก 18.2) — ร่างอัตโนมัติศุกร์ 15.00 · ดูย้อนหลัง */
export default async function WeeklyListPage() {
  const auth = await requirePage("reports.view", "dashboard.view", "reports.weekly");
  const db = getDb();
  const all = listWeekly(db);
  // ผู้บริหารเห็นเฉพาะฉบับที่อนุมัติแล้ว
  const list = auth.can("reports.weekly") || auth.can("reports.view") ? all : all.filter((r) => r.status === "approved");
  return (
    <div className="max-w-4xl space-y-5">
      <Breadcrumb items={[{ label: "รายงานประจำสัปดาห์" }]} />
      <PageHeader en="Weekly Report" title="รายงานประจำสัปดาห์" subtitle="ระบบร่างให้ทุกวันศุกร์ 15.00 น. · หัวหน้า/รองตรวจแก้ข้อความ → อนุมัติ → พิมพ์บันทึกข้อความ (PDF/Word)" />
      {auth.can("reports.weekly") && <section className="card"><CreateWeekly today={todayISO()} /></section>}
      {list.length === 0 ? <EmptyState title="ยังไม่มีรายงาน" /> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/weekly/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 hover:bg-lime-soft">
                <b>สัปดาห์ {formatThaiDate(r.weekStart)} – {formatThaiDate(addDays(r.weekStart, 6))}</b>
                <span className="flex items-center gap-2">
                  {r.approvedAt && <span className="text-sm text-muted">อนุมัติ {formatThaiDateTime(r.approvedAt)}</span>}
                  <span className={r.status === "approved" ? "tag-ok" : "tag-warn"}>{r.status === "approved" ? "อนุมัติแล้ว" : "ร่าง"}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
