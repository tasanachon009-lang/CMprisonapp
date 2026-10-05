import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { createPdf, line, text } from "@/lib/pdf/core";
import { drawKtb } from "@/lib/pdf/ktb";
import { drawVoucher } from "@/lib/pdf/voucher";
import { drawSummary } from "@/lib/pdf/report";
import { printOffsets, PRINT_FORMS, type PrintForm } from "@/lib/pdf/offsets";
import { todayISO } from "@/lib/thai-date";
import type { Payee } from "@/lib/services/pay-docs";

/** ใบทดสอบตำแหน่งการพิมพ์ (ข้อมูลตัวอย่าง ไม่ใช่บุคคลจริง) + เครื่องหมายเล็ง 20 มม. จากขอบ สำหรับวัดด้วยไม้บรรทัด */
const SAMPLE: Payee = {
  key: "sample", kind: "external", userId: null, instructorId: null, prefix: "นาย", firstName: "ตัวอย่าง", lastName: "ทดสอบพิมพ์", fullName: "นายตัวอย่าง ทดสอบพิมพ์",
  position: null, organization: null, nationalId: "1101700230705", phone: "0800000000", email: "sample@example.com",
  addr: { houseNo: "1/1", moo: "2", soi: null, road: "ทดสอบ", subdistrict: "ศรีภูมิ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" },
  payeeType: "person", companyName: null, bank: "ธนาคารกรุงไทย", bankBranch: "ทดสอบ", accountType: "savings", accountName: "นายตัวอย่าง ทดสอบพิมพ์", accountNo: "0000000000",
  notifyChannel: "both", missing: [], updatedAt: null, grossSatang: 360000, taxSatang: 0, netSatang: 360000, sessions: 3, hours: 6, firstDate: todayISO(),
  lines: [1, 2, 3].map((i) => ({ sessionId: i, cohortId: 0, staffId: i, key: "sample", name: "", kind: "external" as const, userId: null, instructorId: null, date: todayISO(), startTime: "", title: `หัวข้อตัวอย่าง ${i}`, hours: 2, factor: 1, splitMethod: "full" as const, rateId: null, perHourSatang: 60000, grossSatang: 120000, capCutSatang: 0, amountSatang: 120000, payable: true, note: null })),
};

export async function GET(req: Request) {
  try {
    await requireAction("settings.manage");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const form = (new URL(req.url).searchParams.get("form") ?? "ktb") as PrintForm;
  if (!(form in PRINT_FORMS)) return new Response("ไม่รู้จักแบบฟอร์ม", { status: 400 });
  const db = getDb();
  const off = printOffsets(db)[form];
  const org = getSetting<string>(db, "org.name", "");
  const pdf = await createPdf();
  if (form === "ktb") await drawKtb(pdf, SAMPLE, { orgName: org, headTitle: getSetting<string>(db, "org.headTitle", ""), date: todayISO() }, off);
  else if (form === "voucher") await drawVoucher(pdf, SAMPLE, { orgName: org, project: "หลักสูตรตัวอย่าง รุ่นที่ 1/2570", corner: getSetting<string>(db, "docs.voucherCorner", ""), payerName: "", date: todayISO() }, off);
  else await drawSummary(pdf, [SAMPLE], { project: "หลักสูตรตัวอย่าง", orgName: org, unitName: "", total: SAMPLE.grossSatang, batch: { dateFrom: todayISO(), dateTo: todayISO() } }, off);
  // เครื่องหมายเล็ง: วาดในหน้าเดียวกัน (เลื่อนตามค่าปรับด้วย) — กระดาษที่พิมพ์ออกมาต้องวัดได้ 20 มม. จากขอบซ้าย/บน
  const page = pdf.doc.getPage(0);
  for (const [x, y] of [[20, 20], [190, 20], [20, 277], [190, 277]]) {
    line(page, x - 4, y, x + 4, y, { width: 0.2 });
    line(page, x, y - 4, x, y + 4, { width: 0.2 });
  }
  text(pdf, page, `ใบทดสอบตำแหน่ง (${PRINT_FORMS[form]}) — เครื่องหมาย + อยู่ห่างขอบ 20 มม. · ค่าปรับปัจจุบัน ซ้าย/ขวา ${off.dx} มม. บน/ล่าง ${off.dy} มม.`, { x: 105, y: 292, size: 11, align: "center" });
  return new Response(new Uint8Array(await pdf.doc.save()), { headers: { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=print-test.pdf", "Cache-Control": "no-store" } });
}
