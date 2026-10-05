import "server-only";
import fs from "node:fs";
import path from "node:path";
import { PDFDocument, rgb, type PDFFont, type PDFPage, LineCapStyle } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { RuleError } from "../errors";
import { shapeThai } from "./thai-shape";

/**
 * พื้นฐานการสร้าง PDF ด้วย pdf-lib (สเปก 22): หน่วย มม. วัดจากมุมซ้ายบน · y ของข้อความ = เส้นฐาน (baseline)
 * ฟอนต์ TH Sarabun New ฝังจากไฟล์ในโปรเจกต์ (ไม่พึ่งฟอนต์ในเครื่อง) — ไม่พบไฟล์ = หยุดพร้อมบอกให้วางไฟล์
 */
export const MM = 72 / 25.4;
export const A4 = { w: 210, h: 297 };

const FONT_DIR = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "fonts");
const fontFile = (bold: boolean) => path.join(FONT_DIR, bold ? "THSarabunNew Bold.ttf" : "THSarabunNew.ttf");

export type Pdf = { doc: PDFDocument; regular: PDFFont; bold: PDFFont };

export async function createPdf(): Promise<Pdf> {
  for (const b of [false, true]) {
    if (!fs.existsSync(fontFile(b))) throw new RuleError("ไม่พบไฟล์ฟอนต์ TH Sarabun New (public/fonts) — วางไฟล์ฟอนต์ตาม README ก่อนพิมพ์เอกสาร");
  }
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const regular = await doc.embedFont(fs.readFileSync(fontFile(false)), { subset: true });
  const bold = await doc.embedFont(fs.readFileSync(fontFile(true)), { subset: true });
  doc.setCreator("ระบบสถานฟื้นฟู");
  doc.setProducer("pdf-lib");
  return { doc, regular, bold };
}

/** หน้าใหม่ + เลื่อนทั้งหน้าตามค่าปรับตำแหน่งการพิมพ์ (มม.) */
export function addPage(pdf: Pdf, offset: { dx: number; dy: number } = { dx: 0, dy: 0 }) {
  const page = pdf.doc.addPage([A4.w * MM, A4.h * MM]);
  if (offset.dx || offset.dy) page.translateContent(offset.dx * MM, -offset.dy * MM);
  return page;
}

const shaped = (font: PDFFont, s: string) => {
  const fk = (font as unknown as { embedder?: { font?: { hasGlyphForCodePoint?: (c: number) => boolean } } }).embedder?.font;
  return shapeThai(s, (cp) => fk?.hasGlyphForCodePoint?.(cp) ?? true);
};

export function widthMM(font: PDFFont, s: string, size: number) {
  return font.widthOfTextAtSize(shaped(font, s), size) / MM;
}

export type TextOpts = { x: number; y: number; size?: number; bold?: boolean; align?: "left" | "center" | "right"; maxWidth?: number; minSize?: number; color?: [number, number, number] };

/**
 * วางข้อความ: x = ขอบซ้าย (align left) / กึ่งกลาง (center) / ขอบขวา (right) · y = เส้นฐาน
 * ยาวเกิน maxWidth → ย่อฟอนต์ลงจนพอดี (ไม่เกิน minSize) — คืนขนาดที่ใช้จริง
 */
export function text(pdf: Pdf, page: PDFPage, s: string | null | undefined, o: TextOpts) {
  const str = (s ?? "").replace(/\s+/g, " ").trim();
  if (!str) return 0;
  const font = o.bold ? pdf.bold : pdf.regular;
  let size = o.size ?? 16;
  const min = o.minSize ?? Math.min(size, 11);
  if (o.maxWidth) while (size > min && widthMM(font, str, size) > o.maxWidth) size -= 0.5;
  const w = widthMM(font, str, size);
  const x = o.align === "center" ? o.x - w / 2 : o.align === "right" ? o.x - w : o.x;
  const c = o.color ?? [0, 0, 0];
  page.drawText(shaped(font, str), { x: x * MM, y: (A4.h - o.y) * MM, size, font, color: rgb(c[0], c[1], c[2]) });
  return size;
}

/** แบ่งข้อความเป็นบรรทัดให้พอดีความกว้าง (ตัดที่ช่องว่าง) */
export function wrap(font: PDFFont, s: string, size: number, maxWidth: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (widthMM(font, next, size) <= maxWidth || !cur) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function line(page: PDFPage, x1: number, y1: number, x2: number, y2: number, o: { width?: number; dotted?: boolean } = {}) {
  page.drawLine({
    start: { x: x1 * MM, y: (A4.h - y1) * MM }, end: { x: x2 * MM, y: (A4.h - y2) * MM }, thickness: (o.width ?? 0.25) * MM, color: rgb(0, 0, 0),
    ...(o.dotted ? { dashArray: [0.05 * MM, 0.9 * MM], lineCap: LineCapStyle.Round } : {}),
  });
}

export function rect(page: PDFPage, x: number, y: number, w: number, h: number, o: { width?: number; fill?: [number, number, number]; stroke?: boolean } = {}) {
  page.drawRectangle({
    x: x * MM, y: (A4.h - y - h) * MM, width: w * MM, height: h * MM,
    ...(o.stroke === false ? {} : { borderWidth: (o.width ?? 0.25) * MM, borderColor: rgb(0, 0, 0) }),
    ...(o.fill ? { color: rgb(o.fill[0], o.fill[1], o.fill[2]) } : {}),
  });
}

/** ✓ ในช่องสี่เหลี่ยม (x,y = มุมซ้ายบนของช่อง) */
export function tick(page: PDFPage, x: number, y: number, w: number, h: number) {
  const p = (px: number, py: number) => ({ x: (x + px * w) * MM, y: (A4.h - (y + py * h)) * MM });
  const s = { thickness: 0.45 * MM, color: rgb(0, 0, 0), lineCap: LineCapStyle.Round };
  page.drawLine({ start: p(0.18, 0.55), end: p(0.42, 0.8), ...s });
  page.drawLine({ start: p(0.42, 0.8), end: p(0.85, 0.15), ...s });
}

/** ฝังหน้าแรกของ PDF ต้นฉบับเป็นพื้นหลัง (แคชไบต์ไฟล์ไว้) */
const bgCache = new Map<string, Uint8Array>();
export async function drawBackground(pdf: Pdf, page: PDFPage, file: string) {
  const abs = path.join(/*turbopackIgnore: true*/ process.cwd(), file);
  if (!bgCache.has(abs)) {
    if (!fs.existsSync(abs)) throw new RuleError(`ไม่พบไฟล์แบบฟอร์มต้นฉบับ ${file}`);
    bgCache.set(abs, new Uint8Array(fs.readFileSync(abs)));
  }
  const [emb] = await pdf.doc.embedPdf(bgCache.get(abs)!, [0]);
  page.drawPage(emb, { x: 0, y: 0, width: A4.w * MM, height: A4.h * MM });
}
