import { Document, Packer, Paragraph, TextRun, ImageRun, AlignmentType, TabStopType, type IParagraphOptions } from "docx";
import type { DocView } from "./view";

/**
 * เอกสารราชการเป็นไฟล์ Word (สเปก 18.4) — โครงเดียวกับหน้าพิมพ์ (print/document/[id]/sheet.tsx)
 * ฟอนต์ TH Sarabun New 16pt · ขอบ บน 2.5 (ครุฑ 1.5) ซ้าย 3 ขวา 2 ล่าง 2 ซม. · ย่อหน้า 2.5 ซม.
 */
const FONT = "TH Sarabun New";
const CM = 567; // twips ต่อ 1 ซม.
const run = (text: string, o: { bold?: boolean; size?: number } = {}) => new TextRun({ text, font: FONT, size: (o.size ?? 16) * 2, bold: o.bold });
const para = (children: Array<TextRun | ImageRun> | string, o: Partial<IParagraphOptions> = {}) => new Paragraph({ children: typeof children === "string" ? [run(children)] : children, ...o });
const mmToPx = (mm: number) => Math.round((mm / 25.4) * 96);

export async function docxOf(v: DocView, garuda: Buffer | null): Promise<Buffer> {
  const img = (mm: number) => (garuda ? [new ImageRun({ type: "png", data: garuda, transformation: { width: mmToPx(mm), height: mmToPx(mm) } })] : []);
  const body = v.paragraphs.map((p) => (/^[0-9๐-๙]+[.)]\s/.test(p) ? para(p, { indent: { left: Math.round(2.5 * CM) } }) : para(p, { indent: { firstLine: Math.round(2.5 * CM) }, alignment: AlignmentType.THAI_DISTRIBUTE })));
  const sign = [
    ...(v.closing ? [para(v.closing, { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER, spacing: { before: 240 } }), para(""), para("")] : [para(""), para(""), para("")]),
    para(`(${v.signerName || "......................................................"})`, { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER }),
    para(v.signerTitle || "ตำแหน่ง ......................................................", { indent: { left: 8 * CM }, alignment: AlignmentType.CENTER }),
  ];
  let children: Paragraph[];
  if (v.kind === "memo") {
    children = [
      para([...img(15), run(garuda ? "\t" : "", {}), run(v.heading, { bold: true, size: 29 })], garuda ? { tabStops: [{ type: TabStopType.CENTER, position: 8 * CM }] } : { alignment: AlignmentType.CENTER }),
      para([run("ส่วนราชการ ", { bold: true, size: 20 }), run(v.orgLines[0] ?? "")]),
      para([run("ที่ ", { bold: true, size: 20 }), run(v.docNo), run("\t"), run("วันที่ ", { bold: true, size: 20 }), run(v.dateText)], { tabStops: [{ type: TabStopType.LEFT, position: 8 * CM }] }),
      para([run("เรื่อง ", { bold: true, size: 20 }), run(v.subject)]),
      para(`เรียน  ${v.toLine}`, { spacing: { before: 120, after: 120 } }),
      ...body, ...sign,
    ];
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
      para([run(`ที่ ${v.docNo}`), run("\t"), run(v.orgLines[0] ?? "")], { tabStops: [{ type: TabStopType.LEFT, position: Math.round(10.5 * CM) }] }),
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
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: Math.round(1.5 * CM), left: 3 * CM, right: 2 * CM, bottom: 2 * CM } } }, children }],
  });
  return Packer.toBuffer(doc);
}
