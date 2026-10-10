import ExcelJS from "exceljs";
import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { parseThaiInput } from "../thai-date";
import { isValidNationalId, normalizeNationalId } from "../thai-id";
import { evaluateEnrollment } from "../rules/enrollment-rules";
import { findByInmateNo, findPersonByNationalId, findPossibleSamePersons, normalizeInmateNo, priorsForPerson, registerEnrollment } from "./registry";
import { writeAudit } from "../audit";

/** คอลัมน์ของแม่แบบ (ลำดับตามไฟล์) */
export const IMPORT_COLUMNS = [
  { key: "inmateNo", header: "เลขประจำตัวผู้ต้องขัง*", width: 22 },
  { key: "prefix", header: "คำนำหน้า", width: 10 },
  { key: "firstName", header: "ชื่อ*", width: 18 },
  { key: "lastName", header: "นามสกุล*", width: 18 },
  { key: "nationalId", header: "เลขบัตรประชาชน", width: 18 },
  { key: "birthDate", header: "วันเกิด (วว/ดด/ปปปป พ.ศ.)", width: 22 },
  { key: "gender", header: "เพศ (ชาย/หญิง)", width: 12 },
  { key: "offense", header: "ฐานความผิด", width: 30 },
  { key: "zone", header: "แดน", width: 10 },
  { key: "room", header: "ห้อง", width: 8 },
  { key: "enrolledDate", header: "วันที่ลงทะเบียน (วว/ดด/ปปปป)", width: 24 },
  { key: "status", header: "สถานะ (กำลังอบรม/ครบหลักสูตร/ออกก่อนกำหนด/ร่าง)", width: 34 },
  { key: "leftDate", header: "วันที่ออกจากหลักสูตร (ถ้ามี)", width: 24 },
  { key: "consent", header: "ลงนามยินยอมแล้ว (ใช่/ไม่ใช่)", width: 22 },
  { key: "screeningScore", header: "คะแนนคัดกรอง", width: 14 },
] as const;

type Key = (typeof IMPORT_COLUMNS)[number]["key"];
export type RawRow = Record<Key, string> & { rowNo: number };

export type RowCategory = "ok" | "returnee" | "blocked" | "possible_same" | "invalid";
export const CATEGORY_LABEL: Record<RowCategory, string> = {
  ok: "ลงได้",
  returnee: "กลับมาต้องโทษซ้ำ (ลงได้)",
  blocked: "ซ้ำ (บล็อก)",
  possible_same: "อาจเป็นคนเดียวกัน",
  invalid: "ข้อมูลผิดรูปแบบ",
};

export type CheckedRow = RawRow & {
  category: RowCategory;
  reasons: string[];
  parsed?: { birthDate: string | null; enrolledDate: string; leftDate: string | null; status: string; nationalId: string | null; gender: string | null; consent: boolean; screeningScore: number | null };
};

const STATUS_MAP: Record<string, string> = { "กำลังอบรม": "active", "ครบหลักสูตร": "completed", "ออกก่อนกำหนด": "dropped", "ร่าง": "draft", "": "active" };

export async function buildTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("รายชื่อ");
  ws.columns = IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8F2B0" } };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  // ทุกคอลัมน์เป็นข้อความ กัน Excel แปลงเลขประจำตัว/เลขบัตร/วันที่เอง
  for (let i = 1; i <= IMPORT_COLUMNS.length; i++) ws.getColumn(i).numFmt = "@";
  const help = wb.addWorksheet("วิธีกรอก");
  help.addRows([
    ["วิธีกรอกแม่แบบนำเข้ารายชื่อ"],
    ["- ช่องที่มี * ต้องกรอก ที่เหลือเว้นได้"],
    ["- วันที่กรอกเป็น วัน/เดือน/ปี พ.ศ. เช่น 5/10/2569"],
    ["- สถานะ: กำลังอบรม / ครบหลักสูตร / ออกก่อนกำหนด / ร่าง (ว่าง = กำลังอบรม)"],
    ["- รุ่นที่จบแล้ว ให้ใส่สถานะ \"ครบหลักสูตร\" หรือ \"ออกก่อนกำหนด\" เพื่อให้ประวัติและการกันซ้ำใช้ได้ตั้งแต่วันแรก"],
    ["- ระบบจะตรวจทุกแถวก่อนนำเข้า และนำเข้าเฉพาะแถวที่ผ่าน"],
  ]);
  help.getColumn(1).width = 100;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (v instanceof Date) return `${v.getUTCDate()}/${v.getUTCMonth() + 1}/${v.getUTCFullYear()}`;
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return String(v.result ?? "");
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  return String(v).trim();
}

export async function parseWorkbook(buf: Buffer): Promise<RawRow[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error("ไม่พบแผ่นงานในไฟล์");
  const rows: RawRow[] = [];
  ws.eachRow((row, rowNo) => {
    if (rowNo === 1) return;
    const r = { rowNo } as RawRow;
    IMPORT_COLUMNS.forEach((c, i) => (r[c.key] = cellText(row.getCell(i + 1).value)));
    if (Object.values(r).some((v, i) => i > 0 && v)) rows.push(r);
  });
  if (rows.length > 2000) throw new Error("ไฟล์มีมากกว่า 2,000 แถว กรุณาแบ่งไฟล์");
  return rows;
}

/** ตรวจทุกแถวด้วยกฎเดียวกับการลงทะเบียนทีละคน */
export function checkRows(db: DB, cohortId: number, rows: RawRow[]): CheckedRow[] {
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort) throw new Error("ไม่พบรุ่น");
  const seen = new Map<string, number>();
  return rows.map((r) => {
    const reasons: string[] = [];
    const inmateNo = normalizeInmateNo(r.inmateNo);
    if (!inmateNo) reasons.push("ไม่มีเลขประจำตัว");
    if (!r.firstName) reasons.push("ไม่มีชื่อ");
    if (!r.lastName) reasons.push("ไม่มีนามสกุล");
    const nid = r.nationalId ? normalizeNationalId(r.nationalId) : null;
    if (nid && !isValidNationalId(nid)) reasons.push("เลขบัตรประชาชนไม่ถูกต้อง");
    const birthDate = r.birthDate ? parseThaiInput(r.birthDate) : null;
    if (r.birthDate && !birthDate) reasons.push("วันเกิดผิดรูปแบบ");
    const enrolledDate = r.enrolledDate ? parseThaiInput(r.enrolledDate) : cohort.startDate;
    if (!enrolledDate) reasons.push("วันที่ลงทะเบียนผิดรูปแบบ");
    const leftDate = r.leftDate ? parseThaiInput(r.leftDate) : null;
    if (r.leftDate && !leftDate) reasons.push("วันที่ออกจากหลักสูตรผิดรูปแบบ");
    const status = STATUS_MAP[r.status.trim()];
    if (!status) reasons.push(`สถานะ "${r.status}" ไม่ถูกต้อง`);
    const gender = r.gender ? (r.gender.startsWith("ช") ? "male" : r.gender.startsWith("ห") ? "female" : "other") : null;
    const score = r.screeningScore ? Number(r.screeningScore) : null;
    if (r.screeningScore && !Number.isFinite(score)) reasons.push("คะแนนคัดกรองไม่ใช่ตัวเลข");
    if (inmateNo) {
      if (seen.has(inmateNo)) reasons.push(`เลขประจำตัวซ้ำกับแถวที่ ${seen.get(inmateNo)} ในไฟล์`);
      else seen.set(inmateNo, r.rowNo);
    }
    if (reasons.length) return { ...r, category: "invalid" as const, reasons };

    const parsed = { birthDate, enrolledDate: enrolledDate!, leftDate, status, nationalId: nid, gender, consent: /^(ใช่|y|yes|1|✓)$/i.test(r.consent.trim()), screeningScore: score };
    const existing = findByInmateNo(db, inmateNo);
    const byNid = !existing && nid ? findPersonByNationalId(db, nid) : null;
    const personId = existing?.person.id ?? byNid?.id ?? null;
    if (!personId) {
      const cands = findPossibleSamePersons(db, r.firstName, r.lastName, birthDate);
      if (cands.length) return { ...r, category: "possible_same" as const, reasons: [`ชื่อ-สกุล${birthDate ? "และวันเกิด" : ""}ตรงกับผู้ที่มีในระบบ ${cands.length} คน — ต้องลงทะเบียนรายคนเพื่อยืนยัน`], parsed };
      return { ...r, category: "ok" as const, reasons: [], parsed };
    }
    const ev = evaluateEnrollment({ targetCourseId: cohort.courseId, incarcerationId: existing?.incarceration.id ?? null, priors: priorsForPerson(db, personId) });
    if (ev.level === "block") return { ...r, category: "blocked" as const, reasons: ev.messages, parsed };
    if (ev.isReturnee || ev.level === "warn") return { ...r, category: "returnee" as const, reasons: ev.messages, parsed };
    return { ...r, category: "ok" as const, reasons: [], parsed };
  });
}

/** นำเข้าเฉพาะแถวที่ผ่าน (ลงได้ / กลับมาต้องโทษซ้ำ) — ทั้งชุดในทรานแซกชันเดียว */
export function commitRows(db: DB, cohortId: number, rows: CheckedRow[], userId: number, fileName: string) {
  const ok = rows.filter((r) => r.category === "ok" || r.category === "returnee");
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    let imported = 0;
    for (const r of ok) {
      const p = r.parsed!;
      const historical = p.status === "completed" || p.status === "dropped";
      const res = registerEnrollment(
        t,
        {
          cohortId,
          person: { prefix: r.prefix || null, firstName: r.firstName, lastName: r.lastName, nationalId: p.nationalId, birthDate: p.birthDate, gender: p.gender },
          incarceration: { inmateNo: r.inmateNo, offense: r.offense || null, zone: r.zone || null, room: r.room || null },
          screeningScore: p.screeningScore,
          consentSigned: p.consent,
          consentDate: p.consent ? p.enrolledDate : null,
          // แถว "กำลังอบรม" ที่ยังไม่มีหลักฐานยินยอม → นำเข้าเป็นร่าง
          confirmAdmission: p.status !== "draft" && (historical || p.consent),
          acknowledgeWarnings: true,
          enrolledDate: p.enrolledDate,
        },
        { userId, canOverride: false, consentRequired: !historical },
      );
      if (historical) {
        tx.update(schema.enrollments).set({ status: p.status, leftDate: p.leftDate ?? undefined, leftReason: p.status === "dropped" ? "other" : null }).where(eq(schema.enrollments.id, res.enrollment.id)).run();
      }
      imported++;
    }
    const counts = Object.fromEntries((Object.keys(CATEGORY_LABEL) as RowCategory[]).map((c) => [c, rows.filter((r) => r.category === c).length]));
    tx.insert(schema.importBatches).values({ fileName, cohortId, totalRows: rows.length, importedRows: imported, summary: counts, createdBy: userId }).run();
    writeAudit(tx, { userId, action: "import", entity: "cohort", entityId: cohortId, after: { fileName, imported, counts } });
    return { imported, counts };
  });
}

export async function failedRowsWorkbook(rows: CheckedRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("แถวที่ไม่ผ่าน");
  ws.columns = [{ header: "แถวในไฟล์เดิม", key: "rowNo", width: 12 }, { header: "ผลตรวจ", key: "cat", width: 22 }, { header: "เหตุผล", key: "why", width: 60 }, ...IMPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }))];
  ws.getRow(1).font = { bold: true };
  for (const r of rows.filter((x) => x.category === "blocked" || x.category === "possible_same" || x.category === "invalid")) {
    ws.addRow({ ...r, cat: CATEGORY_LABEL[r.category], why: r.reasons.join(" / ") });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
