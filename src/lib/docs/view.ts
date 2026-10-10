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
};
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
  };
  // เลขไทย: แปลงทุกส่วนที่เป็นข้อความแสดงผล
  return {
    ...v,
    heading: n(v.heading), orgLines: v.orgLines.map(n), docNo: n(v.docNo), dateText: n(v.dateText), subject: n(v.subject), toLine: n(v.toLine),
    refs: v.refs.map(n), attachments: v.attachments.map(n), paragraphs: v.paragraphs.map(n), signerName: n(v.signerName), signerTitle: n(v.signerTitle), contact: v.contact.map(n),
  };
}
