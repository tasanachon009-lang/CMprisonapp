import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { reportDocument } from "@/lib/services/report-doc";
import { docxOf } from "@/lib/docs/docx";

/** รายงานประจำสัปดาห์/เดือนเป็น Word — แม่แบบบันทึกข้อความกลาง (18.3A) + สิ่งที่ส่งมาด้วย เหมือนหน้าพิมพ์ · ไม่มีชื่อผู้ต้องขัง */
export async function GET(_req: Request, ctx: RouteContext<"/api/weekly-report/[id]/docx">) {
  let auth;
  try {
    auth = await requireAction("reports.view", "dashboard.view", "reports.weekly");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const db = getDb();
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, Number(id))).get();
  if (!r || r.deletedAt) return new Response("ไม่พบรายงาน", { status: 404 });
  if (r.status !== "approved" && !auth.can("reports.weekly") && !auth.can("reports.view")) return new Response("รายงานยังไม่อนุมัติ", { status: 403 });
  const { view, annex } = reportDocument(db, r);
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "doc-assets", "garuda.png");
  const buf = await docxOf(view, fs.existsSync(file) ? fs.readFileSync(file) : null, annex);
  writeAudit(db, { userId: auth.user.id, action: "export", entity: "weekly_report_docx", entityId: r.id });
  const name = r.kind === "monthly" ? `รายงานประจำเดือน-${r.weekStart.slice(0, 7)}.docx` : `รายงานประจำสัปดาห์-${r.weekStart}.docx`;
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}` },
  });
}
