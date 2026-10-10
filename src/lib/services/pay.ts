import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lte, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { getSetting } from "../bootstrap";
import { isValidISODate } from "../thai-date";
import { computeLines, personTotals, type PayLine, type PayRate, type PaySessionInput, type SplitMethod } from "../pay/calc";
import { cohortLabel } from "./cohorts";

/**
 * ค่าตอบแทนวิทยากร (สเปก 11.3–11.6, 22B "ล็อกหลังอนุมัติ")
 * - คิดจาก "สอนจริง" ของคาบที่ปิดคาบแล้วเท่านั้น
 * - รอบเบิก (รุ่น + ช่วงวันที่): ร่าง = คำนวณสด · อนุมัติ = เก็บยอด ณ วันอนุมัติ (อัตราเปลี่ยนภายหลังไม่กระทบ) + ล็อกคาบ
 * - คาบที่อยู่ในรอบที่อนุมัติแล้ว ไม่ถูกนำไปเบิกซ้ำ · ผู้อนุมัติอนุมัติรอบที่มียอดของตัวเองไม่ได้ (แยกหน้าที่)
 */

export const BATCH_STATUS_LABEL: Record<string, string> = { draft: "ร่าง (ยังไม่อนุมัติ)", approved: "อนุมัติแล้ว (ล็อกคาบ)", cancelled: "ยกเลิก" };

export type PayFilter = { cohortId?: number; cohortIds?: number[]; from?: string; to?: string; excludeBatched?: boolean; sessionIds?: number[]; /** รวมคาบที่ยังไม่ปิด (แสดงยอดล่วงหน้าในหน้าแก้คาบ) */ includeOpen?: boolean };

/** ข้อมูลตั้งต้นสำหรับคำนวณ (คาบที่ปิดคาบแล้ว ไม่ถูกยกเลิก) */
export function payInputs(db: DB, f: PayFilter): PaySessionInput[] {
  const conds = [isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled")];
  if (!f.includeOpen) conds.push(isNotNull(schema.cohortSessions.taughtAt));
  if (f.sessionIds) conds.push(inArray(schema.cohortSessions.id, f.sessionIds.length ? f.sessionIds : [-1]));
  if (f.cohortId) conds.push(eq(schema.cohortSessions.cohortId, f.cohortId));
  if (f.cohortIds) conds.push(inArray(schema.cohortSessions.cohortId, f.cohortIds.length ? f.cohortIds : [-1]));
  if (f.from) conds.push(gte(schema.cohortSessions.date, f.from));
  if (f.to) conds.push(lte(schema.cohortSessions.date, f.to));
  if (f.excludeBatched) conds.push(isNull(schema.cohortSessions.payBatchId));
  const sessions = db.select().from(schema.cohortSessions).where(and(...conds)).orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime)).all();
  if (!sessions.length) return [];
  const ids = sessions.map((s) => s.id);
  const staff = db.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, ids), isNull(schema.sessionStaff.deletedAt))).all();
  const reports = new Map(db.select().from(schema.sessionReports).where(and(inArray(schema.sessionReports.sessionId, ids), isNull(schema.sessionReports.deletedAt))).all().map((r) => [r.sessionId, r]));
  const topics = new Map(db.select().from(schema.activityTopics).all().map((t) => [t.id, t]));
  const rates = new Map(db.select().from(schema.rates).all().map((r) => [r.id, r]));
  const users = new Map(db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).all().map((u) => [u.id, `${u.f} ${u.l}`]));
  const instructors = new Map(db.select().from(schema.instructors).all().map((i) => [i.id, i]));
  const makeupPayable = getSetting<boolean>(db, "pay.makeupPayable", false) === true;
  const rateOf = (id: number | null | undefined): PayRate | null => {
    const r = id ? rates.get(id) : undefined;
    return r && r.active && !r.deletedAt ? { id: r.id, perHourSatang: r.perHourSatang, dailyCapSatang: r.dailyCapSatang } : null;
  };
  return sessions.map((s) => {
    const topic = s.topicId ? topics.get(s.topicId) : undefined;
    const report = reports.get(s.id);
    const notPayable = !topic ? "ไม่ได้ผูกหัวข้อในคลังหัวข้อ" : !topic.payable ? "หัวข้อนี้ตั้งเป็นเบิกไม่ได้" : report?.outcome === "not_done" ? "ไม่ได้ทำกิจกรรม" : s.makeupOfId && !makeupPayable ? "คาบชดเชย (ตั้งค่าไม่คิดค่าตอบแทน)" : null;
    const extRates = (topic?.externalRates as Record<string, number | null> | null) ?? {};
    return {
      id: s.id, cohortId: s.cohortId, date: s.date, startTime: s.startTime, title: s.title, hours: s.hours,
      splitMethod: ((s.splitMethod ?? topic?.splitMethod ?? "full") as SplitMethod), notPayable,
      staff: staff.filter((x) => x.sessionId === s.id).map((x) => {
        if (x.userId) {
          return { staffId: x.id, key: `u${x.userId}`, name: users.get(x.userId) ?? "-", kind: "internal" as const, userId: x.userId, instructorId: null, didTeach: x.didTeach, actualHours: x.actualHours, shareRatio: x.shareRatio, rate: rateOf(topic?.internalRateId) };
        }
        const ins = x.instructorId ? instructors.get(x.instructorId) : undefined;
        const name = ins ? `${ins.prefix ?? ""}${ins.firstName ?? ""} ${ins.lastName ?? ""}`.trim() : x.externalName ?? "-";
        return {
          staffId: x.id, key: ins ? `i${ins.id}` : `x${x.externalName ?? x.id}`, name, kind: "external" as const, userId: null, instructorId: ins?.id ?? null,
          didTeach: x.didTeach, actualHours: x.actualHours, shareRatio: x.shareRatio,
          rate: ins ? rateOf(extRates[ins.externalType ?? ""] ?? extRates["*"]) : null,
          blocked: ins ? null : "ยังไม่อยู่ในทะเบียนวิทยากร — เพิ่มในทะเบียนแล้วเลือกใหม่ในตาราง",
        };
      }),
    };
  });
}

export function liveLines(db: DB, f: PayFilter) {
  return computeLines(payInputs(db, f));
}

/** หน่วยงานไม่หักภาษี ณ ที่จ่าย (เจ้าของยืนยัน 5 ต.ค. 2569) — ยอดสุทธิ = ยอดรวมเสมอ */
export function taxSetting(_db?: DB) {
  return { enabled: false, pct: 0 };
}

/** ยอดของแต่ละคนในคาบเดียว (แสดงในหน้าแก้คาบก่อนบันทึก — สเปก 11.4) — คาบที่ยังไม่ปิดคิดตามตาราง · คาบที่อนุมัติแล้วใช้ยอดที่เก็บไว้ */
export function sessionPreview(db: DB, sessionId: number): PayLine[] {
  const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, sessionId)).get();
  if (!s) return [];
  if (s.payBatchId) return snapshotLines(db, s.payBatchId).filter((l) => l.sessionId === sessionId);
  // เพดานต่อวันต้องรวมคาบอื่นของวันเดียวกัน → คำนวณทั้งวันของรุ่น แล้วเลือกเฉพาะคาบนี้
  return computeLines(payInputs(db, { cohortId: s.cohortId, from: s.date, to: s.date, includeOpen: true })).filter((l) => l.sessionId === sessionId);
}
// ───────── รอบเบิก ─────────

export function createBatch(db: DB, input: { cohortId: number; dateFrom?: string | null; dateTo?: string | null; note?: string | null }, actor: { userId: number; ip?: string | null }) {
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, input.cohortId)).get();
  if (!c || c.deletedAt) throw new RuleError("ไม่พบรุ่น");
  const dateFrom = input.dateFrom || c.startDate;
  const dateTo = input.dateTo || c.endDate;
  if (!isValidISODate(dateFrom) || !isValidISODate(dateTo) || dateTo < dateFrom) throw new RuleError("ช่วงวันที่ไม่ถูกต้อง — วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  const row = db.insert(schema.payBatches).values({ cohortId: c.id, dateFrom, dateTo, note: input.note?.trim() || null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "pay_batch", entityId: row.id, after: { cohortId: c.id, dateFrom, dateTo }, ip: actor.ip });
  return row;
}

export function getBatch(db: DB, id: number) {
  const b = db.select().from(schema.payBatches).where(and(eq(schema.payBatches.id, id), isNull(schema.payBatches.deletedAt))).get();
  if (!b) throw new RuleError("ไม่พบรอบเบิก");
  return b;
}

export function snapshotLines(db: DB, batchId: number): PayLine[] {
  return db.select().from(schema.payLines).where(eq(schema.payLines.batchId, batchId)).orderBy(asc(schema.payLines.date), asc(schema.payLines.id)).all().map(snapshotRow);
}

/** รายละเอียดรอบเบิก: ร่าง = คำนวณสด (เฉพาะคาบที่ยังไม่อยู่ในรอบอื่น) · อนุมัติแล้ว = ยอดที่เก็บไว้ + ตรวจว่าข้อมูลเปลี่ยนหลังอนุมัติหรือไม่ */
export function batchView(db: DB, id: number) {
  const b = getBatch(db, id);
  const tax = taxSetting(db);
  const unrecorded = db.select({ id: schema.cohortSessions.id, date: schema.cohortSessions.date, title: schema.cohortSessions.title })
    .from(schema.cohortSessions)
    .where(and(eq(schema.cohortSessions.cohortId, b.cohortId), gte(schema.cohortSessions.date, b.dateFrom), lte(schema.cohortSessions.date, b.dateTo), isNull(schema.cohortSessions.taughtAt), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled")))
    .orderBy(asc(schema.cohortSessions.date)).all();
  if (b.status === "approved") {
    const lines = snapshotLines(db, id);
    const live = computeLines(payInputs(db, { cohortId: b.cohortId, from: b.dateFrom, to: b.dateTo })).filter((l) => l.payable && lines.some((x) => x.sessionId === l.sessionId));
    const key = (l: PayLine) => `${l.sessionId}:${l.staffId}`;
    const snap = new Map(lines.map((l) => [key(l), l.amountSatang]));
    const changed = live.filter((l) => snap.get(key(l)) !== l.amountSatang).length + lines.filter((l) => !live.some((x) => key(x) === key(l))).length;
    return { batch: b, lines, totals: personTotals(lines, tax), unrecorded: [], notPayable: [] as PayLine[], changedAfterApproval: changed, tax };
  }
  const all = computeLines(payInputs(db, { cohortId: b.cohortId, from: b.dateFrom, to: b.dateTo, excludeBatched: true }));
  const lines = all.filter((l) => l.payable && l.amountSatang > 0);
  return { batch: b, lines, totals: personTotals(lines, tax), unrecorded: b.status === "draft" ? unrecorded : [], notPayable: all.filter((l) => !l.payable), changedAfterApproval: 0, tax };
}

/** อนุมัติ: เก็บยอด + ล็อกคาบ · ผู้อนุมัติต้องไม่มียอดในรอบนี้ */
export function approveBatch(db: DB, id: number, actor: { userId: number; ip?: string | null; delegationId?: number | null; delegationNote?: string | null }) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const v = batchView(t, id);
    if (v.batch.status !== "draft") throw new RuleError("รอบนี้ไม่ได้อยู่ในสถานะร่าง — อนุมัติไม่ได้");
    if (!v.lines.length) throw new RuleError("ไม่มีรายการที่เบิกได้ในช่วงนี้ — ตรวจว่าปิดคาบแล้ว และหัวข้อตั้งเป็นเบิกได้พร้อมอัตรา");
    if (v.lines.some((l) => l.userId === actor.userId)) throw new RuleError("ไม่สามารถอนุมัติรอบเบิกที่มีค่าตอบแทนของตนเอง");
    for (const l of v.lines) {
      tx.insert(schema.payLines).values({
        batchId: id, sessionId: l.sessionId, sessionStaffId: l.staffId, userId: l.userId, instructorId: l.instructorId, name: l.name, kind: l.kind, date: l.date, title: l.title,
        hours: l.hours, factor: l.factor, splitMethod: l.splitMethod, rateId: l.rateId, perHourSatang: l.perHourSatang, grossSatang: l.grossSatang, capCutSatang: l.capCutSatang, amountSatang: l.amountSatang,
      }).run();
    }
    // ล็อกทุกคาบที่ปิดแล้วในช่วง (รวมคาบที่เบิกไม่ได้ — กันแก้เช็คชื่อ/ผลกิจกรรมหลังอนุมัติ)
    const sessionIds = Array.from(new Set([...v.lines.map((l) => l.sessionId), ...v.notPayable.map((l) => l.sessionId)]));
    const closed = payInputs(t, { cohortId: v.batch.cohortId, from: v.batch.dateFrom, to: v.batch.dateTo, excludeBatched: true }).map((s) => s.id);
    const lockIds = Array.from(new Set([...sessionIds, ...closed]));
    if (lockIds.length) tx.update(schema.cohortSessions).set({ lockedAt: new Date(), payBatchId: id, updatedBy: actor.userId, updatedAt: new Date() }).where(inArray(schema.cohortSessions.id, lockIds)).run();
    const total = v.totals.reduce((a, x) => a + x.grossSatang, 0);
    const taxTotal = v.totals.reduce((a, x) => a + x.taxSatang, 0);
    tx.update(schema.payBatches).set({ status: "approved", totalSatang: total, taxSatang: taxTotal, approvedBy: actor.userId, approvedAt: new Date(), approvedViaDelegationId: actor.delegationId ?? null, updatedBy: actor.userId, updatedAt: new Date(), version: v.batch.version + 1 }).where(eq(schema.payBatches.id, id)).run();
    writeAudit(tx, { userId: actor.userId, action: "pay.approve", entity: "pay_batch", entityId: id, after: { total, tax: taxTotal, lines: v.lines.length, lockedSessions: lockIds.length }, note: actor.delegationNote ?? null, ip: actor.ip });
    return { total, lines: v.lines.length, locked: lockIds.length };
  });
}

/** ปลดล็อก (หัวหน้า/รองเท่านั้น + เหตุผล): รอบกลับเป็นร่าง ยอดเดิมเก็บใน audit log · คาบแก้ได้อีกครั้ง */
export function unlockBatch(db: DB, id: number, reason: string, actor: { userId: number; isAdmin: boolean; ip?: string | null }) {
  if (!actor.isAdmin) throw new RuleError("ปลดล็อกได้เฉพาะผู้ดูแลระบบ");
  if (!reason.trim()) throw new RuleError("กรุณาระบุเหตุผลที่ปลดล็อก");
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const b = getBatch(t, id);
    if (b.status !== "approved") throw new RuleError("รอบนี้ยังไม่ได้อนุมัติ — ไม่ต้องปลดล็อก");
    const before = snapshotLines(t, id).map((l) => ({ sessionId: l.sessionId, name: l.name, amount: l.amountSatang }));
    tx.delete(schema.payLines).where(eq(schema.payLines.batchId, id)).run();
    tx.update(schema.cohortSessions).set({ lockedAt: null, payBatchId: null, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.cohortSessions.payBatchId, id)).run();
    tx.update(schema.payBatches).set({ status: "draft", totalSatang: null, taxSatang: null, approvedBy: null, approvedAt: null, approvedViaDelegationId: null, updatedBy: actor.userId, updatedAt: new Date(), version: b.version + 1 }).where(eq(schema.payBatches.id, id)).run();
    writeAudit(tx, { userId: actor.userId, action: "pay.unlock", entity: "pay_batch", entityId: id, before: { total: b.totalSatang, lines: before }, after: { status: "draft" }, note: reason.trim(), ip: actor.ip });
  });
}

export function cancelBatch(db: DB, id: number, actor: { userId: number; ip?: string | null }) {
  const b = getBatch(db, id);
  if (b.status !== "draft") throw new RuleError("ยกเลิกได้เฉพาะรอบที่ยังเป็นร่าง (รอบที่อนุมัติแล้วต้องปลดล็อกก่อน)");
  db.update(schema.payBatches).set({ status: "cancelled", updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.payBatches.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "pay_batch", entityId: id, after: { status: "cancelled" }, ip: actor.ip });
}

export function listBatches(db: DB, cohortId?: number) {
  return db
    .select({ b: schema.payBatches, c: schema.cohorts, course: schema.courses })
    .from(schema.payBatches)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.payBatches.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(isNull(schema.payBatches.deletedAt), cohortId ? eq(schema.payBatches.cohortId, cohortId) : undefined))
    .orderBy(desc(schema.payBatches.createdAt))
    .all()
    .map((r) => ({ ...r.b, cohortLabel: `${r.course.shortName} ${cohortLabel(r.c)}` }));
}

/** สรุปค่าตอบแทน (สเปก 11.6): ยอดที่อนุมัติแล้ว + ยอดที่รออนุมัติ (คำนวณสด) ตามช่วงวันที่ */
export function paySummary(db: DB, f: { from: string; to: string; cohortIds?: number[] }) {
  const approved = db.select({ l: schema.payLines, b: schema.payBatches }).from(schema.payLines)
    .innerJoin(schema.payBatches, eq(schema.payBatches.id, schema.payLines.batchId))
    .where(and(eq(schema.payBatches.status, "approved"), gte(schema.payLines.date, f.from), lte(schema.payLines.date, f.to), f.cohortIds ? inArray(schema.payBatches.cohortId, f.cohortIds.length ? f.cohortIds : [-1]) : undefined))
    .all();
  const approvedLines = approved.map(({ l, b }) => ({ ...snapshotRow(l), cohortId: b.cohortId, status: "approved" as const, batchId: b.id }));
  const pending = computeLines(payInputs(db, { from: f.from, to: f.to, excludeBatched: true, cohortIds: f.cohortIds })).map((l) => ({ ...l, status: "pending" as const, batchId: null as number | null }));
  return [...approvedLines, ...pending].sort((a, b) => a.date.localeCompare(b.date));
}

function snapshotRow(l: typeof schema.payLines.$inferSelect): PayLine {
  return {
    sessionId: l.sessionId, cohortId: 0, staffId: l.sessionStaffId, key: l.userId ? `u${l.userId}` : l.instructorId ? `i${l.instructorId}` : `x${l.name}`, name: l.name,
    kind: l.kind as "internal" | "external", userId: l.userId, instructorId: l.instructorId, date: l.date, startTime: "", title: l.title, hours: l.hours, factor: l.factor,
    splitMethod: l.splitMethod as SplitMethod, rateId: l.rateId, perHourSatang: l.perHourSatang, grossSatang: l.grossSatang, capCutSatang: l.capCutSatang, amountSatang: l.amountSatang, payable: true, note: null,
  };
}

/** แก้วิธีแบ่งเฉพาะคาบ (ผู้ดูแล) + หมายเหตุ · สัดส่วนรายคน (เมื่อแบ่งแบบกำหนดสัดส่วน) */
export function setSessionSplit(db: DB, sessionId: number, input: { method: SplitMethod | null; note?: string | null; ratios?: Array<{ staffId: number; ratio: number }> }, actor: { userId: number; isAdmin: boolean; ip?: string | null }) {
  if (!actor.isAdmin) throw new RuleError("แก้วิธีแบ่งเฉพาะคาบได้เฉพาะผู้ดูแลระบบ");
  const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, sessionId)).get();
  if (!s) throw new RuleError("ไม่พบคาบ");
  if (s.payBatchId) throw new RuleError("คาบนี้อยู่ในรอบเบิกที่อนุมัติแล้ว — ปลดล็อกรอบก่อน");
  if (input.method && !["full", "equal", "ratio"].includes(input.method)) throw new RuleError("วิธีแบ่งไม่ถูกต้อง");
  if (input.method && !input.note?.trim()) throw new RuleError("กรุณาระบุหมายเหตุที่แก้วิธีแบ่งเฉพาะคาบนี้");
  for (const r of input.ratios ?? []) {
    if (!(r.ratio > 0 && r.ratio <= 100)) throw new RuleError("สัดส่วนต้องมากกว่า 0 และไม่เกิน 100");
    db.update(schema.sessionStaff).set({ shareRatio: r.ratio, updatedBy: actor.userId, updatedAt: new Date() }).where(and(eq(schema.sessionStaff.id, r.staffId), eq(schema.sessionStaff.sessionId, sessionId))).run();
  }
  db.update(schema.cohortSessions).set({ splitMethod: input.method, splitNote: input.method ? input.note!.trim() : null, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.cohortSessions.id, sessionId)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "cohort_session_split", entityId: sessionId, before: { method: s.splitMethod, note: s.splitNote }, after: input, ip: actor.ip });
}
