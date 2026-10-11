import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { Printer, FileText } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { periodEndOf, type WeeklyData } from "@/lib/services/weekly-report";
import { reportModel, periodTitle } from "@/lib/services/report-memo";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDateTime } from "@/lib/thai-date";
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
  const m = reportModel({ ...(r.data as WeeklyData), monday: r.weekStart, sunday: periodEndOf(r) });
  const title = `รายงานผลการดำเนินงาน${periodTitle(m.kind, m.from, m.to)}`;
  return (
    <div className="max-w-6xl space-y-5">
      <Breadcrumb items={[{ href: "/reports/weekly", label: "รายงานประจำสัปดาห์/เดือน" }, { label: periodTitle(m.kind, m.from, m.to) }]} />
      <PageHeader en={m.kind === "monthly" ? "Monthly Report" : "Weekly Report"} title={title}
        help="บันทึกข้อความที่เสนอผู้บริหารมี 1 หน้า ตารางรายละเอียดอยู่ในสิ่งที่ส่งมาด้วย แสดงเฉพาะคาบที่ต่างจากแผน ไม่ได้จัด หรือมีเหตุการณ์ คาบที่ยังไม่บันทึกผลแสดงเป็นจำนวนรวมต่อรุ่น อนุมัติแล้วตัวเลขจะคงที่"
        actions={<span className="flex flex-wrap gap-2">
          <Link href={`/print/weekly-report/${r.id}`} target="_blank" className="btn-ghost"><Printer size={18} aria-hidden /> พิมพ์ / PDF</Link>
          <a href={`/api/weekly-report/${r.id}/docx`} className="btn-ghost"><FileText size={18} aria-hidden /> Word</a>
        </span>} />
      {r.status === "approved"
        ? <Alert tone="ok">อนุมัติแล้วโดย {userNameMap(db).get(r.approvedBy ?? 0)} เมื่อ {formatThaiDateTime(r.approvedAt)} — ตัวเลขเป็นยอด ณ วันอนุมัติ</Alert>
        : <Alert tone="warn">ร่าง — ตัวเลขรวบรวมล่าสุด {formatThaiDateTime(r.updatedAt)}</Alert>}
      <WeeklyBody m={m} issues={r.issues} nextPlan={r.nextPlan} note={r.note} />
      {canEdit && (
        <WeeklyEditor id={r.id} status={r.status} kind={m.kind} period={m.kind === "monthly" ? r.weekStart.slice(0, 7) : r.weekStart}
          initial={{ issues: r.issues ?? "", nextPlan: r.nextPlan ?? "", note: r.note ?? "" }}
          unrecorded={r.status === "approved" ? [] : m.unrecordedList} />
      )}
    </div>
  );
}
