import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType, LeaderType, LineRuleType, Tab, UnderlineType, Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign, Header, PageNumber, NumberFormat, type IParagraphOptions } from "docx";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import type { DocView, Annex } from "./view";

/**
 * เอกสารราชการเป็นไฟล์ Word (สเปก 18.4) — โครงเดียวกับหน้าพิมพ์ (print/document/[id]/sheet.tsx)
 * ฟอนต์ TH Sarabun New 16pt · ขอบ บน 1.5 (ถึงครุฑ) ซ้าย 3 ขวา 2 ล่าง 2 ซม. · ย่อหน้า 2.5 ซม.
 * บันทึกข้อความ = แม่แบบกลางตามสเปก 18.3A (โครงเดียวกับ MemoSheet ของหน้าพิมพ์) จัดตำแหน่งด้วยตาราง/แท็บ ไม่เคาะเว้นวรรค
 */
const FONT = "TH Sarabun New";
const CM = 567; // twips ต่อ 1 ซม.
const run = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: (o.size ?? 16) * 2, bold: o.bold });
const para = (children: Array<TextRun | ImageRun> | string, o: Partial<IParagraphOptions> = {}) => new Paragraph({ children: typeof children === "string" ? [run(children)] : children, ...o });
const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);

const NONE = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const NO_BORDERS = { top: NONE, bottom: NONE, left: NONE, right: NONE, insideHorizontal: NONE, insideVertical: NONE };
const WIDTH = 16 * CM; // พื้นที่พิมพ์ 21 − 3 − 2 ซม.
const dotted = (text: string) => new TextRun({ text, font: FONT, size: 32, underline: { type: UnderlineType.DOTTED } });
/** ช่องหัวบันทึก: ป้าย 20pt หนา + ข้อความ 16pt บนเส้นประ ลากเส้นประต่อถึงตำแหน่งแท็บ */
const dottedTab = () => new TextRun({ children: [new Tab()], font: FONT, size: 32, underline: { type: UnderlineType.DOTTED } });
const fieldRuns = (label: string, text: string, gap = " ") => [run(label, { bold: true, size: 20 }), dotted(`${gap}${text}`), dottedTab()];

/**
 * เนื้อหาบันทึกข้อความต่อจากบรรทัดหัว (ครุฑ + "บันทึกข้อความ" มาจากไฟล์ต้นแบบ) — ค่าทุกตัวตามต้นแบบ docs/forms/memo-template.doc
 * แท็บ "วันที่" 4500 twips (7.94 ซม.) · ปลายเส้นจุด 9000 twips (15.88 ซม.) · "เรียน" เว้นก่อน 6pt ข้อความที่ 720 twips
 * เนื้อความเว้นก่อน 6pt ย่อหน้า 1418 twips · ลงชื่อเว้น 3 บรรทัด จัดกึ่งกลางเยื้อง 1412 twips
 * เส้นจุดใช้ขีดเส้นใต้แบบจุด + แท็บ (ไม่วาดเส้นลอย) เพื่อไม่เลื่อนเมื่อข้อความยาว
 */
const TAB_DATE = 4500, TAB_END = 9000;
function memoChildren(v: DocView): Array<Paragraph | Table> {
  const stops = (...pos: number[]) => pos.map((position) => ({ type: TabStopType.LEFT, position }));
  const LINE = { line: 420, lineRule: LineRuleType.EXACT }, FIELD = {}; // บรรทัดหัวข้อใช้ระยะบรรทัดเดียวตามต้นแบบ (วัดแล้วตรงกว่ากำหนดตายตัว)
  const before = { spacing: { before: 120, ...LINE } }, plain = { spacing: LINE };
  const body = v.parts.map((p) =>
    p.type === "heading" ? para([run(p.text, { bold: true })], { ...before, indent: { firstLine: 1418 } })
      : p.type === "item" ? para(p.text, { ...plain, indent: { left: 1700 } })
        : p.type === "list" ? para(p.text, { ...plain, indent: { left: 1418 } })
          : para(p.text, { ...before, indent: { firstLine: 1418 }, alignment: AlignmentType.THAI_DISTRIBUTE }));
  const signIndent = { firstLine: 1412 };
  const sign = [para("", { ...plain, indent: { firstLine: 1411 } }), para("", { ...plain, indent: { firstLine: 1411 } }), para("", { ...plain, indent: { firstLine: 1411 } }),
    para(`(${v.signerName || "......................................................"})`, { ...plain, indent: signIndent, alignment: AlignmentType.CENTER, keepNext: true }),
    para(v.signerTitle || "ตำแหน่ง ......................................................", { ...plain, indent: signIndent, alignment: AlignmentType.CENTER })];
  // ช่องความเห็น/สั่งการ: 3 ช่อง = แถวเดียว 3 คอลัมน์ (ให้อยู่ในหน้าแรก) · นอกนั้นแถวละ 2 ช่อง — เหมือนหน้าพิมพ์
  const per = v.endorsements.length === 3 ? 3 : 2, boxW = Math.round(WIDTH / per);
  const dots = () => new Paragraph({ children: [dottedTab()], tabStops: stops(boxW - Math.round(0.6 * CM)), spacing: LINE });
  const box = (e?: DocView["endorsements"][number]) => new TableCell({
    width: { size: boxW, type: WidthType.DXA }, borders: NO_BORDERS,
    children: e ? [para([run(e.heading, { bold: true })], { ...plain, keepNext: true }), dots(), para("", { spacing: { line: 200, lineRule: LineRuleType.EXACT } }),
      para(`(${e.name || "......................................................"})`, { ...plain, alignment: AlignmentType.CENTER, keepNext: true }), para(e.title, { ...plain, alignment: AlignmentType.CENTER })] : [para("")],
  });
  const rows: TableRow[] = [];
  for (let i = 0; i < v.endorsements.length; i += per) rows.push(new TableRow({ cantSplit: true, children: Array.from({ length: per }, (_, k) => box(v.endorsements[i + k])) }));
  const tab = () => new TextRun({ children: [new Tab()], font: FONT, size: 32 });
  return [
    new Paragraph({ children: fieldRuns("ส่วนราชการ", v.orgLines[0] ?? ""), tabStops: stops(TAB_END), spacing: FIELD }),
    new Paragraph({ children: [...fieldRuns("ที่", v.docNo, "   "), ...fieldRuns("วันที่", v.dateText)], tabStops: stops(TAB_DATE, TAB_END), spacing: FIELD }),
    new Paragraph({ children: fieldRuns("เรื่อง", v.subject, "   "), tabStops: stops(TAB_END), spacing: FIELD }),
    // ระยะบรรทัดตายตัววางเส้นฐานต่ำกว่าระยะบรรทัดเดียวราว 4.5pt → เว้นก่อน "เรียน" 1.5pt แทน 6pt เพื่อให้เส้นฐานตรงต้นแบบ
    para([run("เรียน"), tab(), run(v.toLine)], { spacing: { before: 30, ...LINE }, indent: { left: 720, hanging: 720 } }),
    ...body, ...sign,
    ...(rows.length ? [para("", { spacing: { line: 120, lineRule: LineRuleType.EXACT } }), new Table({ width: { size: WIDTH, type: WidthType.DXA }, borders: NO_BORDERS, columnWidths: Array(per).fill(boxW), rows })] : []),
  ];
}

/** ไฟล์ต้นแบบบันทึกข้อความ (.docx แปลงจาก docs/forms/memo-template.doc ด้วย Word) — ฐานของไฟล์ Word ทุกฉบับที่เป็นบันทึกข้อความ */
export const MEMO_TEMPLATE_FILE = path.join(/*turbopackIgnore: true*/ process.cwd(), "assets", "docs", "memo-template.docx");

/**
 * บันทึกข้อความเป็น Word โดยใช้ไฟล์ต้นแบบเป็นฐาน (สเปก 18.3A): คงขอบกระดาษ สไตล์ ครุฑ บรรทัด "บันทึกข้อความ" และหัวกระดาษเลขหน้าของต้นแบบ
 * แล้วเติมเนื้อหาต่อจากบรรทัดหัว · ฟอนต์เปลี่ยนเป็น TH Sarabun New ทั้งไฟล์ · เลขหน้าเลขไทย/อารบิกตามตั้งค่า
 */
async function memoFromTemplate(v: DocView, garuda: Buffer | null, annex?: Annex | null): Promise<Buffer> {
  const generated = await Packer.toBuffer(new Document({ sections: [{ children: [...memoChildren(v), ...(annex ? annexChildren(annex) : [])] }] }));
  const gen = await (await JSZip.loadAsync(generated)).file("word/document.xml")!.async("string");
  const inner = gen.slice(gen.indexOf("<w:body>") + 8, gen.lastIndexOf("<w:sectPr")).replace(/<\/w:rPr>/g, "<w:cs/></w:rPr>");
  const zip = await JSZip.loadAsync(fs.readFileSync(MEMO_TEMPLATE_FILE));
  const doc = await zip.file("word/document.xml")!.async("string");
  const bodyAt = doc.indexOf("<w:body>") + 8;
  const head = doc.slice(bodyAt, doc.indexOf("</w:p>", bodyAt) + 6); // ย่อหน้าแรก: ครุฑ + แท็บ + "บันทึกข้อความ"
  const sect = doc.slice(doc.lastIndexOf("<w:sectPr"), doc.indexOf("</w:body>"));
  if (!head.includes("บันทึกข้อความ") || !sect.includes("<w:pgMar")) throw new Error("ไฟล์ต้นแบบบันทึกข้อความไม่ถูกต้อง — ตรวจ assets/docs/memo-template.docx");
  const fonts = (x: string) => x.replace(/TH SarabunPSK|TH SarabunIT๙/g, FONT);
  zip.file("word/document.xml", fonts(doc.slice(0, bodyAt) + head + inner + (v.thaiNumerals ? sect : sect.replace('w:fmt="thaiNumbers"', 'w:fmt="decimal"')) + "</w:body></w:document>"));
  for (const name of Object.keys(zip.files).filter((n) => /^word\/(header\d|styles|fontTable)\.xml$/.test(n))) {
    let x = fonts(await zip.file(name)!.async("string"));
    // ตัวอย่างเลขหน้าที่ค้างในหัวกระดาษของต้นแบบ ("๒") → Word คำนวณใหม่เมื่อเปิดไฟล์ · ตั้งค่าเลขอารบิก = ใส่ตัวอย่างเป็น 2
    if (!v.thaiNumerals) x = x.replace(/<w:t>๒<\/w:t>/g, "<w:t>2</w:t>");
    zip.file(name, x);
  }
  if (garuda) zip.file("word/media/image1.png", garuda);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

/** สิ่งที่ส่งมาด้วย — ขึ้นหน้าใหม่ ตาราง 14pt หัวตารางซ้ำทุกหน้า */
function annexChildren(a: Annex): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [
    para([run(a.title, { bold: true })], { alignment: AlignmentType.CENTER, pageBreakBefore: true }),
    para(a.subject, { alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
  ];
  for (const b of a.blocks) {
    if (b.heading) out.push(para([run(b.heading, { bold: true })], { spacing: { before: 120 }, keepNext: true }));
    for (const l of b.lines ?? []) out.push(para(l, { indent: { left: Math.round(0.6 * CM), hanging: Math.round(0.6 * CM) } }));
    if (b.table) {
      const w = b.table.widths ?? b.table.head.map(() => 100 / b.table!.head.length);
      const tc = (t: string, i: number, bold = false) => new TableCell({ width: { size: Math.round((WIDTH * w[i]) / 100), type: WidthType.DXA }, children: [para([run(t, { bold, size: 14 })], bold ? { alignment: AlignmentType.CENTER } : {})] });
      out.push(new Table({
        width: { size: WIDTH, type: WidthType.DXA }, columnWidths: w.map((x) => Math.round((WIDTH * x) / 100)),
        rows: [new TableRow({ tableHeader: true, children: b.table.head.map((h, i) => tc(h, i, true)) }), ...b.table.rows.map((r) => new TableRow({ cantSplit: true, children: r.map((c, i) => tc(c, i)) }))],
      }));
    }
  }
  return out;
}

export async function docxOf(v: DocView, garuda: Buffer | null, annex?: Annex | null): Promise<Buffer> {
  const img = (mm: number) => (garuda ? [new ImageRun({ type: "png", data: garuda, transformation: { width: mmToPx(mm), height: mmToPx(mm) } })] : []);
  const body = v.parts.map((p) => (p.type === "list" || p.type === "item" ? para(p.text, { indent: { left: Math.round(2.5 * CM) } }) : para(p.type === "heading" ? [run(p.text, { bold: true })] : p.text, { indent: { firstLine: Math.round(2.5 * CM) }, alignment: AlignmentType.THAI_DISTRIBUTE })));
  const sign = [
    ...(v.closing ? [para(v.closing, { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER, spacing: { before: 240 } }), para(""), para("")] : [para(""), para(""), para("")]),
    para(`(${v.signerName || "......................................................"})`, { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER }),
    para(v.signerTitle || "ตำแหน่ง ......................................................", { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER }),
  ];
  let children: Array<Paragraph | Table>;
  if (v.kind === "memo") {
    return memoFromTemplate(v, garuda, annex);
  } else if (v.kind === "order") {
    children = [
      ...(garuda ? [para(img(30), { alignment: AlignmentType.CENTER })] : []),
      para(v.heading, { alignment: AlignmentType.CENTER }),
      para(`ที่ ${v.docNo || "............/............"}`, { alignment: AlignmentType.CENTER }),
      para(`เรื่อง  ${v.subject}`, { alignment: AlignmentType.CENTER }),
      para("____________________", { alignment: AlignmentType.CENTER, spacing: { after: 120 } }),
      ...body,
      para(`สั่ง ณ วันที่ ${v.dateText || "............................................"}`, { indent: { firstLine: Math.round(2.5 * CM) }, spacing: { before: 120 } }),
      ...sign,
    ];
  } else {
    children = [
      ...(garuda ? [para(img(30), { alignment: AlignmentType.CENTER })] : []),
      para([run(`ที่ ${v.docNo}`), new TextRun({ children: [new Tab()], font: FONT, size: 32 }), run(v.orgLines[0] ?? "")], { tabStops: [{ type: TabStopType.LEFT, position: Math.round(10.5 * CM) }] }),
      ...v.orgLines.slice(1).map((l) => para(l, { indent: { left: Math.round(10.5 * CM) } })),
      para(v.dateText || "", { indent: { left: 8 * CM }, spacing: { before: 120 } }),
      para(`เรื่อง  ${v.subject}`, { spacing: { before: 120 } }),
      para(`เรียน  ${v.toLine || "......................................................"}`, { spacing: { before: 120 } }),
      ...(v.refs.length ? [para(`อ้างถึง  ${v.refs.join(" · ")}`, { spacing: { before: 120 } })] : []),
      ...v.attachments.map((a, i) => para(`${i === 0 ? "สิ่งที่ส่งมาด้วย  " : "\t"}${v.attachments.length > 1 ? `${i + 1}. ` : ""}${a}`, { spacing: { before: i === 0 ? 120 : 0 }, tabStops: [{ type: TabStopType.LEFT, position: Math.round(2.7 * CM) }] })),
      para("", { spacing: { before: 60 } }),
      ...body, ...sign,
      para(""),
      ...v.contact.map((l) => para(l)),
    ];
  }
  const doc = new Document({
    styles: { default: { document: { run: { font: FONT, size: 32 } } } },
    sections: [{
      properties: {
        titlePage: true, // หน้าแรกไม่มีเลขหน้า
        page: {
          size: { width: 11906, height: 16838 }, margin: { top: Math.round(1.5 * CM), left: 3 * CM, right: 2 * CM, bottom: 2 * CM, header: Math.round(0.7 * CM) },
          pageNumbers: { formatType: v.thaiNumerals ? NumberFormat.THAI_NUMBERS : NumberFormat.DECIMAL },
        },
      },
      // หน้า 2 ขึ้นไป: "- ๒ -" กึ่งกลางด้านบน
      headers: { first: new Header({ children: [] }), default: new Header({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [run("- "), new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 32 }), run(" -")] })] }) },
      children,
    }],
  });
  return Packer.toBuffer(doc);
}
