import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { getSetting } from "../bootstrap";
import { isValidISODate, formatThaiDate } from "../thai-date";
import { RuleError } from "../errors";
import { bahtText } from "../pay/thai-baht";
import { cohortLabel } from "./cohorts";
import { DOC_TEMPLATES, templateDef, fillTemplate, type DocTemplate } from "../docs/templates";
import { thaiDateRange, type OrgInfo } from "../docs/view";

/**
 * เอกสารราชการของรุ่น (สเปก 18.4): สร้างจากแม่แบบ → แก้ก่อนพิมพ์ → พิมพ์/PDF หรือ Word
 * ผู้เรียกตรวจสิทธิ์ docs.view / docs.manage / docs.templates ก่อน
 */
type Actor = { userId: number; ip?: string | null };
export type DocumentRow = typeof schema.documents.$inferSelect;

export function orgInfo(db: DB): OrgInfo {
  const s = (k: string) => getSetting<string>(db, k, "") ?? "";
  return { name: s("org.name"), unitName: s("org.unitName"), address: s("org.address"), phone: s("org.phone"), thaiNumerals: Boolean(getSetting<unknown>(db, "docs.thaiNumerals", true)) };
}

/** แม่แบบที่ใช้จริง = ค่าที่ผู้ดูแลแก้ (ถ้ามี) ทับค่าเริ่มต้น */
export function effectiveTemplate(db: DB, code: string): (DocTemplate & { customized: boolean }) | null {
  const def = templateDef(code);
  if (!def) return null;
  const o = db.select().from(schema.docTemplates).where(eq(schema.docTemplates.code, code)).get();
  return o ? { ...def, subject: o.subject, toLine: o.toLine, body: o.body, customized: true } : { ...def, customized: false };
}
export const listTemplates = (db: DB) => DOC_TEMPLATES.map((t) => effectiveTemplate(db, t.code)!);

function checkText(v: { subject: string; body: string; toLine?: string }) {
  if (!v.subject.trim()) throw new RuleError("กรุณาใส่ \"เรื่อง\"");
  if (!v.body.trim()) throw new RuleError("กรุณาใส่เนื้อความ");
  if (v.subject.length > 500 || (v.toLine ?? "").length > 500 || v.body.length > 20000) throw new RuleError("ข้อความยาวเกินไป — ย่อให้สั้นลงแล้วลองใหม่");
}

export function saveTemplate(db: DB, code: string, input: { subject: string; toLine: string; body: string }, actor: Actor) {
  if (!templateDef(code)) throw new RuleError("ไม่พบแม่แบบนี้ — รีเฟรชหน้าแล้วลองใหม่");
  checkText(input);
  const v = { subject: input.subject.trim(), toLine: input.toLine.trim(), body: input.body.trim(), updatedBy: actor.userId, updatedAt: new Date() };
  db.insert(schema.docTemplates).values({ code, ...v }).onConflictDoUpdate({ target: schema.docTemplates.code, set: v }).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "doc_template", entityId: code, ip: actor.ip ?? null });
}
export function resetTemplate(db: DB, code: string, actor: Actor) {
  db.delete(schema.docTemplates).where(eq(schema.docTemplates.code, code)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "doc_template", entityId: code, note: "คืนค่าเริ่มต้น", ip: actor.ip ?? null });
}

const money = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const person = (p: { prefix?: string | null; firstName?: string | null; lastName?: string | null }) => `${p.prefix ?? ""}${p.firstName ?? ""} ${p.lastName ?? ""}`.trim();

/** ค่าตัวแปรของรุ่น — ไม่มีข้อมูลผู้ต้องขังรายบุคคล (มีแต่จำนวน) */
export function cohortVariables(db: DB, cohortId: number): Record<string, string> {
  const row = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  if (!row) throw new RuleError("ไม่พบรุ่นนี้");
  const { c, course } = row;
  const s = (k: string) => getSetting<string>(db, k, "") ?? "";
  const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt))).all();
  const days = new Set(sessions.map((x) => x.date)).size || course.durationDays;
  const enrolled = db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["active", "completed"]), isNull(schema.enrollments.deletedAt))).all().length;
  const budget = db.select({ a: schema.budgetLines.amountSatang }).from(schema.budgetLines).where(and(eq(schema.budgetLines.cohortId, cohortId), isNull(schema.budgetLines.deletedAt))).all().reduce((t, x) => t + x.a, 0);
  const staff = sessions.length ? db.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, sessions.map((x) => x.id)), isNull(schema.sessionStaff.deletedAt))).all() : [];
  const userIds = Array.from(new Set(staff.map((x) => x.userId).filter((x): x is number => x != null)));
  const users = userIds.length ? db.select().from(schema.users).where(inArray(schema.users.id, userIds)).all().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id - b.id) : [];
  const insIds = Array.from(new Set(staff.map((x) => x.instructorId).filter((x): x is number => x != null)));
  const ins = insIds.length ? db.select().from(schema.instructors).where(and(inArray(schema.instructors.id, insIds), eq(schema.instructors.kind, "external"))).all() : [];
  const external = Array.from(new Set([...ins.map(person), ...staff.map((x) => x.externalName?.trim()).filter((x): x is string => !!x)]));
  return {
    "ชื่อเรือนจำ": s("org.name"), "ชื่อหน่วย": s("org.unitName"), "ตำแหน่งผู้บริหาร": s("org.headTitle"), "ชื่อผู้บริหาร": s("org.headName"),
    "ตำแหน่งหัวหน้าหน่วย": s("docs.unitHeadTitle"), "ชื่อหัวหน้าหน่วย": s("docs.unitHeadName"),
    "หลักสูตร": course.name, "รุ่น": cohortLabel(c), "ปีงบประมาณ": String(c.fiscalYear),
    "ช่วงวันที่อบรม": thaiDateRange(c.startDate, c.endDate), "วันเริ่ม": formatThaiDate(c.startDate, "long"), "วันสิ้นสุด": formatThaiDate(c.endDate, "long"),
    "จำนวนวัน": String(days), "จำนวนชั่วโมง": String(course.totalHours), "สถานที่": c.location ?? "",
    "จำนวนเป้าหมาย": c.targetCount ? String(c.targetCount) : "", "จำนวนผู้เข้าอบรม": String(enrolled),
    "งบประมาณ": budget ? money(budget) : "", "งบประมาณตัวอักษร": budget ? bahtText(budget) : "",
    "จำนวนวิทยากรภายนอก": String(external.length), "รายชื่อวิทยากรภายนอก": external.join(", "),
    "รายชื่อคณะทำงาน": users.map((u, i) => `${i + 1}. ${person(u)}${u.position ? ` ตำแหน่ง ${u.position}` : ""}`).join("\n"),
  };
}

export function listDocuments(db: DB, cohortId: number) {
  return db.select().from(schema.documents).where(and(eq(schema.documents.cohortId, cohortId), isNull(schema.documents.deletedAt))).orderBy(desc(schema.documents.id)).all();
}
export function getDocument(db: DB, id: number) {
  return db.select().from(schema.documents).where(and(eq(schema.documents.id, id), isNull(schema.documents.deletedAt))).get() ?? null;
}

/** สร้างร่างเอกสารจากแม่แบบ (เติมข้อมูลของรุ่นให้) */
export function createDocument(db: DB, cohortId: number, templateCode: string, actor: Actor) {
  const t = effectiveTemplate(db, templateCode);
  if (!t) throw new RuleError("ไม่พบแม่แบบนี้ — รีเฟรชหน้าแล้วลองใหม่");
  const vars = cohortVariables(db, cohortId);
  const course = db.select({ code: schema.courses.code }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get()!;
  if (t.courseCodes && !t.courseCodes.includes(course.code)) throw new RuleError("แม่แบบนี้ไม่ได้ใช้กับหลักสูตรของรุ่นนี้");
  const head = t.signer === "head";
  const prefix = getSetting<string>(db, "org.docPrefix", "") ?? "";
  const row = db.insert(schema.documents).values({
    cohortId, templateCode, kind: t.kind, title: t.name,
    docNo: t.kind === "order" ? null : prefix || null,
    docDate: null,
    subject: fillTemplate(t.subject, vars), toLine: fillTemplate(t.toLine, vars), body: fillTemplate(t.body, vars),
    signerName: vars[head ? "ชื่อผู้บริหาร" : "ชื่อหัวหน้าหน่วย"] || null,
    signerTitle: vars[head ? "ตำแหน่งผู้บริหาร" : "ตำแหน่งหัวหน้าหน่วย"] || null,
    createdBy: actor.userId, updatedBy: actor.userId,
  }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "document", entityId: row.id, note: templateCode, ip: actor.ip ?? null });
  return row;
}

export type DocumentEdit = { docNo?: string | null; docDate?: string | null; subject: string; toLine: string; refs?: string | null; attachments?: string | null; body: string; signerName?: string | null; signerTitle?: string | null };

function load(db: DB, id: number) {
  const d = getDocument(db, id);
  if (!d) throw new RuleError("ไม่พบเอกสารนี้ — อาจถูกลบไปแล้ว");
  return d;
}

export function updateDocument(db: DB, id: number, input: DocumentEdit, actor: Actor, loadedVersion?: number) {
  const d = load(db, id);
  if (d.status === "final") throw new RuleError("เอกสารนี้ล็อกแล้ว — กด \"ปลดล็อกเพื่อแก้ไข\" ก่อน");
  if (loadedVersion !== undefined && d.version !== loadedVersion) throw new RuleError("มีผู้อื่นแก้เอกสารนี้ไปแล้วระหว่างที่คุณเปิดอยู่ — กรุณาโหลดหน้าใหม่", undefined, "conflict");
  checkText(input);
  if (input.docDate && !isValidISODate(input.docDate)) throw new RuleError("วันที่ไม่ถูกต้อง — เลือกวันที่ใหม่หรือเว้นว่าง");
  const t = (s: string | null | undefined, max: number) => s?.trim().slice(0, max) || null;
  db.update(schema.documents).set({
    docNo: t(input.docNo, 100), docDate: input.docDate || null, subject: input.subject.trim(), toLine: input.toLine.trim(),
    refs: t(input.refs, 2000), attachments: t(input.attachments, 2000), body: input.body.trim(), signerName: t(input.signerName, 200), signerTitle: t(input.signerTitle, 300),
    updatedBy: actor.userId, updatedAt: new Date(), version: d.version + 1,
  }).where(eq(schema.documents.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "document", entityId: id, ip: actor.ip ?? null });
}

export function setDocumentStatus(db: DB, id: number, status: "draft" | "final", actor: Actor) {
  const d = load(db, id);
  if (d.status === status) return;
  db.update(schema.documents).set({ status, updatedBy: actor.userId, updatedAt: new Date(), version: d.version + 1 }).where(eq(schema.documents.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "document", entityId: id, before: { status: d.status }, after: { status }, ip: actor.ip ?? null });
}

/** ลบ (ซ่อน) — เอกสารที่ล็อกแล้วต้องปลดล็อกก่อน */
export function deleteDocument(db: DB, id: number, actor: Actor) {
  const d = load(db, id);
  if (d.status === "final") throw new RuleError("เอกสารนี้ล็อกแล้ว — ปลดล็อกก่อนจึงจะลบได้");
  db.update(schema.documents).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.documents.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "document", entityId: id, ip: actor.ip ?? null });
}

export function markDocumentPrinted(db: DB, id: number) {
  db.update(schema.documents).set({ printedAt: new Date() }).where(eq(schema.documents.id, id)).run();
}
