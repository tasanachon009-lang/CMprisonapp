import { formatThaiDate, THAI_MONTHS } from "../thai-date";
import type { DocKind } from "./templates";

/** เลขอารบิก → เลขไทย (หนังสือราชการ) */
export function toThaiDigits(s: string) {
  return s.replace(/[0-9]/g, (d) => "๐๑๒๓๔๕๖๗๘๙"[Number(d)]);
}

/** ช่วงวันที่แบบหนังสือราชการ: "2 – 4 พฤศจิกายน 2569" · ข้ามเดือน "30 พฤศจิกายน – 2 ธันวาคม 2569" */
export function thaiDateRange(start: string, end: string) {
  if (start === end) return formatThaiDate(start, "long");
  const [ys, ms, ds] = start.split("-").map(Number);
  const [ye, me, de] = end.split("-").map(Number);
  if (ys === ye && ms === me) return `${ds} – ${de} ${THAI_MONTHS[me - 1]} ${ye + 543}`;
  if (ys === ye) return `${ds} ${THAI_MONTHS[ms - 1]} – ${de} ${THAI_MONTHS[me - 1]} ${ye + 543}`;
  return `${formatThaiDate(start, "long")} – ${formatThaiDate(end, "long")}`;
}

export type DocInput = {
  kind: DocKind;
  docNo: string | null;
  docDate: string | null;
  subject: string;
  toLine: string;
  refs: string | null;
  attachments: string | null;
  body: string;
  signerName: string | null;
  signerTitle: string | null;
  /** บันทึกข้อความ: ช่องความเห็น/สั่งการของผู้บังคับบัญชาตามสายลงนาม (สเปก 18.3A) */
  endorsements?: Endorsement[];
};
export type Endorsement = { heading: string; name?: string | null; title: string };

/** สิ่งที่ส่งมาด้วย (สเปก 18.2B/18.3A): ตารางรายละเอียดแนบท้าย หน้าใหม่ — ไม่อยู่ในตัวบันทึกข้อความ */
export type AnnexBlock = { heading?: string; lines?: string[]; table?: { head: string[]; rows: string[][]; widths?: number[] } };
export type Annex = { title: string; subject: string; blocks: AnnexBlock[] };

/**
 * เนื้อความบันทึกข้อความ: "# ข้อความ" = หัวข้อย่อย (ใส่เลข ๑. ๒. ให้เอง ตัวหนา 16pt) · "- ข้อความ" = รายการย่อย · อื่นๆ = ย่อหน้า (เยื้อง 2.5 ซม.)
 * บรรทัดที่ขึ้นต้นด้วยเลขข้อ ("1. ..." / "๑) ...") = รายการแบบเดิมของแม่แบบเอกสาร
 */
export type BodyPart = { type: "heading" | "item" | "list" | "text"; text: string };
export function structureBody(paragraphs: string[], thaiNumerals: boolean): BodyPart[] {
  let no = 0;
  return paragraphs.map((p): BodyPart => {
    if (p.startsWith("# ")) { const n = String(++no); return { type: "heading", text: `${thaiNumerals ? toThaiDigits(n) : n}. ${p.slice(2).trim()}` }; }
    if (p.startsWith("- ")) return { type: "item", text: p.slice(2).trim() };
    if (/^[0-9๐-๙]+[.)]\s/.test(p)) return { type: "list", text: p };
    return { type: "text", text: p };
  });
}
export type OrgInfo = { name: string; unitName: string; address: string; phone: string; thaiNumerals: boolean };

/** โครงเอกสารพร้อมแสดงผล — ใช้ร่วมกันทั้งหน้าพิมพ์ (PDF) และไฟล์ Word เพื่อให้ข้อความตรงกันทุกทาง */
export type DocView = {
  kind: DocKind;
  garuda: boolean;
  /** หัวเอกสาร: "บันทึกข้อความ" / "คำสั่ง<หน่วยงาน>" / "" (หนังสือภายนอกไม่มีหัว) */
  heading: string;
  /** บันทึกข้อความ: ส่วนราชการ · หนังสือภายนอก: ที่อยู่ส่วนราชการ (หลายบรรทัด) */
  orgLines: string[];
  docNo: string;
  /** ข้อความวันที่ (ว่าง = เว้นให้ลงด้วยมือ) */
  dateText: string;
  subject: string;
  toLine: string;
  refs: string[];
  attachments: string[];
  paragraphs: string[];
  /** คำลงท้าย เช่น "ขอแสดงความนับถือ" */
  closing: string;
  signerName: string;
  signerTitle: string;
  /** ท้ายหนังสือภายนอก: หน่วยงานเจ้าของเรื่อง + โทร */
  contact: string[];
  /** เนื้อความที่จัดโครงแล้ว (หัวข้อย่อย/รายการ/ย่อหน้า) — ใช้แสดงผลแทน paragraphs */
  parts: BodyPart[];
  endorsements: Array<{ heading: string; name: string; title: string }>;
  thaiNumerals: boolean;
};

const lines = (s: string | null | undefined) => (s ?? "").split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export function buildDocView(d: DocInput, org: OrgInfo): DocView {
  const n = (s: string) => (org.thaiNumerals ? toThaiDigits(s) : s);
  const date = d.docDate ? formatThaiDate(d.docDate, "long") : "";
  const v: DocView = {
    kind: d.kind,
    garuda: true,
    heading: d.kind === "memo" ? "บันทึกข้อความ" : d.kind === "order" ? `คำสั่ง${org.name}` : "",
    orgLines: d.kind === "memo" ? [`${org.unitName} ${org.name}${org.phone ? ` โทร. ${org.phone}` : ""}`.trim()] : d.kind === "letter" ? [org.name, ...lines(org.address)] : [],
    docNo: d.docNo?.trim() ?? "",
    // หนังสือภายนอก/คำสั่ง: "2 พฤศจิกายน 2569" → บันทึกข้อความใช้รูปเดียวกัน · คำสั่งขึ้นต้น "สั่ง ณ วันที่" ที่ตัวแสดงผล
    dateText: date,
    subject: d.subject.trim(),
    toLine: d.toLine.trim(),
    refs: lines(d.refs),
    attachments: lines(d.attachments),
    paragraphs: lines(d.body),
    closing: d.kind === "letter" ? "ขอแสดงความนับถือ" : "",
    signerName: d.signerName?.trim() ?? "",
    signerTitle: d.signerTitle?.trim() ?? "",
    contact: d.kind === "letter" ? [org.unitName, org.phone ? `โทร. ${org.phone}` : ""].filter(Boolean) : [],
    parts: [],
    endorsements: d.kind === "memo" ? (d.endorsements ?? []).map((e) => ({ heading: e.heading.trim(), name: e.name?.trim() ?? "", title: e.title.trim() })) : [],
    thaiNumerals: org.thaiNumerals,
  };
  // เลขไทย: แปลงทุกส่วนที่เป็นข้อความแสดงผล
  return {
    ...v,
    heading: n(v.heading), orgLines: v.orgLines.map(n), docNo: n(v.docNo), dateText: n(v.dateText), subject: n(v.subject), toLine: n(v.toLine),
    refs: v.refs.map(n), attachments: v.attachments.map(n), paragraphs: v.paragraphs.map(n), signerName: n(v.signerName), signerTitle: n(v.signerTitle), contact: v.contact.map(n),
    parts: structureBody(v.paragraphs.map(n), org.thaiNumerals),
    endorsements: v.endorsements.map((e) => ({ heading: n(e.heading), name: n(e.name), title: n(e.title) })),
  };
}

/** แปลงตัวเลขในสิ่งที่ส่งมาด้วยตามตั้งค่าเลขไทย */
export function localizeAnnex(a: Annex, thaiNumerals: boolean): Annex {
  const n = (x: string) => (thaiNumerals ? toThaiDigits(x) : x);
  return { title: n(a.title), subject: n(a.subject), blocks: a.blocks.map((b) => ({ heading: b.heading ? n(b.heading) : undefined, lines: b.lines?.map(n), table: b.table ? { head: b.table.head, rows: b.table.rows.map((r) => r.map(n)), widths: b.table.widths } : undefined })) };
}
