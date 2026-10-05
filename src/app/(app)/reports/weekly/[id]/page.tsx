import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Printer, FileText } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import type { WeeklyData } from "@/lib/services/weekly-report";
import { userNameMap } from "@/lib/queries/names";
import { addDays, formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { WeeklyBody } from "../weekly-body";
import { WeeklyEditor } from "../weekly-client";

export const dynamic = "force-dynamic";

export default async function WeeklyPage({ params }: PageProps<"/reports/weekly/[id]">) {
  const auth = await requirePage("reports.view", "dashboard.view", "reports.weekly");
  const { id } = await params;
  const db = getDb();
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, Number(id))).get();
  if (!r || r.deletedAt) notFound();
  const canEdit = auth.can("reports.weekly");
  if (r.status !== "approved" && !canEdit && !auth.can("reports.view")) redirect("/forbidden");
  const d = r.data as WeeklyData;
  return (
    <div className="max-w-5xl space-y-5">
      <Breadcrumb items={[{ href: "/reports/weekly", label: "รายงานประจำสัปดาห์" }, { label: formatThaiDate(r.weekStart) }]} />
      <PageHeader en="Weekly Report" title={`รายงานประจำสัปดาห์ ${formatThaiDate(r.weekStart)} – ${formatThaiDate(addDays(r.weekStart, 6))}`}
        actions={<span className="flex flex-wrap gap-2">
          <Link href={`/print/weekly-report/${r.id}`} target="_blank" className="btn-ghost"><Printer size={18} aria-hidden /> พิมพ์ / PDF</Link>
          <a href={`/api/weekly-report/${r.id}/docx`} className="btn-ghost"><FileText size={18} aria-hidden /> Word</a>
        </span>} />
      {r.status === "approved"
        ? <Alert tone="ok">อนุมัติแล้วโดย {userNameMap(db).get(r.approvedBy ?? 0)} เมื่อ {formatThaiDateTime(r.approvedAt)} — ตัวเลขเป็นยอด ณ วันอนุมัติ</Alert>
        : <Alert tone="warn">ร่าง — ตัวเลขรวบรวมล่าสุด {formatThaiDateTime(r.updatedAt)} · อนุมัติแล้วตัวเลขจะคงที่</Alert>}
      {canEdit && <WeeklyEditor id={r.id} status={r.status} monday={r.weekStart} initial={{ issues: r.issues ?? "", nextPlan: r.nextPlan ?? "", note: r.note ?? "" }} />}
      <section className="card"><WeeklyBody d={d} issues={r.issues} nextPlan={r.nextPlan} note={r.note} /></section>
    </div>
  );
}
