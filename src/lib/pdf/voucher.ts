import "server-only";
import layout from "./layouts/voucher.json";
import { addPage, drawBackground, line, rect, text, widthMM, wrap, type Pdf } from "./core";
import { paginateVoucher, type VoucherCapacity, type VoucherRow } from "../pay/voucher-pages";
import { voucherRows } from "../pay/voucher-rows";
import { bahtText, bahtCols } from "../pay/thai-baht";
import { THAI_MONTHS, parseISO } from "../thai-date";
import type { Payee } from "../services/pay-docs";

/**
 * ใบสำคัญรับเงิน (สำหรับวิทยากร) — สเปก 11.5C · วาดแบบฟอร์มตามพิกัดใน layouts/voucher.json
 * 1 คน 1 รอบ · แถวละ 1 คาบ · ยอดยกไป/ยกมา · ส่วนรวม/ตัวอักษร/ลายเซ็นอยู่หน้าสุดท้าย · ไม่มีท้ายกระดาษ "พิมพ์โดย"
 */
type Item = { label?: string; field?: string; x?: number; x0?: number; x1?: number };
const T = layout.table;
const ITEM_W = T.w - T.colMoney - T.colSt;
const headerBottom = (top: number) => top + T.headerRow * 2;

/** จำนวนแถวต่อหน้า คำนวณจากเรขาคณิตใน JSON */
export function voucherCapacity(): VoucherCapacity {
  const firstStart = headerBottom(T.top), contStart = headerBottom(layout.continuation.tableTop);
  const n = (from: number, to: number) => Math.floor((to - from) / T.rowH + 1e-6);
  return {
    single: n(firstStart, T.rowsEndLast),
    first: n(firstStart, T.rowsEndOther) - 1,
    middle: n(contStart, T.rowsEndOther) - 2,
    last: n(contStart, T.rowsEndLast) - 1,
  };
}

export type VoucherCtx = { orgName: string; project: string; corner: string; payerName: string; date: string | null };

export async function drawVoucher(pdf: Pdf, p: Payee, ctx: VoucherCtx, offset = { dx: 0, dy: 0 }) {
  const rows = voucherRows(p.lines);
  const fitSize = (r: VoucherRow) => { let s = T.rowSize; while (s > T.rowMinSize && widthMM(pdf.regular, r.text, s) > ITEM_W - 3) s -= 0.5; return s; };
  const weightOf = (r: VoucherRow) => (widthMM(pdf.regular, r.text, fitSize(r)) > ITEM_W - 3 ? 2 : 1);
  const pages = paginateVoucher(rows, voucherCapacity(), weightOf);

  const values: Record<string, string | null> = (() => {
    const d = ctx.date ? parseISO(ctx.date) : null;
    return {
      org: ctx.orgName, project: ctx.project, day: d ? String(d.d) : null, month: d ? THAI_MONTHS[d.m - 1] : null, year: d ? String(d.y + 543) : null,
      name: p.fullName, nationalId: p.nationalId, houseNo: p.addr.houseNo, moo: p.addr.moo, soi: p.addr.soi, road: p.addr.road,
      subdistrict: p.addr.subdistrict, district: p.addr.district, province: p.addr.province, phone: p.phone,
    };
  })();

  for (const pg of pages) {
    const page = addPage(pdf, offset);
    if (layout.background) await drawBackground(pdf, page, layout.background);
    const [fx, fy, fw, fh] = layout.frame;
    rect(page, fx, fy, fw, fh, { width: 0.3 });
    let top: number;
    if (pg.no === 1) {
      if (ctx.corner) text(pdf, page, ctx.corner, { x: layout.corner.x, y: layout.corner.y, size: layout.corner.size, align: "right" });
      text(pdf, page, layout.title.text, { x: layout.title.x, y: layout.title.y, size: layout.title.size, bold: true, align: "center" });
      for (const ln of layout.lines as Array<{ y: number; items: Item[] }>) {
        for (const it of ln.items) {
          if (it.label) { text(pdf, page, it.label, { x: it.x!, y: ln.y, size: layout.size }); continue; }
          const x0 = it.x0!, x1 = it.x1!;
          line(page, x0, ln.y + 0.6, x1, ln.y + 0.6, { dotted: true });
          // ช่องไม่บังคับ (หมู่ ซอย ถนน) ว่าง = "-" · ช่องจำเป็นว่าง = เว้นเส้นจุดไว้เขียนมือ
          const v = values[it.field!] ?? (layout.optionalFields.includes(it.field!) ? "-" : null);
          if (v) text(pdf, page, v, { x: (x0 + x1) / 2, y: ln.y - layout.lift, size: layout.size, align: "center", maxWidth: x1 - x0 - 1, minSize: 8 });
        }
      }
      top = T.top;
    } else {
      text(pdf, page, `ใบสำคัญรับเงิน — ${p.fullName} · หน้า ${pg.no}/${pg.of}`, { x: fx + fw - 6, y: layout.continuation.headerY, size: 14, align: "right" });
      top = layout.continuation.tableTop;
    }
    if (pg.no === 1 && pg.of > 1) text(pdf, page, `หน้า 1/${pg.of}`, { x: fx + fw - 6, y: layout.title.y + 0.5, size: 14, align: "right" });

    // หัวตาราง: รายการ | จำนวนเงิน (บาท | สต.)
    const x = T.x, xm = T.x + ITEM_W, xs = xm + T.colMoney, xe = T.x + T.w;
    const hb = headerBottom(top);
    rect(page, x, top, T.w, T.headerRow * 2);
    line(page, xm, top, xm, hb);
    line(page, xm, top + T.headerRow, xe, top + T.headerRow);
    line(page, xs, top + T.headerRow, xs, hb);
    text(pdf, page, "รายการ", { x: x + ITEM_W / 2, y: top + T.headerRow + 2.2, size: layout.size, bold: true, align: "center" });
    text(pdf, page, "จำนวนเงิน", { x: (xm + xe) / 2, y: top + T.headerRow - 1.8, size: layout.size, bold: true, align: "center" });
    text(pdf, page, "บาท", { x: (xm + xs) / 2, y: hb - 1.8, size: 15, bold: true, align: "center" });
    text(pdf, page, "สต.", { x: (xs + xe) / 2, y: hb - 1.8, size: 15, bold: true, align: "center" });

    let y = hb;
    const row = (label: string | null, satang: number | null, o: { bold?: boolean; right?: boolean; lines?: string[]; size?: number } = {}) => {
      const n = o.lines?.length ?? 1;
      const h = T.rowH * n;
      rect(page, x, y, T.w, h);
      line(page, xm, y, xm, y + h);
      line(page, xs, y, xs, y + h);
      const base = (k: number) => y + T.rowH * (k + 1) - 2;
      if (o.lines) o.lines.forEach((t, k) => text(pdf, page, t, { x: x + 1.5, y: base(k), size: o.size ?? T.rowSize }));
      else if (label) text(pdf, page, label, o.right ? { x: xm - 2, y: base(0), size: layout.size, bold: o.bold, align: "right" } : { x: x + 1.5, y: base(0), size: o.size ?? T.rowSize, bold: o.bold, maxWidth: ITEM_W - 3, minSize: T.rowMinSize });
      if (satang != null) {
        const [b, s] = bahtCols(satang);
        text(pdf, page, b, { x: xs - 1.5, y: base(n - 1), size: T.rowSize, align: "right" });
        text(pdf, page, s, { x: (xs + xe) / 2, y: base(n - 1), size: T.rowSize, align: "center" });
      }
      y += h;
    };
    if (pg.carryIn != null) row("ยอดยกมา", pg.carryIn, { right: true });
    for (const r of pg.rows) {
      if (weightOf(r) === 2) row(null, r.amountSatang, { lines: wrap(pdf.regular, r.text, T.rowMinSize, ITEM_W - 3).slice(0, 2), size: T.rowMinSize });
      else row(r.text, r.amountSatang, { size: fitSize(r) });
    }
    for (let k = 0; k < pg.padding; k++) row(null, null);
    if (pg.carryOut != null) row("ยอดยกไป", pg.carryOut, { right: true });
    if (pg.isLast) {
      row("รวมเป็นเงิน", p.grossSatang, { bold: true, right: true });
      const w = layout.words;
      const wy = y + w.gap;
      text(pdf, page, w.label, { x: w.x, y: wy, size: layout.size });
      line(page, w.x0, wy + 0.6, w.x1, wy + 0.6, { dotted: true });
      text(pdf, page, `(${bahtText(p.grossSatang)})`, { x: (w.x0 + w.x1) / 2, y: wy - layout.lift, size: layout.size, align: "center", maxWidth: w.x1 - w.x0 - 1 });
      const s = layout.sign;
      const sign = (sy: number, role: string, who: string) => {
        text(pdf, page, `ลงชื่อ ${".".repeat(48)} ${role}`, { x: s.x, y: sy, size: layout.size, align: "center" });
        text(pdf, page, `(${who})`, { x: s.x - 4, y: sy + s.nameGap, size: layout.size, align: "center" });
      };
      sign(wy + s.gap, s.receiver, p.fullName);
      sign(wy + s.gap * 2 + s.nameGap, s.payer, ctx.payerName || ".".repeat(48));
    }
  }
  return pages.length;
}
