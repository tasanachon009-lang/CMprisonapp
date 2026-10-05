import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { docContext, payees, reconcile, markPrinted } from "@/lib/services/pay-docs";
import { batchView } from "@/lib/services/pay";
import { createPdf } from "@/lib/pdf/core";
import { drawKtb } from "@/lib/pdf/ktb";
import { drawVoucher } from "@/lib/pdf/voucher";
import { drawSummary, drawDetail } from "@/lib/pdf/report";
import { printOffsets } from "@/lib/pdf/offsets";
import { isValidISODate } from "@/lib/thai-date";
import { writeAudit } from "@/lib/audit";

/**
 * ชุดเอกสารส่งการเงินเป็น PDF เดียว (สเปก 11.5C/D, 22) — แบบฟอร์มราชการวางข้อความตามพิกัดด้วย pdf-lib
 * ?parts=summary,vouchers,detail · ktb=1|0 · who · order · keys · date=YYYY-MM-DD|none · payer · duplex=1
 * ตรวจยอดตรงกันทุกจุดก่อนสร้าง (ไม่ตรง = 409 พร้อมรายการจุดผิด) · บันทึกการพิมพ์ + สถานะ "พิมพ์แล้ว"
 */
export async function GET(req: Request, ctx: RouteContext<"/api/pay-docs/[id]">) {
  let auth;
  try {
    auth = await requireAction("pay.view");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const sp = new URL(req.url).searchParams;
  const db = getDb();
  try {
    const c = docContext(db, Number(id));
    const parts = new Set((sp.get("parts") || "summary,vouchers").split(","));
    const who = sp.get("who") === "internal" || sp.get("who") === "external" ? (sp.get("who") as "internal" | "external") : "all";
    const keys = sp.get("keys") ? sp.get("keys")!.split(",").filter(Boolean).slice(0, 200) : undefined;
    const people = payees(db, c.batch.id, { who, order: sp.get("order") === "first" ? "first" : "name", keys });
    const v = batchView(db, c.batch.id);
    const issues = reconcile(c.batch, people, v.lines, who !== "all" || !!keys);
    if (issues.length) return new Response(`ยอดไม่ตรงกัน — ยังพิมพ์ไม่ได้:\n${issues.join("\n")}`, { status: 409, headers: { "Content-Type": "text/plain; charset=utf-8" } });
    // วันที่ในเอกสาร: เลือกได้ / none = ไม่ใส่ (เว้นเส้นจุดไว้เขียนมือ) · ค่าเริ่มต้น = วันสุดท้ายของรอบ
    const dateParam = sp.get("date");
    const date = dateParam === "none" ? null : dateParam && isValidISODate(dateParam) ? dateParam : c.batch.dateTo;
    const payer = (sp.get("payer") ?? "").slice(0, 120) || c.payerName;
    const showKtb = sp.get("ktb") ? sp.get("ktb") === "1" : c.showKtb;
    const duplex = sp.get("duplex") === "1";
    const off = printOffsets(db);

    const pdf = await createPdf();
    const blankIfOdd = (n: number) => { if (duplex && n % 2 === 1) pdf.doc.addPage(); };
    const total = people.reduce((a, p) => a + p.grossSatang, 0);
    if (parts.has("summary")) blankIfOdd(await drawSummary(pdf, people, { ...c, total, tax: v.tax }, off.report));
    if (parts.has("vouchers")) {
      for (const p of people) {
        blankIfOdd(await drawVoucher(pdf, p, { orgName: c.orgName, project: c.project, corner: c.corner, payerName: payer, date, tax: v.tax }, off.voucher));
        if (showKtb) blankIfOdd((await drawKtb(pdf, p, { orgName: c.orgName, headTitle: c.headTitle, date }, off.ktb), 1));
      }
    }
    if (parts.has("detail")) await drawDetail(pdf, people, c, off.report);
    if (!pdf.doc.getPageCount()) return new Response("ไม่มีเอกสารที่เลือก", { status: 400 });
    const bytes = await pdf.doc.save();

    writeAudit(db, { userId: auth.user.id, action: "print", entity: "pay_bundle_pdf", entityId: c.batch.id, after: { parts: [...parts], people: people.length } });
    if (parts.has("vouchers")) markPrinted(db, c.batch.id, people, { userId: auth.user.id });
    const name = `เอกสารการเงิน-${c.course.shortName}-${c.batch.dateFrom}.pdf`;
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`, "Cache-Control": "no-store" },
    });
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "สร้างเอกสารไม่สำเร็จ", { status: 400, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}
