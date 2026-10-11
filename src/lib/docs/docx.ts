import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType, LeaderType, Tab, UnderlineType, Table, TableRow, TableCell, WidthType, BorderStyle, VerticalAlign, Header, PageNumber, NumberFormat, type IParagraphOptions } from "docx";
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
const fieldRuns = (label: string, text: string) => [run(`${label}  `, { bold: true, size: 20 }), dotted(text || " "), dottedTab()];

function memoChildren(v: DocView, garuda: Buffer | null): Array<Paragraph | Table> {
  const img = garuda ? [new ImageRun({ type: "png", data: garuda, transformation: { width: mmToPx(15), height: mmToPx(15) } })] : [];
  const cell = (children: Paragraph[], width: number) => new TableCell({ children, width: { size: width, type: WidthType.DXA }, borders: NO_BORDERS, verticalAlign: VerticalAlign.BOTTOM, margins: { left: 0, right: 0, top: 0, bottom: 0 } });
  // ครุฑ 1.5 ซม. มุมซ้ายบน · "บันทึกข้อความ" 29pt กึ่งกลางหน้ากระดาษ (ช่องขวา 2.5 ซม. ชดเชยขอบซ้ายที่กว้างกว่า 1 ซม.)
  const head = new Table({
    width: { size: WIDTH, type: WidthType.DXA }, borders: NO_BORDERS, columnWidths: [Math.round(1.5 * CM), 12 * CM, Math.round(2.5 * CM)],
    rows: [new TableRow({ height: { value: Math.round(1.5 * CM), rule: "exact" as never }, children: [cell([para(img)], Math.round(1.5 * CM)), cell([para([run(v.heading, { bold: true, size: 29 })], { alignment: AlignmentType.CENTER })], 12 * CM), cell([para("")], Math.round(2.5 * CM))] })],
  });
  const right = { type: TabStopType.RIGHT, position: WIDTH, leader: LeaderType.NONE };
  const body = v.parts.map((p) =>
    p.type === "heading" ? para([run(p.text, { bold: true })], { indent: { firstLine: Math.round(2.5 * CM) } })
      : p.type === "item" ? para(p.text, { indent: { left: 3 * CM } })
        : p.type === "list" ? para(p.text, { indent: { left: Math.round(2.5 * CM) } })
          : para(p.text, { indent: { firstLine: Math.round(2.5 * CM) }, alignment: AlignmentType.THAI_DISTRIBUTE }));
  // ลงชื่อ: เว้น 3 บรรทัด · กึ่งกลางที่ 60% ของความกว้างหน้า (บล็อก 10 ซม. เริ่มที่ 4.6 ซม.)
  const signIndent = { left: Math.round(4.6 * CM), right: Math.round(1.4 * CM) };
  const sign = [para(""), para(""), para(""),
    para(`(${v.signerName || "......................................................"})`, { indent: signIndent, alignment: AlignmentType.CENTER, keepNext: true }),
    para(v.signerTitle || "ตำแหน่ง ......................................................", { indent: signIndent, alignment: AlignmentType.CENTER })];
  // ช่องความเห็น/สั่งการ: 3 ช่อง = แถวเดียว 3 คอลัมน์ (ให้อยู่ในหน้าแรก) · นอกนั้นแถวละ 2 ช่อง — เหมือนหน้าพิมพ์
  const per = v.endorsements.length === 3 ? 3 : 2, boxW = Math.round(WIDTH / per);
  const dots = () => new Paragraph({ children: [dottedTab()], tabStops: [{ type: TabStopType.RIGHT, position: boxW - Math.round(0.6 * CM) }] });
  const box = (e?: DocView["endorsements"][number]) => new TableCell({
    width: { size: boxW, type: WidthType.DXA }, borders: NO_BORDERS,
    children: e ? [para([run(e.heading, { bold: true })], { keepNext: true }), dots(), dots(), para(""),
      para(`(${e.name || "......................................................"})`, { alignment: AlignmentType.CENTER, keepNext: true }), para(e.title, { alignment: AlignmentType.CENTER })] : [para("")],
  });
  const rows: TableRow[] = [];
  for (let i = 0; i < v.endorsements.length; i += per) rows.push(new TableRow({ cantSplit: true, children: Array.from({ length: per }, (_, k) => box(v.endorsements[i + k])) }));
  return [
    head,
    new Paragraph({ children: fieldRuns("ส่วนราชการ", v.orgLines[0] ?? ""), tabStops: [right] }),
    new Paragraph({ children: [...fieldRuns("ที่", v.docNo), ...fieldRuns("วันที่", v.dateText)], tabStops: [{ type: TabStopType.LEFT, position: Math.round(7.5 * CM) }, right] }),
    new Paragraph({ children: fieldRuns("เรื่อง", v.subject), tabStops: [right] }),
    para(""),
    para(`เรียน  ${v.toLine}`),
    ...body, ...sign,
    ...(rows.length ? [para(""), new Table({ width: { size: WIDTH, type: WidthType.DXA }, borders: NO_BORDERS, columnWidths: Array(per).fill(boxW), rows })] : []),
  ];
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
    children = [...memoChildren(v, garuda), ...(annex ? annexChildren(annex) : [])];
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
