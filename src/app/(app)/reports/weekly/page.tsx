import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listWeekly, periodEndOf } from "@/lib/services/weekly-report";
import { periodTitle } from "@/lib/services/report-memo";
import { formatThaiDateTime, todayISO } from "@/lib/thai-date";
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
      <Breadcrumb items={[{ label: "รายงานประจำสัปดาห์/เดือน" }]} />
      <PageHeader en="Weekly Report" title="รายงานประจำสัปดาห์/เดือน" help="ระบบร่างรายงานทุกวันศุกร์ 15.00 น. ตรวจแก้ข้อความ อนุมัติ แล้วพิมพ์บันทึกข้อความ (PDF/Word) หัวข้อปัญหาและข้อเสนอแนะ ระบบรวบรวมจากผลกิจกรรม แก้เพิ่มได้" />
      {auth.can("reports.weekly") && <section className="card"><CreateWeekly today={todayISO()} /></section>}
      {list.length === 0 ? <EmptyState title="ยังไม่มีรายงาน" /> : (
        <ul className="space-y-2">
          {list.map((r) => (
            <li key={r.id}>
              <Link href={`/reports/weekly/${r.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3 hover:bg-lime-soft">
                <b>{r.kind === "monthly" ? <span className="tag-navy mr-2">รายเดือน</span> : null}รายงาน{periodTitle(r.kind === "monthly" ? "monthly" : "weekly", r.weekStart, periodEndOf(r))}</b>
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
