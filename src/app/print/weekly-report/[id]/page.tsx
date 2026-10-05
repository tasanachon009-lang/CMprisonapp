import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import type { WeeklyData } from "@/lib/services/weekly-report";
import { userNameMap } from "@/lib/queries/names";
import { logPrint } from "@/lib/print";
import { addDays, formatThaiDate } from "@/lib/thai-date";
import { WeeklyBody } from "../../../(app)/reports/weekly/weekly-body";
import { DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/** รายงานประจำสัปดาห์ แบบบันทึกข้อความ (สเปก 18.2) — ไม่มีชื่อผู้ต้องขัง */
export default async function WeeklyPrint({ params }: PageProps<"/print/weekly-report/[id]">) {
  const auth = await requirePage("reports.view", "dashboard.view", "reports.weekly");
  const { id } = await params;
  const db = getDb();
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, Number(id))).get();
  if (!r || r.deletedAt) notFound();
  if (r.status !== "approved" && !auth.can("reports.weekly") && !auth.can("reports.view")) redirect("/forbidden");
  const footer = await logPrint(auth, "weekly_report", r.id);
  const org = `${getSetting<string>(db, "org.unitName", "")} ${getSetting<string>(db, "org.name", "")}`.trim();
  const to = getSetting<string>(db, "docs.weeklyTo", "ผู้อำนวยการสถานพยาบาล");
  const signer = r.approvedBy ? userNameMap(db).get(r.approvedBy) : null;
  return (
    <div className="sheet">
      {r.status !== "approved" && <p className="no-print" style={{ color: "#b91c1c", fontWeight: 700 }}>ร่าง — ยังไม่อนุมัติ</p>}
      <h1 style={{ fontSize: "1.6em" }}>บันทึกข้อความ</h1>
      <p><b>ส่วนราชการ</b> {org}</p>
      <p><b>ที่</b> .................................. <span style={{ marginLeft: 60 }}><b>วันที่</b> {r.approvedAt ? formatThaiDate(r.approvedAt.toISOString().slice(0, 10), "long") : ".................................."}</span></p>
      <p><b>เรื่อง</b> รายงานผลการดำเนินงานประจำสัปดาห์ ระหว่างวันที่ {formatThaiDate(r.weekStart, "long")} – {formatThaiDate(addDays(r.weekStart, 6), "long")}</p>
      <p><b>เรียน</b> {to}</p>
      <p style={{ textIndent: "2.5cm", marginTop: 8 }}>ขอรายงานผลการดำเนินงานประจำสัปดาห์ ดังนี้</p>
      <WeeklyBody d={r.data as WeeklyData} issues={r.issues} nextPlan={r.nextPlan} note={r.note} compact />
      <p style={{ textIndent: "2.5cm", marginTop: 10 }}>จึงเรียนมาเพื่อโปรดทราบ</p>
      <div style={{ marginTop: "16mm", marginLeft: "50%", textAlign: "center" }}>
        <p>ลงชื่อ ......................................................</p>
        <p>({signer ?? "......................................................"})</p>
        <p>ผู้รายงาน</p>
      </div>
      <DocFooter text={footer} />
    </div>
  );
}
