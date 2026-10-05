import "server-only";
import layout from "./layouts/ktb.json";
import { addPage, drawBackground, rect, text, tick, type Pdf } from "./core";
import { ACCOUNT_TYPE_LABEL, digitsOnly, formatAccountNo } from "../instructor-rules";
import { THAI_MONTHS, parseISO } from "../thai-date";
import type { Payee } from "../services/pay-docs";

/**
 * แบบแจ้งข้อมูลการรับเงินโอนผ่านระบบ KTB Corporate Online (สเปก 11.5D)
 * พื้นหลัง = ไฟล์ต้นฉบับใน docs/forms · วางข้อความตามพิกัดใน layouts/ktb.json
 */
type Field = { x0: number; x1: number; y: number; align: "left" | "center"; pad?: number };
const F = layout.fields as Record<string, Field>;

/** date = null → ไม่ใส่วันที่ (เว้นเส้นจุดไว้เขียนมือ) */
export type KtbCtx = { orgName: string; headTitle: string; date: string | null };

function put(pdf: Pdf, page: Parameters<typeof text>[1], key: string, value: string | null | undefined) {
  const f = F[key];
  if (!f || !value?.trim()) return;
  const pad = f.pad ?? 1;
  const y = f.y - layout.lift;
  if (f.align === "center") text(pdf, page, value, { x: (f.x0 + f.x1) / 2, y, size: layout.size, align: "center", maxWidth: f.x1 - f.x0 - 1, minSize: 8 });
  else text(pdf, page, value, { x: f.x0 + pad, y, size: layout.size, maxWidth: f.x1 - f.x0 - pad - 1, minSize: 8 });
}

export async function drawKtb(pdf: Pdf, p: Payee, ctx: KtbCtx, offset = { dx: 0, dy: 0 }, opts: { background?: boolean } = {}) {
  const page = addPage(pdf, offset);
  if (opts.background !== false) await drawBackground(pdf, page, layout.background);

  // ข้อความที่ต้นฉบับพิมพ์ตายตัว: ต่างจากตั้งค่า → ปิดทับแล้วพิมพ์ค่าจากตั้งค่า
  const m = layout.masks;
  if (ctx.headTitle && ctx.headTitle !== m.headTitle.template) {
    const [x, y, w, h] = m.headTitle.rect;
    rect(page, x, y, w, h, { fill: [1, 1, 1], stroke: false });
    text(pdf, page, ctx.headTitle, { x: m.headTitle.x, y: m.headTitle.y, size: layout.size, maxWidth: m.headTitle.maxWidth });
  }
  if (ctx.orgName && ctx.orgName !== m.orgSentence.template) {
    const [x, y, w, h] = m.orgSentence.rect;
    rect(page, x, y, w, h, { fill: [1, 1, 1], stroke: false });
    text(pdf, page, m.orgSentence.text.replace("{org}", ctx.orgName), { x: m.orgSentence.x, y: m.orgSentence.y, size: layout.size, maxWidth: m.orgSentence.maxWidth, minSize: 10 });
  }

  if (ctx.date) {
    const { y, m: mo, d } = parseISO(ctx.date);
    put(pdf, page, "day", String(d));
    put(pdf, page, "month", THAI_MONTHS[mo - 1]);
    put(pdf, page, "year", String(y + 543));
  }

  const company = p.payeeType === "company";
  put(pdf, page, "name", company && p.companyName ? p.companyName : p.fullName);

  // เลขบัตร/เลขผู้เสียภาษี: ช่องละ 1 หลัก
  const ib = layout.idBoxes;
  digitsOnly(p.nationalId).slice(0, ib.count).split("").forEach((c, i) => {
    text(pdf, page, c, { x: ib.x + ib.w * i + ib.w / 2, y: ib.baseline, size: layout.size, align: "center" });
  });

  put(pdf, page, "houseNo", [p.addr.houseNo, p.addr.moo ? `หมู่ ${p.addr.moo}` : null].filter(Boolean).join(" "));
  put(pdf, page, "soi", p.addr.soi || "-");
  put(pdf, page, "road", p.addr.road || "-");
  put(pdf, page, "subdistrict", p.addr.subdistrict);
  put(pdf, page, "district", p.addr.district);
  put(pdf, page, "province", p.addr.province);
  put(pdf, page, "postcode", p.addr.postcode);

  // ติ๊กและเติมเฉพาะช่องที่ตรงกับประเภทผู้รับ อีกช่องเว้นว่าง
  const pre = company ? "company" : "person";
  const c = layout.checks[pre];
  tick(page, c.x, c.y, c.w, c.h);
  put(pdf, page, `${pre}Bank`, p.bank);
  put(pdf, page, `${pre}Branch`, p.bankBranch);
  put(pdf, page, `${pre}Type`, p.accountType ? ACCOUNT_TYPE_LABEL[p.accountType] ?? p.accountType : null);
  put(pdf, page, `${pre}AccName`, p.accountName);
  put(pdf, page, `${pre}AccNo`, p.accountNo ? formatAccountNo(p.accountNo) : null);

  const sms = p.notifyChannel === "sms" || p.notifyChannel === "both";
  const email = p.notifyChannel === "email" || p.notifyChannel === "both";
  if (sms) { const b = layout.checks.sms; tick(page, b.x, b.y, b.w, b.h); put(pdf, page, "smsPhone", p.phone); }
  if (email) { const b = layout.checks.email; tick(page, b.x, b.y, b.w, b.h); put(pdf, page, "email", p.email); }

  put(pdf, page, "signName", p.fullName);
  return page;
}
