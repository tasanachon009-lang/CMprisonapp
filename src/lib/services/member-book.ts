import { and, asc, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { addDays, ageOn, isValidISODate, todayISO } from "../thai-date";
import { phaseLabel } from "../fast/phases";
import { lookupLabel } from "../bootstrap";
import { assignmentChanges, CHANGE_LABEL } from "./tc-house";

/**
 * สมุดบันทึกความก้าวหน้าของสมาชิกชุมชนบำบัด (สเปก 16A ส่วนที่ 1–4)
 * ส่วนที่ 1 ดึงจากทะเบียน (ไม่กรอกซ้ำ) + ข้อความยาว 2 ช่อง · ส่วนที่ 3 = 1 บันทึกต่อเดือน · ส่วนที่ 4 = ความเห็นที่ปรึกษา (หลายครั้ง)
 * ผู้เรียกตรวจสิทธิ์ tc.view / tc.edit ก่อน
 */
type Actor = { userId: number; isAdmin?: boolean; ip?: string | null };
const TEXT_MAX = 5000;

function load(db: DB, enrollmentId: number) {
  const row = db.select({ e: schema.enrollments, c: schema.cohorts, code: schema.courses.code }).from(schema.enrollments)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.enrollments.id, enrollmentId), isNull(schema.enrollments.deletedAt))).get();
  if (!row) throw new RuleError("ไม่พบการลงทะเบียนนี้");
  if (row.code !== "FAST") throw new RuleError("สมุดบันทึกความก้าวหน้าใช้กับหลักสูตรชุมชนบำบัดเท่านั้น");
  return row;
}
const clean = (s: string | null | undefined) => (s ?? "").replace(/\r\n/g, "\n").trim();

// ───────── ส่วนที่ 1 ─────────

/** โทษที่เหลือ (ปี/เดือน/วัน) ณ วันที่กำหนด — ประมาณจาก วันรับตัว + กำหนดโทษ (ไม่รวมพักโทษ/ลดวันต้องโทษ) */
export function remainingSentence(inc: { admittedDate: string | null; sentenceYears: number | null; sentenceMonths: number | null; sentenceDays: number | null }, on: string) {
  if (!inc.admittedDate || (inc.sentenceYears == null && inc.sentenceMonths == null && inc.sentenceDays == null)) return null;
  const [Y, M, D] = inc.admittedDate.split("-").map(Number);
  const end = new Date(Date.UTC(Y + (inc.sentenceYears ?? 0), M - 1 + (inc.sentenceMonths ?? 0), D + (inc.sentenceDays ?? 0))).toISOString().slice(0, 10);
  if (end <= on) return { years: 0, months: 0, days: 0, releaseDate: end };
  const [y1, m1, d1] = on.split("-").map(Number), [y2, m2, d2] = end.split("-").map(Number);
  let years = y2 - y1, months = m2 - m1, days = d2 - d1;
  if (days < 0) { months--; days += new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate(); }
  if (months < 0) { years--; months += 12; }
  return { years, months, days, releaseDate: end };
}

export function generalInfo(db: DB, enrollmentId: number, today = todayISO()) {
  const row = db.select({ e: schema.enrollments, inc: schema.incarcerations, p: schema.persons }).from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(eq(schema.enrollments.id, enrollmentId)).get();
  if (!row) return null;
  const drugs = db.select().from(schema.drugUseHistory).where(and(eq(schema.drugUseHistory.incarcerationId, row.inc.id), isNull(schema.drugUseHistory.deletedAt))).orderBy(asc(schema.drugUseHistory.id)).all();
  const book = db.select().from(schema.memberBooks).where(eq(schema.memberBooks.enrollmentId, enrollmentId)).get() ?? null;
  return {
    gender: row.p.gender, age: row.p.birthDate ? ageOn(row.p.birthDate, today) : null, maritalStatus: row.p.maritalStatus, education: row.p.education, occupation: row.p.occupation, familySize: row.p.familySize,
    drugs: drugs.map((d) => ({ substance: d.substance, ageStarted: d.ageStarted, frequency: d.frequency, timesPerMonth: d.timesPerMonth, durationYears: d.durationYears })),
    offense: row.inc.offense, sentence: { years: row.inc.sentenceYears, months: row.inc.sentenceMonths, days: row.inc.sentenceDays }, remaining: remainingSentence(row.inc, today),
    housingBefore: book?.housingBefore ?? "", familyBond: book?.familyBond ?? "", bookVersion: book?.version ?? 0,
    enteredDate: row.e.enrolledDate,
  };
}

export function saveGeneral(db: DB, enrollmentId: number, input: { housingBefore: string; familyBond: string }, actor: Actor, loadedVersion?: number) {
  load(db, enrollmentId);
  const housingBefore = clean(input.housingBefore), familyBond = clean(input.familyBond);
  if (housingBefore.length > TEXT_MAX || familyBond.length > TEXT_MAX) throw new RuleError("ข้อความยาวเกินกำหนด กรุณาย่อข้อความ");
  const prev = db.select().from(schema.memberBooks).where(eq(schema.memberBooks.enrollmentId, enrollmentId)).get();
  if (prev && loadedVersion !== undefined && prev.version !== loadedVersion) throw new RuleError("ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดหน้าใหม่", undefined, "conflict");
  if (prev) db.update(schema.memberBooks).set({ housingBefore: housingBefore || null, familyBond: familyBond || null, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.memberBooks.id, prev.id)).run();
  else db.insert(schema.memberBooks).values({ enrollmentId, housingBefore: housingBefore || null, familyBond: familyBond || null, createdBy: actor.userId, updatedBy: actor.userId }).run();
  writeAudit(db, { userId: actor.userId, action: prev ? "update" : "create", entity: "member_book", entityId: enrollmentId, ip: actor.ip ?? null });
}

// ───────── ส่วนที่ 3: รายเดือน ─────────

const monthBounds = (period: string) => {
  const [y, m] = period.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { from: `${period}-01`, to: `${period}-${String(last).padStart(2, "0")}` };
};
const validPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

/** เดือนที่ต้องมีบันทึกส่วนที่ 3 ของสมาชิก: ตั้งแต่เดือนที่เข้าโปรแกรม ถึงเดือนที่ออก/จบ หรือเดือนปัจจุบัน */
export function bookMonths(e: { enrolledDate: string; leftDate: string | null }, cohort: { startDate: string; endDate: string }, today = todayISO()): string[] {
  const start = (e.enrolledDate > cohort.startDate ? e.enrolledDate : cohort.startDate).slice(0, 7);
  const endDate = [e.leftDate ?? "9999-12-31", cohort.endDate, today].sort()[0];
  const end = endDate.slice(0, 7);
  const out: string[] = [];
  let [y, m] = start.split("-").map(Number);
  while (`${y}-${String(m).padStart(2, "0")}` <= end && out.length < 36) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    if (++m > 12) { m = 1; y++; }
  }
  return out;
}

/** ข้อมูลช่วยเขียนของเดือนนั้น (สเปก 16A ส่วนที่ 3): % เข้าร่วม · คะแนนพฤติกรรม · บันทึกพฤติกรรม · การเลื่อนระยะ */
export function monthHelper(db: DB, enrollmentId: number, period: string) {
  const { e } = load(db, enrollmentId);
  const { from, to } = monthBounds(period);
  const att = db.select({ status: schema.attendance.status }).from(schema.attendance).innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.attendance.sessionId))
    .where(and(eq(schema.attendance.enrollmentId, enrollmentId), gte(schema.cohortSessions.date, from), lte(schema.cohortSessions.date, to), isNull(schema.cohortSessions.deletedAt))).all();
  const counted = att.filter((a) => a.status !== "corrections");
  const present = counted.filter((a) => a.status === "present").length;
  const prog = db.select({ r: schema.assessmentResults }).from(schema.assessmentResults).innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
    .where(and(eq(schema.assessmentResults.enrollmentId, enrollmentId), eq(schema.assessmentForms.code, "PROG"), eq(schema.assessmentResults.round, "monthly"), eq(schema.assessmentResults.period, period), isNull(schema.assessmentResults.deletedAt))).get()?.r ?? null;
  const notes = db.select().from(schema.behaviorNotes).where(and(eq(schema.behaviorNotes.incarcerationId, e.incarcerationId), gte(schema.behaviorNotes.noteDate, from), lte(schema.behaviorNotes.noteDate, to), isNull(schema.behaviorNotes.deletedAt))).orderBy(asc(schema.behaviorNotes.noteDate)).all();
  const phases = db.select().from(schema.phaseRecords).where(and(eq(schema.phaseRecords.enrollmentId, enrollmentId), gte(schema.phaseRecords.startDate, from), lte(schema.phaseRecords.startDate, to), isNull(schema.phaseRecords.deletedAt))).all();
  return {
    period,
    attendance: { counted: counted.length, present, pct: counted.length ? Math.round((present / counted.length) * 100) : null, corrections: att.length - counted.length },
    progress: prog ? { total: prog.total, level: prog.level } : null,
    behavior: { positive: notes.filter((n) => n.tone === "positive").length, negative: notes.filter((n) => n.tone === "negative").length, observe: notes.filter((n) => n.tone === "observe").length, notes: notes.map((n) => ({ date: n.noteDate, tone: n.tone, text: n.text })) },
    phases: phases.map((p) => ({ phase: p.phase, date: p.startDate })),
    // ตำแหน่ง/ทีมที่เปลี่ยนในเดือนนี้ (สเปก 16A ส่วนที่ 3)
    assignments: assignmentChanges(db, enrollmentId, from, to).map((x) => ({ kind: x.kind as "position" | "team", label: lookupLabel(db, x.kind === "position" ? "tc_position" : "tc_team", x.value), changeType: x.changeType, date: x.startDate, reason: x.reason })),
  };
}
export type MonthHelper = ReturnType<typeof monthHelper>;

/** ข้อความสรุปสำหรับปุ่ม "แทรกสรุป" — ผู้บันทึกแก้ต่อได้ */
export function helperSummary(h: MonthHelper): string {
  const parts: string[] = [];
  if (h.attendance.pct != null) parts.push(`เข้าร่วมกิจกรรม ${h.attendance.pct}% (${h.attendance.present}/${h.attendance.counted} ครั้ง${h.attendance.corrections ? ` ไม่นับเหตุราชทัณฑ์ ${h.attendance.corrections} ครั้ง` : ""})`);
  if (h.progress?.total != null) parts.push(`คะแนนประเมินพฤติกรรมประจำเดือน ${h.progress.total}${h.progress.level ? ` (${h.progress.level})` : ""}`);
  const b = h.behavior;
  if (b.positive + b.negative + b.observe > 0) parts.push(`บันทึกพฤติกรรม เชิงบวก ${b.positive} ครั้ง เชิงลบ ${b.negative} ครั้ง สังเกต ${b.observe} ครั้ง`);
  for (const p of h.phases) parts.push(`เลื่อนเข้าระยะ ${phaseLabel(p.phase)}`);
  for (const x of h.assignments) parts.push(`${CHANGE_LABEL[x.changeType ?? "assign"] ?? "กำหนด"}${x.kind === "position" ? "เป็น" : "ไป"} ${x.label}${x.reason ? ` (${x.reason})` : ""}`);
  return parts.length ? `${parts.join(" · ")}` : "";
}

export function listNotes(db: DB, enrollmentId: number, kind: "monthly" | "counselor") {
  return db.select().from(schema.memberBookNotes).where(and(eq(schema.memberBookNotes.enrollmentId, enrollmentId), eq(schema.memberBookNotes.kind, kind), isNull(schema.memberBookNotes.deletedAt)))
    .orderBy(kind === "monthly" ? asc(schema.memberBookNotes.period) : desc(schema.memberBookNotes.noteDate), desc(schema.memberBookNotes.id)).all();
}

function checkNote(text: string, noteDate: string) {
  if (clean(text).length < 3) throw new RuleError("กรุณาพิมพ์ข้อความบันทึก");
  if (clean(text).length > TEXT_MAX) throw new RuleError("ข้อความยาวเกินกำหนด กรุณาย่อข้อความ");
  if (!isValidISODate(noteDate)) throw new RuleError("กรุณาเลือกวันที่บันทึก");
  if (noteDate > todayISO()) throw new RuleError("วันที่บันทึกต้องไม่เป็นวันในอนาคต");
}

/** ส่วนที่ 3: 1 บันทึกต่อเดือน (มีแล้ว = แก้ไข) */
export function saveMonthlyNote(db: DB, enrollmentId: number, input: { period: string; text: string; noteDate: string }, actor: Actor, loadedVersion?: number) {
  const { e, c } = load(db, enrollmentId);
  if (!validPeriod(input.period)) throw new RuleError("เดือนไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  if (!bookMonths(e, c).includes(input.period)) throw new RuleError("เดือนนี้อยู่นอกช่วงที่สมาชิกอยู่ในโปรแกรม");
  checkNote(input.text, input.noteDate);
  const prev = db.select().from(schema.memberBookNotes).where(and(eq(schema.memberBookNotes.enrollmentId, enrollmentId), eq(schema.memberBookNotes.kind, "monthly"), eq(schema.memberBookNotes.period, input.period), isNull(schema.memberBookNotes.deletedAt))).get();
  if (prev) {
    if (loadedVersion !== undefined && prev.version !== loadedVersion) throw new RuleError("บันทึกนี้ถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดหน้าใหม่", undefined, "conflict");
    db.update(schema.memberBookNotes).set({ text: clean(input.text), noteDate: input.noteDate, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.memberBookNotes.id, prev.id)).run();
    writeAudit(db, { userId: actor.userId, action: "update", entity: "member_book_note", entityId: prev.id, note: `monthly ${input.period}`, ip: actor.ip ?? null });
    return prev.id;
  }
  const id = db.insert(schema.memberBookNotes).values({ enrollmentId, kind: "monthly", period: input.period, noteDate: input.noteDate, authorId: actor.userId, text: clean(input.text), createdBy: actor.userId, updatedBy: actor.userId }).returning().get().id;
  writeAudit(db, { userId: actor.userId, action: "create", entity: "member_book_note", entityId: id, note: `monthly ${input.period}`, ip: actor.ip ?? null });
  return id;
}

// ───────── ส่วนที่ 4: ความเห็นที่ปรึกษา ─────────

export function addCounselorOpinion(db: DB, enrollmentId: number, input: { text: string; noteDate: string }, actor: Actor) {
  load(db, enrollmentId);
  checkNote(input.text, input.noteDate);
  const id = db.insert(schema.memberBookNotes).values({ enrollmentId, kind: "counselor", period: "", noteDate: input.noteDate, authorId: actor.userId, text: clean(input.text), createdBy: actor.userId, updatedBy: actor.userId }).returning().get().id;
  writeAudit(db, { userId: actor.userId, action: "create", entity: "member_book_note", entityId: id, note: "counselor", ip: actor.ip ?? null });
  return id;
}

/** แก้/ลบความเห็น: เฉพาะผู้เขียนเอง หรือผู้ดูแล (สเปก 2.2A: "ของตน (เมื่อเป็นที่ปรึกษา)") */
function ownNote(db: DB, noteId: number, actor: Actor) {
  const n = db.select().from(schema.memberBookNotes).where(and(eq(schema.memberBookNotes.id, noteId), isNull(schema.memberBookNotes.deletedAt))).get();
  if (!n || n.kind !== "counselor") throw new RuleError("ไม่พบความเห็นนี้");
  if (n.authorId !== actor.userId && !actor.isAdmin) throw new RuleError("แก้ไขได้เฉพาะความเห็นที่ตนเขียน");
  return n;
}
export function updateCounselorOpinion(db: DB, noteId: number, input: { text: string; noteDate: string }, actor: Actor) {
  const n = ownNote(db, noteId, actor);
  checkNote(input.text, input.noteDate);
  db.update(schema.memberBookNotes).set({ text: clean(input.text), noteDate: input.noteDate, updatedBy: actor.userId, updatedAt: new Date(), version: n.version + 1 }).where(eq(schema.memberBookNotes.id, n.id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "member_book_note", entityId: n.id, note: "counselor", ip: actor.ip ?? null });
}
export function deleteCounselorOpinion(db: DB, noteId: number, actor: Actor) {
  const n = ownNote(db, noteId, actor);
  db.update(schema.memberBookNotes).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.memberBookNotes.id, n.id)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "member_book_note", entityId: n.id, note: "counselor", ip: actor.ip ?? null });
}

// ───────── เตือนสิ้นเดือน ─────────

/** สมาชิกที่ยังไม่มีบันทึกส่วนที่ 3 ของเดือนที่จบไปแล้ว (เตือนสิ้นเดือน — สเปก 16A) */
export function missingMonthlyNotes(db: DB, cohortId: number, today = todayISO()) {
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort) return [];
  const enrs = db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["active", "completed"]), isNull(schema.enrollments.deletedAt))).all();
  if (!enrs.length) return [];
  const have = new Set(db.select({ e: schema.memberBookNotes.enrollmentId, p: schema.memberBookNotes.period }).from(schema.memberBookNotes)
    .where(and(inArray(schema.memberBookNotes.enrollmentId, enrs.map((e) => e.id)), eq(schema.memberBookNotes.kind, "monthly"), isNull(schema.memberBookNotes.deletedAt))).all().map((x) => `${x.e}:${x.p}`));
  const thisMonth = today.slice(0, 7);
  // เดือนปัจจุบันเตือนเมื่อเหลือไม่เกิน 3 วันก่อนสิ้นเดือน
  const nearEnd = addDays(today, 3).slice(0, 7) !== thisMonth;
  const out: Array<{ enrollmentId: number; period: string }> = [];
  for (const e of enrs) for (const p of bookMonths(e, cohort, today)) {
    if (p > thisMonth || (p === thisMonth && !nearEnd)) continue;
    if (!have.has(`${e.id}:${p}`)) out.push({ enrollmentId: e.id, period: p });
  }
  return out;
}

// ───────── ส่วนที่ 2.9: หน้าสรุปผลรายบุคคล ─────────

/** ตารางก่อน/หลังของ ความรู้ ทัศนคติ แรงจูงใจ และผลความก้าวหน้า (ตามภาพ docs/forms/source/17) */
export function individualSummary(db: DB, enrollmentId: number) {
  const rows = db.select({ r: schema.assessmentResults, code: schema.assessmentForms.code }).from(schema.assessmentResults).innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
    .where(and(eq(schema.assessmentResults.enrollmentId, enrollmentId), inArray(schema.assessmentForms.code, ["KNOW", "ATT", "MOTIV", "PROG"]), isNull(schema.assessmentResults.deletedAt))).all();
  const cell = (code: string, round: string) => {
    const x = rows.filter((r) => r.code === code && r.r.round === round).sort((a, b) => a.r.assessedDate.localeCompare(b.r.assessedDate)).at(-1)?.r;
    return x ? { date: x.assessedDate, total: x.total, level: x.level } : null;
  };
  return {
    knowledge: { pre: cell("KNOW", "pre"), post: cell("KNOW", "post") },
    attitude: { pre: cell("ATT", "pre"), post: cell("ATT", "post") },
    motivation: { pre: cell("MOTIV", "pre"), post: cell("MOTIV", "post") },
    progress: rows.filter((r) => r.code === "PROG").sort((a, b) => a.r.assessedDate.localeCompare(b.r.assessedDate)).map((r) => ({ date: r.r.assessedDate, total: r.r.total, level: r.r.level, period: r.r.period })),
  };
}
