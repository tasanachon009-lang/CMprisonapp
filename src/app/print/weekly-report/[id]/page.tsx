import fs from "node:fs";
import path from "node:path";
import { notFound, redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { reportDocument } from "@/lib/services/report-doc";
import { logPrint } from "@/lib/print";
import { MemoSheet } from "../../document/[id]/sheet";

export const dynamic = "force-dynamic";

/**
 * รายงานประจำสัปดาห์/เดือน (สเปก 18.2, 18.2A, 18.2B) — บันทึกข้อความ 1 หน้า + สิ่งที่ส่งมาด้วย
 * ใช้แม่แบบบันทึกข้อความกลาง (18.3A) · ไม่มีชื่อผู้ต้องขัง
 */
export default async function WeeklyPrint({ params }: PageProps<"/print/weekly-report/[id]">) {
  const auth = await requirePage("reports.view", "dashboard.view", "reports.weekly");
  const { id } = await params;
  const db = getDb();
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, Number(id))).get();
  if (!r || r.deletedAt) notFound();
  if (r.status !== "approved" && !auth.can("reports.weekly") && !auth.can("reports.view")) redirect("/forbidden");
  await logPrint(auth, "weekly_report", r.id);
  const { view, annex } = reportDocument(db, r);
  const hasGaruda = fs.existsSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "doc-assets", "garuda.png"));
  return (
    <>
      {r.status !== "approved" && <p className="no-print" style={{ textAlign: "center", color: "#b91c1c", fontWeight: 700, padding: 8 }}>ร่าง — ยังไม่อนุมัติ</p>}
      <MemoSheet v={view} hasGaruda={hasGaruda} annex={annex} />
    </>
  );
}
