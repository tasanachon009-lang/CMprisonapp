import "server-only";
import type { PDFPage } from "pdf-lib";
import { addPage, line, rect, text, type Pdf } from "./core";
import { bahtText } from "../pay/thai-baht";
import { formatThaiDate } from "../thai-date";
import type { Payee } from "../services/pay-docs";

/**
 * สรุปใหญ่ค่าตอบแทนวิทยากร + ตารางรายละเอียดรายคาบ (สเปก 11.5D) — เอกสารของหน่วยงานเอง (ไม่ใช่แบบฟอร์มตายตัว)
 * ขอบตามหนังสือราชการ: บน 25 ซ้าย 30 ขวา 20 ล่าง 20 มม. · หัวตารางซ้ำทุกหน้า · "หน้า x/y"
 */
const M = { top: 25, left: 30, right: 20, bottom: 20 };
const W = 210 - M.left - M.right;
const ROW = 7.5;
const money = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Col = { title: string; w: number; align?: "left" | "center" | "right" };
type Row = { cells: string[]; bold?: boolean; span?: boolean };

/** ตารางหลายหน้า: คืนจำนวนหน้าที่ใช้ */
function table(pdf: Pdf, cols: Col[], rows: Row[], o: { offset: { dx: number; dy: number }; head: (page: PDFPage, first: boolean) => number; footer: (page: PDFPage, y: number) => number; footerHeight: number }) {
  const pages: PDFPage[] = [];
  let page!: PDFPage, y = 0;
  const xs = cols.reduce<number[]>((a, c, i) => [...a, (a[i] ?? M.left) + c.w], [M.left]);
  const header = () => {
    rect(page, M.left, y, W, ROW + 1, { fill: [0.93, 0.93, 0.93] });
    cols.forEach((c, i) => { if (i) line(page, xs[i], y, xs[i], y + ROW + 1); text(pdf, page, c.title, { x: (xs[i] + xs[i + 1]) / 2, y: y + ROW - 1.4, size: 14, bold: true, align: "center", maxWidth: c.w - 1 }); });
    y += ROW + 1;
  };
  const newPage = () => { page = addPage(pdf, o.offset); pages.push(page); y = o.head(page, pages.length === 1); header(); };
  newPage();
  rows.forEach((r, k) => {
    const isLastRow = k === rows.length - 1;
    if (y + ROW > 297 - M.bottom - (isLastRow ? o.footerHeight : 6)) newPage();
    rect(page, M.left, y, W, ROW);
    if (r.span) {
      line(page, xs[cols.length - 2], y, xs[cols.length - 2], y + ROW);
      text(pdf, page, r.cells[0], { x: xs[cols.length - 2] - 2, y: y + ROW - 2, size: 15, bold: r.bold, align: "right" });
      text(pdf, page, r.cells[1], { x: xs[cols.length - 1] - 1.5, y: y + ROW - 2, size: 15, bold: r.bold, align: "right" });
    } else {
      cols.forEach((c, i) => {
        if (i) line(page, xs[i], y, xs[i], y + ROW);
        const v = r.cells[i] ?? "";
        const x = c.align === "right" ? xs[i + 1] - 1.5 : c.align === "center" ? (xs[i] + xs[i + 1]) / 2 : xs[i] + 1.5;
        text(pdf, page, v, { x, y: y + ROW - 2, size: 15, bold: r.bold, align: c.align ?? "left", maxWidth: c.w - 3 });
      });
    }
    y += ROW;
  });
  o.footer(page, y);
  pages.forEach((p, i) => text(pdf, p, `หน้า ${i + 1}/${pages.length}`, { x: 210 - M.right, y: 297 - 10, size: 12, align: "right" }));
  return pages.length;
}

/** budget = งบค่าวิทยากรของรุ่นจากหน้างบ (ยอดเดียวกัน) · approved = ค่าวิทยากรที่อนุมัติแล้วทุกรอบของรุ่น */
export type SummaryCtx = { project: string; orgName: string; unitName: string; total: number; tax: { enabled: boolean; pct: number }; batch: { dateFrom: string; dateTo: string }; budget?: { budget: number; approved: number; hasBudget: boolean } | null };

export async function drawSummary(pdf: Pdf, people: Payee[], c: SummaryCtx, offset = { dx: 0, dy: 0 }) {
  const cols: Col[] = [{ title: "ลำดับ", w: 12, align: "center" }, { title: "ชื่อ-สกุล", w: 50 }, { title: "ใน/นอก", w: 15, align: "center" }, { title: "คาบ", w: 11, align: "center" }, { title: "ชั่วโมง", w: 14, align: "center" }, { title: "จำนวนเงิน (บาท)", w: 25, align: "right" }, { title: "ลายมือชื่อผู้รับเงิน", w: W - 127 }];
  const rows: Row[] = [];
  let n = 0;
  for (const k of ["internal", "external"] as const) {
    const list = people.filter((p) => p.kind === k);
    if (!list.length) continue;
    rows.push({ cells: [k === "internal" ? "วิทยากรภายใน" : "วิทยากรภายนอก"], bold: true });
    for (const p of list) rows.push({ cells: [String(++n), p.fullName, k === "internal" ? "ภายใน" : "ภายนอก", String(p.sessions), String(p.hours), money(p.grossSatang), ""] });
    rows.push({ cells: [`รวม${k === "internal" ? "วิทยากรภายใน" : "วิทยากรภายนอก"}`, money(list.reduce((a, p) => a + p.grossSatang, 0))], span: true, bold: true });
  }
  rows.push({ cells: ["รวมทั้งสิ้น", money(c.total)], span: true, bold: true });
  // แถวหัวกลุ่ม: ข้อความเดียวเต็มแถว
  const fixed = rows.map((r) => (r.cells.length === 1 ? { ...r, cells: ["", r.cells[0], "", "", "", "", ""] } : r));
  return table(pdf, cols, fixed, {
    offset,
    footerHeight: 75,
    head: (page, first) => {
      if (!first) { text(pdf, page, `สรุปค่าตอบแทนวิทยากร (ต่อ) — ${c.project}`, { x: M.left, y: M.top, size: 14 }); return M.top + 4; }
      text(pdf, page, "สรุปค่าตอบแทนวิทยากร", { x: 105 + (M.left - M.right) / 2, y: M.top + 2, size: 20, bold: true, align: "center" });
      text(pdf, page, `${c.project} · ${formatThaiDate(c.batch.dateFrom, "long")} – ${formatThaiDate(c.batch.dateTo, "long")}`, { x: 105 + (M.left - M.right) / 2, y: M.top + 10, size: 16, align: "center", maxWidth: W });
      text(pdf, page, `${c.unitName} ${c.orgName}`.trim(), { x: 105 + (M.left - M.right) / 2, y: M.top + 17, size: 16, align: "center", maxWidth: W });
      return M.top + 22;
    },
    footer: (page, y) => {
      let fy = y + 8;
      text(pdf, page, `รวมทั้งสิ้น (${bahtText(c.total)})`, { x: M.left, y: fy, size: 16, maxWidth: W });
      if (c.tax.enabled) {
        fy += 7;
        const tax = people.reduce((a, p) => a + p.taxSatang, 0), net = people.reduce((a, p) => a + p.netSatang, 0);
        text(pdf, page, `หักภาษี ณ ที่จ่าย (วิทยากรภายนอก ${c.tax.pct}%) รวม ${money(tax)} บาท · จ่ายสุทธิ ${money(net)} บาท`, { x: M.left, y: fy, size: 15, maxWidth: W });
      }
      fy += 9;
      const bg = c.budget?.hasBudget ? c.budget : null;
      for (const [label, value] of [["งบที่ได้รับ (ค่าตอบแทนวิทยากร)", bg ? money(bg.budget) : "............................"], ["เบิกครั้งนี้", money(c.total)], ["คงเหลือ", bg ? money(bg.budget - bg.approved) : "............................"]]) {
        text(pdf, page, label, { x: M.left, y: fy, size: 16 });
        text(pdf, page, `${value} บาท`, { x: M.left + 100, y: fy, size: 16, align: "right" });
        fy += 7;
      }
      fy += 12;
      ["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"].forEach((r, i) => {
        const cx = M.left + W / 6 + (W / 3) * i;
        text(pdf, page, "ลงชื่อ ..............................", { x: cx, y: fy, size: 15, align: "center" });
        text(pdf, page, "(..............................)", { x: cx, y: fy + 7, size: 15, align: "center" });
        text(pdf, page, r, { x: cx, y: fy + 14, size: 15, align: "center" });
      });
      return fy + 14;
    },
  });
}

export async function drawDetail(pdf: Pdf, people: Payee[], c: { project: string }, offset = { dx: 0, dy: 0 }) {
  const cols: Col[] = [{ title: "วันที่", w: 22 }, { title: "หัวข้อ", w: 52 }, { title: "วิทยากร", w: 38 }, { title: "ชม.", w: 11, align: "center" }, { title: "อัตรา", w: 15, align: "right" }, { title: "เงิน (บาท)", w: W - 138, align: "right" }];
  const lines = people.flatMap((p) => p.lines.map((l) => ({ l, who: p.fullName }))).sort((a, b) => a.l.date.localeCompare(b.l.date) || a.l.title.localeCompare(b.l.title, "th"));
  const rows: Row[] = lines.map(({ l, who }) => ({ cells: [formatThaiDate(l.date), l.title, who, String(Math.round(l.hours * l.factor * 100) / 100), (l.perHourSatang / 100).toLocaleString("th-TH"), money(l.amountSatang)] }));
  rows.push({ cells: ["รวม", money(lines.reduce((a, x) => a + x.l.amountSatang, 0))], span: true, bold: true });
  return table(pdf, cols, rows, {
    offset,
    footerHeight: 8,
    head: (page, first) => {
      text(pdf, page, first ? "รายละเอียดค่าตอบแทนวิทยากรรายคาบ" : "รายละเอียดค่าตอบแทนวิทยากรรายคาบ (ต่อ)", { x: 105 + (M.left - M.right) / 2, y: M.top + 2, size: first ? 20 : 16, bold: first, align: "center" });
      text(pdf, page, c.project, { x: 105 + (M.left - M.right) / 2, y: M.top + 10, size: 16, align: "center", maxWidth: W });
      return M.top + 15;
    },
    footer: (_p, y) => y,
  });
}
