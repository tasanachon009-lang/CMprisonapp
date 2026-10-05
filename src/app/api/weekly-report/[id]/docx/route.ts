import { eq } from "drizzle-orm";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType } from "docx";
import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { writeAudit } from "@/lib/audit";
import type { WeeklyData } from "@/lib/services/weekly-report";
import { userNameMap } from "@/lib/queries/names";
import { addDays, formatThaiDate } from "@/lib/thai-date";

/** รายงานประจำสัปดาห์เป็น Word (บันทึกข้อความ) — ฟอนต์ TH Sarabun New 16pt · ไม่มีชื่อผู้ต้องขัง */
const FONT = "TH Sarabun New";
const run = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: (o.size ?? 16) * 2, bold: o.bold });
const para = (children: TextRun[] | string, o: { indent?: boolean; center?: boolean; bold?: boolean; size?: number } = {}) =>
  new Paragraph({ children: typeof children === "string" ? [run(children, o)] : children, alignment: o.center ? AlignmentType.CENTER : undefined, indent: o.indent ? { firstLine: 1418 } : undefined });
const b = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

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
  const d = r.data as WeeklyData;
  const org = `${getSetting<string>(db, "org.unitName", "")} ${getSetting<string>(db, "org.name", "")}`.trim();
  const to = getSetting<string>(db, "docs.weeklyTo", "ผู้อำนวยการสถานพยาบาล");
  const signer = r.approvedBy ? userNameMap(db).get(r.approvedBy) : null;
  const done = d.activities.filter((a) => a.done);
  const notDone = d.activities.filter((a) => !a.done && a.result !== "ยังไม่ถึงวัน");
  const cell = (t: string, bold = false) => new TableCell({ children: [para([run(t, { bold, size: 14 })])] });
  const table = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({ tableHeader: true, children: ["วันที่", "หัวข้อ", "รุ่น", "ผู้รับผิดชอบ", "ผู้เข้าร่วม", "ผล / สรุป"].map((h) => cell(h, true)) }),
      ...done.map((a) => new TableRow({ children: [formatThaiDate(a.date), a.title, a.cohort, a.staff || "-", String(a.participants ?? "-"), `${a.result}${a.summary ? ` — ${a.summary}` : ""}`].map((t) => cell(t)) })),
    ],
  });
  const lines = (s: string | null) => (s?.trim() ? s.split("\n").map((x) => para(x)) : [para("-")]);
  const doc = new Document({
    sections: [{
      properties: { page: { margin: { top: 1418, left: 1701, right: 1134, bottom: 1134 } } },
      children: [
        para("บันทึกข้อความ", { center: true, bold: true, size: 29 }),
        para([run("ส่วนราชการ ", { bold: true }), run(org)]),
        para([run("ที่ ", { bold: true }), run("....................................     "), run("วันที่ ", { bold: true }), run(r.approvedAt ? formatThaiDate(r.approvedAt.toISOString().slice(0, 10), "long") : "....................................")]),
        para([run("เรื่อง ", { bold: true }), run(`รายงานผลการดำเนินงานประจำสัปดาห์ ระหว่างวันที่ ${formatThaiDate(r.weekStart, "long")} – ${formatThaiDate(addDays(r.weekStart, 6), "long")}`)]),
        para([run("เรียน ", { bold: true }), run(to)]),
        para("ขอรายงานผลการดำเนินงานประจำสัปดาห์ ดังนี้", { indent: true }),
        para("1. ภาพรวม", { bold: true }),
        para(`รุ่นที่ดำเนินการ ${d.overview.cohorts.length} รุ่น · ผู้เข้ารับการฟื้นฟู ${d.overview.people} คน · รับใหม่ ${d.overview.newThisWeek} · จบหลักสูตร ${d.overview.completed} · ออกก่อนกำหนด ${d.overview.left} · เข้าร่วมกิจกรรม ${d.overview.attendancePct ?? "-"}%`),
        ...d.overview.cohorts.map((c) => para(`• ${c.label}: ${c.enrolled} คน (กำลังอบรม ${c.active})`)),
        para(`2. กิจกรรมที่ทำตามตาราง (${done.length} คาบ)`, { bold: true }),
        ...(done.length ? [table] : [para("-")]),
        ...(notDone.length ? [para(`ไม่ได้ทำ / ยกเลิก / ยังไม่บันทึกผล (${notDone.length} คาบ)`, { bold: true }), ...notDone.map((a) => para(`• ${formatThaiDate(a.date)} ${a.title} (${a.cohort}) — ${a.result}${a.reason ? `: ${a.reason}` : ""}`))] : []),
        para("3. ผลประเมิน / พฤติกรรม (ตัวเลขรวม)", { bold: true }),
        para(`แบบประเมินที่บันทึก: ${d.assessments.length ? d.assessments.map((a) => `${a.form} (${a.round}) ${a.count}`).join(" · ") : "-"}`),
        para(`บันทึกพฤติกรรม: ${d.behavior.length ? d.behavior.map((x) => `${x.tone} ${x.count}`).join(" · ") : "-"}`),
        para("4. บสต. · ค่าตอบแทน · งบประมาณ", { bold: true }),
        para(`บสต. ลงแล้วสัปดาห์นี้ ${d.bst.done.find((x) => x.system === "bst")?.count ?? 0} รายการ · รท.101 ${d.bst.done.find((x) => x.system === "rt101")?.count ?? 0} รายการ`),
        para(`ค่าตอบแทนอนุมัติสัปดาห์นี้ ${b(d.money.approvedPaySatang)} บาท · งบปีงบ ${d.money.budgetFiscalYear} คงเหลือ ${b(d.money.budgetRemainingSatang)} บาท`),
        para("5. ปัญหา อุปสรรค ข้อเสนอแนะ", { bold: true }),
        ...lines(r.issues),
        para("6. แผนสัปดาห์หน้า", { bold: true }),
        ...lines(r.nextPlan),
        ...(r.note?.trim() ? [para("หมายเหตุ", { bold: true }), ...lines(r.note)] : []),
        para("จึงเรียนมาเพื่อโปรดทราบ", { indent: true }),
        para(""), para(""),
        para("ลงชื่อ ......................................................", { center: true }),
        para(`(${signer ?? "......................................................"})`, { center: true }),
        para("ผู้รายงาน", { center: true }),
      ],
    }],
  });
  writeAudit(db, { userId: auth.user.id, action: "export", entity: "weekly_report_docx", entityId: r.id });
  const buf = await Packer.toBuffer(doc);
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`รายงานประจำสัปดาห์-${r.weekStart}.docx`)}` },
  });
}
