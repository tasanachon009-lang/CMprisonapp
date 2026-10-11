import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { RuleError } from "../errors";
import { addDays, isValidISODate, todayISO } from "../thai-date";

/**
 * เครื่องมือบ้าน · กฎ 5 ข้อใหญ่ · วินัยอื่น · รางวัล/สิทธิพิเศษ ของชุมชนบำบัด (สเปก 16)
 * ผู้เรียกตรวจสิทธิ์ tc.view / tc.edit ก่อน
 */
type Actor = { userId: number; ip?: string | null };
type Tx = Pick<DB, "select" | "insert" | "update">;
export type RecordKind = "tool" | "cardinal" | "violation" | "reward";
export const RECORD_KIND_LABEL: Record<RecordKind, string> = { tool: "เครื่องมือบ้าน", cardinal: "ละเมิดกฎ 5 ข้อใหญ่", violation: "ความผิดวินัย", reward: "รางวัล/สิทธิพิเศษ" };
const KIND_LOOKUP: Record<RecordKind, string> = { tool: "tc_tool", cardinal: "tc_rule", violation: "tc_violation", reward: "tc_reward" };
export const LEVEL_LABEL: Record<string, string> = { minor: "เล็กน้อย", moderate: "ปานกลาง", serious: "ร้ายแรง" };

/** เครื่องมือ 5 ขั้นเรียงตามความรุนแรง (สเปก 16) — ที่เหลือใช้ได้ทุกระยะ ไม่อยู่ในลำดับขั้น */
export const TOOL_LADDER = ["talking_to", "pull_up", "hair_cut", "shot_down", "house_meeting"];
/** เครื่องมือที่มีระยะเวลาและต้องปลด: ค่าเริ่มต้นจำนวนวัน (LE 3–4 วัน) */
export const TIMED_TOOLS: Record<string, { defaultDays: number; maxDays: number }> = { shot_down: { defaultDays: 3, maxDays: 30 }, le: { defaultDays: 3, maxDays: 4 } };
export const HAIRCUT_ADVISERS = { min: 3, max: 4 };

export function tcList(db: DB, kind: RecordKind) {
  return db.select().from(schema.lookups).where(eq(schema.lookups.category, KIND_LOOKUP[kind])).orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.id)).all().map((l) => ({ code: l.code, label: l.label, active: l.active }));
}
export function recordLabel(db: DB, kind: string, code: string) {
  const cat = KIND_LOOKUP[kind as RecordKind];
  return (cat && db.select().from(schema.lookups).where(and(eq(schema.lookups.category, cat), eq(schema.lookups.code, code))).get()?.label) || code;
}

/**
 * แนะนำเครื่องมือขั้นถัดไปเมื่อผิดซ้ำเรื่องเดิม (สเปก 16): ดูเครื่องมือขั้นสูงสุดที่เคยใช้กับเรื่องเดียวกัน
 * ยังไม่เคย = Talking to · ถึงขั้นสูงสุดแล้ว = House meeting
 */
export function suggestTool(usedCodes: string[]): { code: string; repeat: number } {
  const ranks = usedCodes.map((c) => TOOL_LADDER.indexOf(c)).filter((r) => r >= 0);
  if (!ranks.length) return { code: TOOL_LADDER[0], repeat: 0 };
  return { code: TOOL_LADDER[Math.min(Math.max(...ranks) + 1, TOOL_LADDER.length - 1)], repeat: ranks.length };
}
export function suggestNextTool(db: DB, enrollmentId: number, topic: string | null | undefined) {
  if (!topic) return { code: TOOL_LADDER[0], repeat: 0 };
  const used = db.select({ code: schema.tcRecords.code }).from(schema.tcRecords)
    .where(and(eq(schema.tcRecords.enrollmentId, enrollmentId), eq(schema.tcRecords.kind, "tool"), eq(schema.tcRecords.topic, topic), isNull(schema.tcRecords.deletedAt))).all().map((r) => r.code);
  return suggestTool(used);
}

export type RecordInput = {
  enrollmentId: number; kind: RecordKind; code: string; recordDate: string; behavior: string; topic?: string | null; level?: string | null;
  appliedBy?: number | null; observer?: string | null; startDate?: string | null; endDate?: string | null; outcome?: string | null;
  /** Hair cut: ใบร้องขอ */
  haircut?: { requester?: string | null; when?: string | null; advisers?: string[] } | null;
  sourceNoteId?: number | null;
};

function member(db: Tx, enrollmentId: number) {
  const row = db.select({ e: schema.enrollments, code: schema.courses.code, cohort: schema.cohorts, p: schema.persons, inc: schema.incarcerations }).from(schema.enrollments)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.id, enrollmentId), isNull(schema.enrollments.deletedAt))).get();
  if (!row || row.code !== "FAST") throw new RuleError("ไม่ใช่สมาชิกชุมชนบำบัด");
  return row;
}

export function createRecord(db: DB, input: RecordInput, actor: Actor) {
  if (!(input.kind in RECORD_KIND_LABEL)) throw new RuleError("ประเภทรายการไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  if (!isValidISODate(input.recordDate)) throw new RuleError("กรุณาเลือกวันที่");
  if (input.recordDate > todayISO()) throw new RuleError("วันที่ต้องไม่เป็นวันในอนาคต");
  const behavior = (input.behavior ?? "").trim();
  if (behavior.length < 3) throw new RuleError(input.kind === "reward" ? "กรุณาระบุเหตุที่ให้รางวัล" : "กรุณาระบุพฤติกรรมที่พบ");
  if (behavior.length > 2000) throw new RuleError("ข้อความยาวเกินกำหนด กรุณาย่อข้อความ");
  if (!tcList(db, input.kind).some((x) => x.code === input.code && x.active)) throw new RuleError(`ไม่พบรายการ${RECORD_KIND_LABEL[input.kind]}นี้ กรุณาโหลดหน้าใหม่`);
  if (input.kind === "violation" && !(String(input.level) in LEVEL_LABEL)) throw new RuleError("กรุณาเลือกระดับความผิด");
  if (input.topic && !db.select().from(schema.lookups).where(and(eq(schema.lookups.category, "behavior_category"), eq(schema.lookups.code, input.topic))).get()) throw new RuleError("ไม่พบหมวดพฤติกรรมนี้ กรุณาโหลดหน้าใหม่");

  let startDate: string | null = null, endDate: string | null = null, status = "closed", details: unknown = null;
  if (input.kind === "tool") {
    const timed = TIMED_TOOLS[input.code];
    if (timed) {
      startDate = input.startDate || input.recordDate;
      endDate = input.endDate || addDays(startDate, timed.defaultDays);
      if (!isValidISODate(startDate) || !isValidISODate(endDate)) throw new RuleError("กรุณาเลือกวันเริ่มและวันครบกำหนดปลด");
      if (endDate < startDate) throw new RuleError("วันครบกำหนดปลดต้องไม่อยู่ก่อนวันเริ่ม");
      const days = Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / 86400000);
      if (days > timed.maxDays) throw new RuleError(`ระยะเวลาเกินกำหนด (ไม่เกิน ${timed.maxDays} วัน)`);
      status = "open";
    }
    if (input.code === "hair_cut") {
      const advisers = (input.haircut?.advisers ?? []).map((a) => a.trim()).filter(Boolean);
      if (advisers.length < HAIRCUT_ADVISERS.min || advisers.length > HAIRCUT_ADVISERS.max) throw new RuleError(`Hair cut ต้องมีผู้ให้คำแนะนำ ${HAIRCUT_ADVISERS.min}–${HAIRCUT_ADVISERS.max} คน`);
      const requester = (input.haircut?.requester ?? "").trim();
      if (requester.length < 2) throw new RuleError("กรุณาระบุผู้ขอใช้ Hair cut");
      details = { requester: requester.slice(0, 100), when: (input.haircut?.when ?? "").trim().slice(0, 200) || null, advisers: advisers.map((a) => a.slice(0, 100)) };
    }
  }
  // กฎ 5 ข้อใหญ่: เปิดเรื่องไว้จนกว่าจะบันทึกผลการดำเนินการ
  if (input.kind === "cardinal") status = "open";

  return db.transaction((tx) => {
    const m = member(tx, input.enrollmentId);
    if (!["active", "completed"].includes(m.e.status)) throw new RuleError("สมาชิกไม่ได้อยู่ในสถานะกำลังอบรม");
    if (input.recordDate < m.e.enrolledDate) throw new RuleError("วันที่อยู่ก่อนวันเข้าโปรแกรม");
    if (input.appliedBy != null && !tx.select().from(schema.users).where(eq(schema.users.id, input.appliedBy)).get()) throw new RuleError("ไม่พบผู้ใช้เครื่องมือ กรุณาโหลดหน้าใหม่");
    let noteId: number | null = null;
    if (input.sourceNoteId != null) {
      const note = tx.select().from(schema.behaviorNotes).where(and(eq(schema.behaviorNotes.id, input.sourceNoteId), isNull(schema.behaviorNotes.deletedAt))).get();
      if (!note || note.incarcerationId !== m.e.incarcerationId) throw new RuleError("ไม่พบบันทึกพฤติกรรมต้นทาง");
      if (note.convertedTo) throw new RuleError("บันทึกพฤติกรรมนี้ถูกแปลงไปแล้ว");
      noteId = note.id;
    }
    const rec = tx.insert(schema.tcRecords).values({
      enrollmentId: input.enrollmentId, kind: input.kind, code: input.code, level: input.kind === "violation" ? input.level : null, recordDate: input.recordDate,
      topic: input.topic || null, behavior, appliedBy: input.kind === "tool" ? input.appliedBy ?? actor.userId : null, observer: (input.observer ?? "").trim().slice(0, 200) || null,
      startDate, endDate, outcome: (input.outcome ?? "").trim().slice(0, 1000) || null, details, status, sourceNoteId: noteId, createdBy: actor.userId, updatedBy: actor.userId,
    }).returning().get();
    if (noteId) tx.update(schema.behaviorNotes).set({ convertedTo: `tc_record:${rec.id}`, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.behaviorNotes.id, noteId)).run();
    writeAudit(tx, { userId: actor.userId, action: "create", entity: "tc_record", entityId: rec.id, personId: m.p.id, after: { kind: input.kind, code: input.code, level: rec.level, date: input.recordDate }, ip: actor.ip ?? null });
    // กฎ 5 ข้อใหญ่: แจ้งหัวหน้าศูนย์ทันที (สเปก 16) — ผู้ดูแลทุกคน
    if (input.kind === "cardinal") {
      const label = tx.select().from(schema.lookups).where(and(eq(schema.lookups.category, "tc_rule"), eq(schema.lookups.code, input.code))).get()?.label ?? input.code;
      notify(tx, { role: "admin", severity: "danger", kind: "tc_cardinal_rule", message: `ละเมิดกฎ 5 ข้อใหญ่ (${label}): ${m.p.firstName} ${m.p.lastName} (${m.inc.inmateNo})`, link: `/cohorts/${m.cohort.id}/tc/tools` });
    }
    return rec;
  });
}

/** ปลดเครื่องมือที่มีระยะเวลา / ปิดเรื่องกฎ 5 ข้อ พร้อมผลลัพธ์ */
export function closeRecord(db: DB, id: number, input: { date: string; outcome: string }, actor: Actor) {
  const r = db.select().from(schema.tcRecords).where(and(eq(schema.tcRecords.id, id), isNull(schema.tcRecords.deletedAt))).get();
  if (!r) throw new RuleError("ไม่พบรายการนี้");
  if (r.status !== "open") throw new RuleError("รายการนี้ปิดไปแล้ว");
  if (!isValidISODate(input.date)) throw new RuleError("กรุณาเลือกวันที่");
  if (input.date > todayISO()) throw new RuleError("วันที่ต้องไม่เป็นวันในอนาคต");
  if (input.date < (r.startDate ?? r.recordDate)) throw new RuleError("วันที่ต้องไม่อยู่ก่อนวันเริ่ม");
  const outcome = (input.outcome ?? "").trim();
  if (outcome.length < 3) throw new RuleError("กรุณาระบุผลลัพธ์");
  db.update(schema.tcRecords).set({ status: "closed", releasedDate: input.date, outcome: outcome.slice(0, 1000), updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.tcRecords.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "tc_record", entityId: id, before: { status: "open" }, after: { status: "closed", date: input.date }, ip: actor.ip ?? null });
}

/** ลบ (ซ่อน) รายการที่บันทึกผิด — ต้องมีเหตุผล · คืนสถานะบันทึกพฤติกรรมต้นทาง */
export function deleteRecord(db: DB, id: number, reason: string, actor: Actor) {
  if ((reason ?? "").trim().length < 3) throw new RuleError("กรุณาระบุเหตุผลที่ลบ");
  const r = db.select().from(schema.tcRecords).where(and(eq(schema.tcRecords.id, id), isNull(schema.tcRecords.deletedAt))).get();
  if (!r) throw new RuleError("ไม่พบรายการนี้");
  db.transaction((tx) => {
    tx.update(schema.tcRecords).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.tcRecords.id, id)).run();
    if (r.sourceNoteId) tx.update(schema.behaviorNotes).set({ convertedTo: null }).where(eq(schema.behaviorNotes.id, r.sourceNoteId)).run();
    writeAudit(tx, { userId: actor.userId, action: "delete", entity: "tc_record", entityId: id, before: { kind: r.kind, code: r.code }, note: reason.trim(), ip: actor.ip ?? null });
  });
}

export function cohortRecords(db: DB, cohortId: number, opts: { kind?: RecordKind; limit?: number } = {}) {
  return db.select({ r: schema.tcRecords, p: schema.persons, inc: schema.incarcerations }).from(schema.tcRecords)
    .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.tcRecords.enrollmentId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.tcRecords.deletedAt), ...(opts.kind ? [eq(schema.tcRecords.kind, opts.kind)] : [])))
    .orderBy(desc(schema.tcRecords.recordDate), desc(schema.tcRecords.id)).limit(opts.limit ?? 200).all();
}

export function memberRecords(db: DB, enrollmentId: number, from?: string, to?: string) {
  return db.select().from(schema.tcRecords).where(and(eq(schema.tcRecords.enrollmentId, enrollmentId), isNull(schema.tcRecords.deletedAt))).orderBy(asc(schema.tcRecords.recordDate), asc(schema.tcRecords.id)).all()
    .filter((r) => (!from || r.recordDate >= from) && (!to || r.recordDate <= to));
}

/** เครื่องมือที่ครบกำหนดปลดแล้ว (Shot down / LE) และเรื่องกฎ 5 ข้อที่ยังไม่ปิด */
export function openItems(db: DB, cohortId: number, today = todayISO()) {
  const rows = cohortRecords(db, cohortId, { limit: 1000 }).filter((x) => x.r.status === "open");
  return {
    due: rows.filter((x) => x.r.kind === "tool" && x.r.endDate != null && x.r.endDate <= today),
    running: rows.filter((x) => x.r.kind === "tool" && (x.r.endDate == null || x.r.endDate > today)),
    cardinal: rows.filter((x) => x.r.kind === "cardinal"),
  };
}

/** สรุปไม่ระบุชื่อ (ผู้บริหาร / รายงานสิ้นสุดรุ่น): จำนวนรายการตามประเภท */
export function recordSummary(db: DB, cohortId: number) {
  const rows = cohortRecords(db, cohortId, { limit: 100000 }).map((x) => x.r).filter((r) => r.status !== "cancelled" || r.kind !== "tool");
  const by = (kind: RecordKind) => {
    const m = new Map<string, number>();
    for (const r of rows.filter((x) => x.kind === kind)) m.set(r.code, (m.get(r.code) ?? 0) + 1);
    return tcList(db, kind).map((l) => ({ code: l.code, label: l.label, n: m.get(l.code) ?? 0 })).filter((x) => x.n > 0 || kind !== "violation");
  };
  const levels = Object.keys(LEVEL_LABEL).map((lv) => ({ level: lv, label: LEVEL_LABEL[lv], n: rows.filter((r) => r.kind === "violation" && r.level === lv).length }));
  return { tools: by("tool"), cardinal: by("cardinal"), violations: by("violation"), rewards: by("reward"), levels, total: rows.length, members: new Set(rows.filter((r) => r.kind !== "reward").map((r) => r.enrollmentId)).size };
}

// ───────── เชื่อมกับการบันทึกออกจากเรือนจำ (สเปก 8: "ยกเลิก Shot down/LE") ─────────

/** ยกเลิกเครื่องมือที่ยังไม่ปลดของสมาชิกที่ออกจากเรือนจำ — คืนรหัสรายการเพื่อย้อนได้ */
export function cancelOpenToolsOnRelease(tx: Tx, enrollmentIds: number[], releaseEventId: number, userId: number): number[] {
  if (!enrollmentIds.length) return [];
  const open = tx.select().from(schema.tcRecords).where(and(inArray(schema.tcRecords.enrollmentId, enrollmentIds), eq(schema.tcRecords.kind, "tool"), eq(schema.tcRecords.status, "open"), isNull(schema.tcRecords.deletedAt))).all();
  for (const r of open) tx.update(schema.tcRecords).set({ status: "cancelled", cancelledByReleaseId: releaseEventId, updatedBy: userId, updatedAt: new Date() }).where(eq(schema.tcRecords.id, r.id)).run();
  return open.map((r) => r.id);
}
export function restoreToolsOnReleaseCancel(tx: Tx, releaseEventId: number) {
  const rows = tx.select().from(schema.tcRecords).where(and(eq(schema.tcRecords.cancelledByReleaseId, releaseEventId), eq(schema.tcRecords.status, "cancelled"))).all();
  for (const r of rows) tx.update(schema.tcRecords).set({ status: "open", cancelledByReleaseId: null }).where(eq(schema.tcRecords.id, r.id)).run();
  return rows.length;
}

/** จำนวนเครื่องมือที่ครบกำหนดปลดของทุกรุ่น ณ วันนี้ (ใช้แจ้งเตือน) */
export function dueToolCount(db: DB, today = todayISO()) {
  return db.select({ id: schema.tcRecords.id }).from(schema.tcRecords).where(and(eq(schema.tcRecords.kind, "tool"), eq(schema.tcRecords.status, "open"), lte(schema.tcRecords.endDate, today), isNull(schema.tcRecords.deletedAt))).all().length;
}
