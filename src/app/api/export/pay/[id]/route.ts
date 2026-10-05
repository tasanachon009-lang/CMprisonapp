import ExcelJS from "exceljs";
import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { docContext, payees } from "@/lib/services/pay-docs";
import { formatThaiDate } from "@/lib/thai-date";
import { writeAudit } from "@/lib/audit";

/** ส่งออก Excel ของรอบเบิกที่อนุมัติแล้ว (สเปก 11.5D): สรุปใหญ่ + รายละเอียดรายคาบ — ไม่มีข้อมูลผู้ต้องขัง · ไม่มีเลขบัตร/เลขบัญชี */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/pay/[id]">) {
  let auth;
  try {
    auth = await requireAction("pay.view");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const db = getDb();
  let c, people;
  try {
    c = docContext(db, Number(id));
    people = payees(db, c.batch.id);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "ไม่พบรอบเบิก", { status: 400 });
  }
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("สรุปใหญ่");
  s.columns = [
    { header: "ลำดับ", key: "no", width: 7 }, { header: "ชื่อ-สกุล", key: "name", width: 30 }, { header: "ภายใน/ภายนอก", key: "kind", width: 14 },
    { header: "จำนวนคาบ", key: "sessions", width: 10 }, { header: "จำนวนชั่วโมง", key: "hours", width: 12 }, { header: "จำนวนเงิน (บาท)", key: "gross", width: 16 },
    { header: "ภาษี ณ ที่จ่าย", key: "tax", width: 14 }, { header: "สุทธิ", key: "net", width: 14 },
  ];
  s.getRow(1).font = { bold: true };
  let n = 0;
  for (const kind of ["internal", "external"] as const) {
    const list = people.filter((p) => p.kind === kind);
    if (!list.length) continue;
    s.addRow({ name: kind === "internal" ? "วิทยากรภายใน" : "วิทยากรภายนอก" }).font = { bold: true };
    for (const p of list) s.addRow({ no: ++n, name: p.fullName, kind: kind === "internal" ? "ภายใน" : "ภายนอก", sessions: p.sessions, hours: p.hours, gross: p.grossSatang / 100, tax: p.taxSatang / 100, net: p.netSatang / 100 });
    s.addRow({ name: `รวม${kind === "internal" ? "ภายใน" : "ภายนอก"}`, gross: list.reduce((a, p) => a + p.grossSatang, 0) / 100 }).font = { bold: true };
  }
  s.addRow({ name: "รวมทั้งสิ้น", gross: people.reduce((a, p) => a + p.grossSatang, 0) / 100, tax: people.reduce((a, p) => a + p.taxSatang, 0) / 100, net: people.reduce((a, p) => a + p.netSatang, 0) / 100 }).font = { bold: true };
  for (const col of ["gross", "tax", "net"]) s.getColumn(col).numFmt = "#,##0.00";

  const d = wb.addWorksheet("รายละเอียดรายคาบ");
  d.columns = [
    { header: "วันที่", key: "date", width: 14 }, { header: "หัวข้อ", key: "title", width: 40 }, { header: "วิทยากร", key: "who", width: 28 }, { header: "ภายใน/ภายนอก", key: "kind", width: 12 },
    { header: "ชม.สอนจริง", key: "hours", width: 10 }, { header: "ส่วนแบ่ง", key: "factor", width: 10 }, { header: "อัตรา (บาท/ชม.)", key: "rate", width: 14 },
    { header: "หักเพดานต่อวัน", key: "cap", width: 14 }, { header: "เงิน (บาท)", key: "amount", width: 14 },
  ];
  d.getRow(1).font = { bold: true };
  const lines = people.flatMap((p) => p.lines.map((l) => ({ l, p }))).sort((a, b) => a.l.date.localeCompare(b.l.date));
  for (const { l, p } of lines) d.addRow({ date: formatThaiDate(l.date), title: l.title, who: p.fullName, kind: p.kind === "internal" ? "ภายใน" : "ภายนอก", hours: l.hours, factor: Math.round(l.factor * 1000) / 1000, rate: l.perHourSatang / 100, cap: l.capCutSatang / 100, amount: l.amountSatang / 100 });
  for (const col of ["rate", "cap", "amount"]) d.getColumn(col).numFmt = "#,##0.00";

  writeAudit(db, { userId: auth.user.id, action: "export", entity: "pay_batch", entityId: c.batch.id, after: { people: people.length } });
  const name = `ค่าตอบแทน-${c.course.shortName}-${c.batch.dateFrom}.xlsx`;
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
