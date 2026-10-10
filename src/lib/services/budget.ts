import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { getSetting } from "../bootstrap";
import { isValidISODate } from "../thai-date";
import {
  applyTemplate, categoryOf, cohortBudgetStatus, lineAmount, needsConfirmation, BUDGET_CATEGORIES,
  type BudgetCategory, type BudgetTemplate, type Factor,
} from "../budget/calc";
import { cohortLabel } from "./cohorts";

/**
 * งบประมาณ (สเปก 13)
 * - จัดสรรต่อปีงบ → แบ่งให้รุ่น (รวมทุกรุ่นห้ามเกินยอดจัดสรร — ตรวจที่นี่ + trigger ในฐานข้อมูล)
 * - ค่าวิทยากรตัดงบจากรอบเบิกที่ "อนุมัติแล้ว" เท่านั้น (คำนวณสดทุกครั้ง → ปลดล็อกแล้วคืนงบอัตโนมัติ)
 * - เกินงบหมวด: ถัวได้ = เหลือง · ห้ามถัว/เกินทั้งแหล่ง = แดง ต้องผู้ดูแลยืนยัน
 */
type Actor = { userId: number; ip?: string | null };

const money = (n: unknown, what: string) => {
  if (!Number.isSafeInteger(n) || (n as number) < 0) throw new RuleError(`${what}ต้องเป็นจำนวนเงินที่ถูกต้อง (ไม่ติดลบ ทศนิยมไม่เกิน 2 ตำแหน่ง)`);
  return n as number;
};
/** แปลงข้อความ "1,234.50" เป็นสตางค์ (จำนวนเต็ม) โดยไม่ผ่านทศนิยมลอยตัว */
export function parseBaht(s: string): number {
  const v = s.replace(/[,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(v)) throw new RuleError("จำนวนเงินไม่ถูกต้อง — ใส่ตัวเลข ทศนิยมไม่เกิน 2 ตำแหน่ง เช่น 1500 หรือ 1,500.50");
  const [b, st = ""] = v.split(".");
  return Number(b) * 100 + Number((st + "00").slice(0, 2));
}

/** แปลงข้อผิดพลาดจาก trigger ฐานข้อมูลเป็นข้อความที่บอกว่าต้องทำอะไร */
function dbGuard<T>(fn: () => T): T {
  try {
    return fn();
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m.includes("BUDGET_OVER_ALLOCATION")) throw new RuleError("รวมงบทุกรุ่นเกินยอดที่ได้รับจัดสรร — ลดยอดรายการ หรือเพิ่มยอดจัดสรรก่อน");
    if (m.includes("BUDGET_ALLOCATION_BELOW_DISTRIBUTED")) throw new RuleError("ยอดจัดสรรน้อยกว่าที่แบ่งให้รุ่นไปแล้ว — ลดงบของรุ่นก่อน");
    if (m.includes("CHECK constraint failed")) throw new RuleError("จำนวนเงินต้องเป็นสตางค์จำนวนเต็มและไม่ติดลบ");
    throw e;
  }
}

// ───────── การจัดสรร (13.1) ─────────

export type AllocationInput = { fiscalYear: number; source: string; docNo?: string | null; docDate?: string | null; subject: string; courseId?: number | null; amountSatang: number; targetPeople?: number | null; targetCohorts?: number | null; flexible: boolean; note?: string | null };

export function saveAllocation(db: DB, id: number | null, input: AllocationInput, actor: Actor) {
  money(input.amountSatang, "ยอดจัดสรร");
  if (!input.subject?.trim()) throw new RuleError("กรุณาใส่เรื่อง");
  if (!Number.isInteger(input.fiscalYear) || input.fiscalYear < 2500) throw new RuleError("ปีงบประมาณไม่ถูกต้อง (พ.ศ.)");
  if (!db.select().from(schema.lookups).where(and(eq(schema.lookups.category, "fund_source"), eq(schema.lookups.code, input.source))).get()) throw new RuleError("กรุณาเลือกแหล่งเงิน");
  if (input.docDate && !isValidISODate(input.docDate)) throw new RuleError("วันที่หนังสือไม่ถูกต้อง");
  const values = {
    fiscalYear: input.fiscalYear, source: input.source, docNo: input.docNo?.trim() || null, docDate: input.docDate || null, subject: input.subject.trim(), courseId: input.courseId ?? null,
    amountSatang: input.amountSatang, targetPeople: input.targetPeople ?? null, targetCohorts: input.targetCohorts ?? null, flexible: !!input.flexible, note: input.note?.trim() || null,
  };
  return dbGuard(() => {
    if (id) {
      const prev = db.select().from(schema.budgetAllocations).where(eq(schema.budgetAllocations.id, id)).get();
      if (!prev || prev.deletedAt) throw new RuleError("ไม่พบการจัดสรร");
      const dist = distributed(db, id);
      if (input.amountSatang < dist) throw new RuleError(`ยอดจัดสรรน้อยกว่าที่แบ่งให้รุ่นไปแล้ว (${(dist / 100).toLocaleString("th-TH")} บาท) — ลดงบของรุ่นก่อน`);
      db.update(schema.budgetAllocations).set({ ...values, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.budgetAllocations.id, id)).run();
      writeAudit(db, { userId: actor.userId, action: "update", entity: "budget_allocation", entityId: id, before: prev, after: values, ip: actor.ip });
      return { ...prev, ...values };
    }
    const row = db.insert(schema.budgetAllocations).values({ ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
    writeAudit(db, { userId: actor.userId, action: "create", entity: "budget_allocation", entityId: row.id, after: values, ip: actor.ip });
    return row;
  });
}

export function deleteAllocation(db: DB, id: number, actor: Actor) {
  if (distributed(db, id) > 0 || db.select().from(schema.budgetExpenses).where(and(eq(schema.budgetExpenses.allocationId, id), isNull(schema.budgetExpenses.deletedAt))).get()) throw new RuleError("การจัดสรรนี้ถูกใช้ในงบของรุ่นแล้ว — ลบรายการงบ/ใช้จ่ายของรุ่นก่อน");
  dbGuard(() => db.update(schema.budgetAllocations).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.budgetAllocations.id, id)).run());
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "budget_allocation", entityId: id, ip: actor.ip });
}

export function distributed(db: DB, allocationId: number) {
  return db.select({ n: sql<number>`COALESCE(SUM(${schema.budgetLines.amountSatang}), 0)` }).from(schema.budgetLines).where(and(eq(schema.budgetLines.allocationId, allocationId), isNull(schema.budgetLines.deletedAt))).get()?.n ?? 0;
}

export function listAllocations(db: DB, fiscalYear?: number) {
  return db.select().from(schema.budgetAllocations)
    .where(and(isNull(schema.budgetAllocations.deletedAt), fiscalYear ? eq(schema.budgetAllocations.fiscalYear, fiscalYear) : undefined))
    .orderBy(asc(schema.budgetAllocations.fiscalYear), asc(schema.budgetAllocations.id)).all();
}

/** การจัดสรรที่ใช้กับรุ่นนี้ได้: ปีงบเดียวกัน และ (ไม่ระบุหลักสูตร หรือหลักสูตรเดียวกัน) */
export function allocationsForCohort(db: DB, cohortId: number) {
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) return [];
  return listAllocations(db, c.fiscalYear).filter((a) => !a.courseId || a.courseId === c.courseId);
}

// ───────── งบของรุ่น (13.2) ─────────

export type LineInput = { allocationId: number; item: string; label?: string | null; unitSatang: number; factors: Factor[] };

function assertOpen(db: DB, cohortId: number) {
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) throw new RuleError("ไม่พบรุ่น");
  if (c.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว — แก้งบที่ตั้งไว้ไม่ได้ (ยังบันทึกใช้จ่ายจริง/คืนเงินเหลือได้)");
}

function checkLine(db: DB, cohortId: number, input: LineInput) {
  assertOpen(db, cohortId);
  money(input.unitSatang, "ราคาต่อหน่วย");
  categoryOf(input.item);
  if (!db.select().from(schema.lookups).where(and(eq(schema.lookups.category, "budget_item"), eq(schema.lookups.code, input.item))).get()) throw new RuleError("กรุณาเลือกรายการงบ");
  if (!input.factors?.length || input.factors.length > 4) throw new RuleError("สูตรต้องมีจำนวน 1–4 ตัว เช่น 15 ชม. × 1 คน");
  if (!allocationsForCohort(db, cohortId).some((a) => a.id === input.allocationId)) throw new RuleError("แหล่งเงินนี้ใช้กับรุ่นนี้ไม่ได้ (ปีงบหรือหลักสูตรไม่ตรง) — เลือกการจัดสรรของปีงบเดียวกัน");
  let amount: number;
  try { amount = lineAmount(input.unitSatang, input.factors); } catch (e) { throw new RuleError(e instanceof Error ? e.message : "สูตรไม่ถูกต้อง"); }
  return amount;
}

/** ตรวจรวมทุกรุ่นไม่เกินยอดจัดสรร (บอกยอดที่เหลือให้แบ่งได้) */
function assertCap(db: DB, allocationId: number, addSatang: number, excludeLineId?: number) {
  const a = db.select().from(schema.budgetAllocations).where(eq(schema.budgetAllocations.id, allocationId)).get()!;
  const other = db.select({ n: sql<number>`COALESCE(SUM(${schema.budgetLines.amountSatang}), 0)` }).from(schema.budgetLines)
    .where(and(eq(schema.budgetLines.allocationId, allocationId), isNull(schema.budgetLines.deletedAt), excludeLineId ? ne(schema.budgetLines.id, excludeLineId) : undefined)).get()?.n ?? 0;
  if (other + addSatang > a.amountSatang) {
    throw new RuleError(`รวมงบทุกรุ่นเกินยอดที่ได้รับจัดสรร — แบ่งได้อีกไม่เกิน ${((a.amountSatang - other) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท (จัดสรร ${(a.amountSatang / 100).toLocaleString("th-TH")} บาท)`);
  }
}

export function saveLine(db: DB, cohortId: number, id: number | null, input: LineInput, actor: Actor) {
  const amount = checkLine(db, cohortId, input);
  return dbGuard(() => db.transaction((tx) => {
    const t = tx as unknown as DB;
    assertCap(t, input.allocationId, amount, id ?? undefined);
    const values = { allocationId: input.allocationId, item: input.item, label: input.label?.trim() || null, unitSatang: input.unitSatang, factors: input.factors, amountSatang: amount };
    if (id) {
      const prev = tx.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.id, id), eq(schema.budgetLines.cohortId, cohortId), isNull(schema.budgetLines.deletedAt))).get();
      if (!prev) throw new RuleError("ไม่พบรายการงบ");
      tx.update(schema.budgetLines).set({ ...values, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.budgetLines.id, id)).run();
      writeAudit(tx, { userId: actor.userId, action: "update", entity: "budget_line", entityId: id, before: { amount: prev.amountSatang, item: prev.item }, after: values, ip: actor.ip });
      return id;
    }
    const row = tx.insert(schema.budgetLines).values({ cohortId, ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
    writeAudit(tx, { userId: actor.userId, action: "create", entity: "budget_line", entityId: row.id, after: { cohortId, ...values }, ip: actor.ip });
    return row.id;
  }));
}

export function deleteLine(db: DB, cohortId: number, id: number, actor: Actor) {
  assertOpen(db, cohortId);
  const prev = db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.id, id), eq(schema.budgetLines.cohortId, cohortId), isNull(schema.budgetLines.deletedAt))).get();
  if (!prev) throw new RuleError("ไม่พบรายการงบ");
  db.update(schema.budgetLines).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.budgetLines.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "budget_line", entityId: id, before: { amount: prev.amountSatang, item: prev.item }, ip: actor.ip });
}

/** แม่แบบงบของหลักสูตร: ใส่จำนวนคน → เพิ่มรายการทั้งหมด (ทั้งชุดในธุรกรรมเดียว เกินจัดสรร = ไม่เพิ่มเลย) */
export function applyCourseTemplate(db: DB, cohortId: number, allocationId: number, people: number, actor: Actor) {
  const c = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) throw new RuleError("ไม่พบรุ่น");
  const t = getSetting<Record<string, BudgetTemplate>>(db, "budget.templates", {})[c.course.code];
  if (!t?.lines?.length) throw new RuleError(`หลักสูตร ${c.course.shortName} ยังไม่มีแม่แบบงบ — เพิ่มรายการเอง หรือคัดลอกจากรุ่นก่อน`);
  let lines;
  try { lines = applyTemplate(t, people); } catch (e) { throw new RuleError(e instanceof Error ? e.message : "จำนวนคนไม่ถูกต้อง"); }
  return dbGuard(() => db.transaction((tx) => {
    const ids = lines.map((l) => saveLine(tx as unknown as DB, cohortId, null, { allocationId, item: l.item, unitSatang: l.unitSatang, factors: l.factors }, actor));
    return { added: ids.length, totalSatang: lines.reduce((a, l) => a + l.amountSatang, 0) };
  }));
}

/** คัดลอกงบจากรุ่นก่อน (สูตรเดิม) ไปยังแหล่งเงินที่เลือก */
export function copyLinesFrom(db: DB, cohortId: number, fromCohortId: number, allocationId: number, actor: Actor) {
  const src = db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.cohortId, fromCohortId), isNull(schema.budgetLines.deletedAt))).orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id)).all();
  if (!src.length) throw new RuleError("รุ่นต้นทางยังไม่มีรายการงบ");
  return dbGuard(() => db.transaction((tx) => {
    for (const l of src) saveLine(tx as unknown as DB, cohortId, null, { allocationId, item: l.item, label: l.label, unitSatang: l.unitSatang, factors: l.factors as Factor[] }, actor);
    return src.length;
  }));
}

// ───────── สถานะงบ + ใช้จ่ายจริง (13.3) ─────────

/** ค่าวิทยากรของรุ่นจากรอบเบิกที่อนุมัติแล้วเท่านั้น (ยอดเดียวกับใบสำคัญรับเงิน/สรุปใหญ่) */
export function approvedCompensation(db: DB, cohortId: number) {
  const rows = db.select({ kind: schema.payLines.kind, n: sql<number>`COALESCE(SUM(${schema.payLines.amountSatang}), 0)` })
    .from(schema.payLines).innerJoin(schema.payBatches, eq(schema.payBatches.id, schema.payLines.batchId))
    .where(and(eq(schema.payBatches.cohortId, cohortId), eq(schema.payBatches.status, "approved"), isNull(schema.payBatches.deletedAt)))
    .groupBy(schema.payLines.kind).all();
  return { internalSatang: rows.find((r) => r.kind === "internal")?.n ?? 0, externalSatang: rows.find((r) => r.kind === "external")?.n ?? 0 };
}

function cohortData(db: DB, cohortId: number) {
  const lines = db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.cohortId, cohortId), isNull(schema.budgetLines.deletedAt))).orderBy(asc(schema.budgetLines.sortOrder), asc(schema.budgetLines.id)).all();
  const expenses = db.select().from(schema.budgetExpenses).where(and(eq(schema.budgetExpenses.cohortId, cohortId), isNull(schema.budgetExpenses.deletedAt))).orderBy(asc(schema.budgetExpenses.date), asc(schema.budgetExpenses.id)).all();
  const acks = db.select().from(schema.budgetOverrunAcks).where(eq(schema.budgetOverrunAcks.cohortId, cohortId)).all();
  const allocIds = Array.from(new Set([...lines.map((l) => l.allocationId), ...expenses.map((e) => e.allocationId)]));
  const allocations = allocIds.length ? db.select().from(schema.budgetAllocations).where(inArray(schema.budgetAllocations.id, allocIds)).all() : [];
  return { lines, expenses, acks, allocations, comp: approvedCompensation(db, cohortId) };
}

export function cohortBudget(db: DB, cohortId: number) {
  const d = cohortData(db, cohortId);
  const status = cohortBudgetStatus(
    d.allocations.map((a) => ({ id: a.id, flexible: a.flexible })),
    d.lines.map((l) => ({ id: l.id, allocationId: l.allocationId, item: l.item, amountSatang: l.amountSatang })),
    d.expenses.map((e) => ({ allocationId: e.allocationId, kind: e.kind as "expense" | "refund", item: e.item, amountSatang: e.amountSatang })),
    d.comp,
    d.acks,
  );
  return { ...d, status, needsConfirmation: needsConfirmation(status) };
}

export type ExpenseInput = { allocationId: number; item: string; date: string; description: string; amountSatang: number; docNo?: string | null };

/**
 * บันทึกใช้จ่ายจริง — ถ้าทำให้เกิดหมวดสีแดงที่ยังไม่ยืนยัน: ผู้มีสิทธิ์ยืนยัน (หัวหน้า/รอง/ผู้รับมอบอำนาจ) ต้องใส่เหตุผลยืนยัน
 * ผู้ไม่มีสิทธิ์ (การเงิน) → บันทึกไม่ได้ ให้หัวหน้า/รองยืนยันเกินงบที่หน้างบของรุ่นก่อน
 */
export function recordExpense(db: DB, cohortId: number, input: ExpenseInput, actor: Actor & { canConfirm: boolean; confirmNote?: string | null; delegationId?: number | null }) {
  money(input.amountSatang, "จำนวนเงิน");
  if (input.amountSatang <= 0) throw new RuleError("จำนวนเงินต้องมากกว่า 0");
  if (!isValidISODate(input.date)) throw new RuleError("วันที่ไม่ถูกต้อง");
  if (!input.description?.trim()) throw new RuleError("กรุณาใส่รายการ");
  const cat = categoryOf(input.item);
  if (input.item.startsWith("compensation.speaker")) throw new RuleError("ค่าวิทยากรตัดงบอัตโนมัติจากรอบเบิกที่อนุมัติแล้ว — ไม่ต้องบันทึกเอง");
  if (!allocationsForCohort(db, cohortId).some((a) => a.id === input.allocationId)) throw new RuleError("แหล่งเงินนี้ใช้กับรุ่นนี้ไม่ได้ — เลือกการจัดสรรของปีงบเดียวกัน");
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const before = cohortBudget(t, cohortId).status;
    const row = tx.insert(schema.budgetExpenses).values({ cohortId, allocationId: input.allocationId, kind: "expense", item: input.item, date: input.date, description: input.description.trim(), amountSatang: input.amountSatang, docNo: input.docNo?.trim() || null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
    const after = cohortBudget(t, cohortId).status;
    const a = after.allocations.find((x) => x.allocationId === input.allocationId)!;
    const reds = a.categories.filter((c) => c.level === "red" && c.over > 0 && !c.confirmed);
    const wasRed = (c: string) => before.allocations.find((x) => x.allocationId === input.allocationId)?.categories.find((y) => y.category === c && y.level === "red" && !y.confirmed && y.over > 0);
    const newReds = reds.filter((c) => c.category === cat || !wasRed(c.category));
    if (newReds.length) {
      const what = newReds.map((c) => `${BUDGET_CATEGORIES[c.category]} เกิน ${(c.over / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`).join(", ");
      if (!actor.canConfirm) throw new RuleError(`ใช้เกินงบ (${a.flexible ? "เกินยอดรวมของแหล่งเงิน" : "แหล่งเงินนี้ห้ามถัว"}): ${what} — ต้องได้รับการยืนยันจากผู้ดูแลระบบก่อน`, undefined, "overrun");
      if (!actor.confirmNote?.trim()) throw new RuleError(`ใช้เกินงบ: ${what} — ใส่เหตุผลแล้วกดยืนยันเพื่อบันทึก`, undefined, "overrun");
      for (const c of newReds) tx.insert(schema.budgetOverrunAcks).values({ cohortId, allocationId: input.allocationId, category: c.category, overSatang: c.over, note: actor.confirmNote.trim(), viaDelegationId: actor.delegationId ?? null, createdBy: actor.userId }).run();
    }
    writeAudit(tx, { userId: actor.userId, action: "create", entity: "budget_expense", entityId: row.id, after: { cohortId, ...input }, note: newReds.length ? `ยืนยันใช้เกินงบ: ${actor.confirmNote}` : null, ip: actor.ip });
    return { id: row.id, confirmedOverrun: newReds.length > 0 };
  });
}

/** คืนเงินเหลือ — ไม่เกินยอดคงเหลือของแหล่งเงินนั้นในรุ่น */
export function recordRefund(db: DB, cohortId: number, input: { allocationId: number; date: string; amountSatang: number; description?: string | null; docNo?: string | null }, actor: Actor) {
  money(input.amountSatang, "จำนวนเงินที่คืน");
  if (input.amountSatang <= 0) throw new RuleError("จำนวนเงินที่คืนต้องมากกว่า 0");
  if (!isValidISODate(input.date)) throw new RuleError("วันที่ไม่ถูกต้อง");
  const a = cohortBudget(db, cohortId).status.allocations.find((x) => x.allocationId === input.allocationId);
  if (!a) throw new RuleError("รุ่นนี้ไม่มีงบจากแหล่งเงินนี้");
  if (input.amountSatang > a.remaining) throw new RuleError(`คืนได้ไม่เกินยอดคงเหลือ ${(Math.max(0, a.remaining) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท`);
  const row = db.insert(schema.budgetExpenses).values({ cohortId, allocationId: input.allocationId, kind: "refund", item: null, date: input.date, description: input.description?.trim() || "คืนเงินเหลือ", amountSatang: input.amountSatang, docNo: input.docNo?.trim() || null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "budget_refund", entityId: row.id, after: { cohortId, ...input }, ip: actor.ip });
  return row;
}

export function deleteExpense(db: DB, cohortId: number, id: number, actor: Actor) {
  const prev = db.select().from(schema.budgetExpenses).where(and(eq(schema.budgetExpenses.id, id), eq(schema.budgetExpenses.cohortId, cohortId), isNull(schema.budgetExpenses.deletedAt))).get();
  if (!prev) throw new RuleError("ไม่พบรายการ");
  db.update(schema.budgetExpenses).set({ deletedAt: new Date(), deletedBy: actor.userId }).where(eq(schema.budgetExpenses.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "delete", entity: "budget_expense", entityId: id, before: prev, ip: actor.ip });
}

/** หัวหน้า/รองยืนยันการใช้เกินงบหมวด (ล่วงหน้าหรือย้อนหลัง เช่น ค่าวิทยากรที่อนุมัติแล้วเกินงบ) */
export function confirmOverrun(db: DB, cohortId: number, allocationId: number, category: BudgetCategory, note: string, actor: Actor & { delegationId?: number | null; extraSatang?: number }) {
  if (!note?.trim()) throw new RuleError("กรุณาระบุเหตุผลที่ยืนยันใช้เกินงบ");
  const st = cohortBudget(db, cohortId).status.allocations.find((a) => a.allocationId === allocationId)?.categories.find((c) => c.category === category);
  const over = (st?.over ?? 0) + (actor.extraSatang ?? 0);
  if (over <= 0) throw new RuleError("หมวดนี้ยังไม่เกินงบ — ไม่ต้องยืนยัน (ยืนยันล่วงหน้าให้ระบุยอดที่จะเกิน)");
  db.insert(schema.budgetOverrunAcks).values({ cohortId, allocationId, category, overSatang: over, note: note.trim(), viaDelegationId: actor.delegationId ?? null, createdBy: actor.userId }).run();
  writeAudit(db, { userId: actor.userId, action: "budget.confirm_overrun", entity: "cohort", entityId: cohortId, after: { allocationId, category, over }, note: note.trim(), ip: actor.ip });
}

// ───────── รายงาน (13.4) ─────────

/** ตามแบบกรมฯ: แยกหมวด ได้รับ / ใช้ครั้งนี้ (รุ่นนี้) / สะสม (ทุกรุ่นของแหล่งเงินนี้ถึงรุ่นนี้) / คงเหลือ */
export function cohortReport(db: DB, cohortId: number) {
  const me = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get()!;
  const mine = cohortBudget(db, cohortId);
  return mine.status.allocations.map((a) => {
    const alloc = mine.allocations.find((x) => x.id === a.allocationId)!;
    // รุ่นอื่นที่ใช้แหล่งเงินนี้ และเริ่มก่อน/พร้อมรุ่นนี้
    const others = db.select({ c: schema.cohorts }).from(schema.budgetLines).innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.budgetLines.cohortId))
      .where(and(eq(schema.budgetLines.allocationId, a.allocationId), isNull(schema.budgetLines.deletedAt), ne(schema.cohorts.id, cohortId))).all()
      .map((r) => r.c).filter((c, i, arr) => arr.findIndex((x) => x.id === c.id) === i && c.startDate <= me.startDate);
    const prior = others.map((c) => cohortBudget(db, c.id).status.allocations.find((x) => x.allocationId === a.allocationId)!);
    return {
      allocation: alloc,
      rows: a.categories.map((c) => {
        const before = prior.reduce((s, p) => s + (p?.categories.find((x) => x.category === c.category)?.spent ?? 0), 0);
        return { category: c.category, budget: c.budget, thisTime: c.spent, cumulative: before + c.spent, remaining: c.budget - c.spent };
      }),
      received: alloc.amountSatang,
      cumulativeAll: prior.reduce((s, p) => s + (p?.spent ?? 0), 0) + a.spent,
    };
  });
}

/** สรุปปีงบ: ต่อการจัดสรร (ได้รับ แบ่งให้รุ่น ใช้จริง คืน คงเหลือ) + ต่อรุ่น (งบต่อหัว, % ประหยัด) */
export function fiscalSummary(db: DB, fiscalYear: number) {
  const allocs = listAllocations(db, fiscalYear);
  const cohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(eq(schema.cohorts.fiscalYear, fiscalYear), isNull(schema.cohorts.deletedAt))).orderBy(asc(schema.cohorts.startDate)).all();
  const perCohort = cohorts.map(({ c, course }) => {
    const b = cohortBudget(db, c.id);
    const people = db.select({ n: sql<number>`count(*)` }).from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, c.id), ne(schema.enrollments.status, "draft"))).get()?.n ?? 0;
    const budget = b.status.allocations.reduce((s, a) => s + a.budget, 0);
    const spent = b.status.allocations.reduce((s, a) => s + a.spent, 0) + b.status.unbudgetedCompensation;
    const refunded = b.status.allocations.reduce((s, a) => s + a.refunded, 0);
    return {
      cohortId: c.id, courseId: course.id, courseCode: course.code, label: `${course.shortName} ${cohortLabel(c)}`, budget, spent, refunded, people,
      perHead: people ? Math.round(spent / people) : null, savingPct: budget ? Math.round(((budget - spent) / budget) * 1000) / 10 : null,
      status: b.status, needsConfirmation: b.needsConfirmation, byAllocation: b.status.allocations,
    };
  });
  const perAllocation = allocs.map((a) => {
    const spent = perCohort.reduce((s, c) => s + (c.byAllocation.find((x) => x.allocationId === a.id)?.spent ?? 0), 0);
    const refunded = perCohort.reduce((s, c) => s + (c.byAllocation.find((x) => x.allocationId === a.id)?.refunded ?? 0), 0);
    const dist = distributed(db, a.id);
    return { ...a, distributed: dist, undistributed: a.amountSatang - dist, spent, refunded, remaining: a.amountSatang - spent - refunded };
  });
  return { perAllocation, perCohort };
}

/** สำหรับสรุปใหญ่ค่าตอบแทน: งบค่าวิทยากรของรุ่น / เบิกครั้งนี้ / คงเหลือ (ยอดเดียวกับหน้างบ) */
export function compensationBudget(db: DB, cohortId: number) {
  const lines = db.select().from(schema.budgetLines).where(and(eq(schema.budgetLines.cohortId, cohortId), isNull(schema.budgetLines.deletedAt))).all();
  const budget = lines.filter((l) => l.item === "compensation.speaker_internal" || l.item === "compensation.speaker_external").reduce((s, l) => s + l.amountSatang, 0);
  const comp = approvedCompensation(db, cohortId);
  return { budget, approved: comp.internalSatang + comp.externalSatang, hasBudget: lines.length > 0 };
}
