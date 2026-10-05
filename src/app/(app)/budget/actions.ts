"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import {
  parseBaht, saveAllocation, deleteAllocation, saveLine, deleteLine, applyCourseTemplate, copyLinesFrom,
  recordExpense, recordRefund, deleteExpense, confirmOverrun,
} from "@/lib/services/budget";
import { BUDGET_CATEGORIES, type BudgetCategory } from "@/lib/budget/calc";

/**
 * งบประมาณ (สเปก 13) — จำนวนเงินรับเป็นข้อความ "1,500.50" แล้วแปลงเป็นสตางค์ (จำนวนเต็ม) โดยไม่ผ่านทศนิยมลอยตัว
 * สิทธิ์: จัดสรร/ตั้งงบรุ่น = budget.manage (หัวหน้า/รอง) · บันทึกจ่ายจริง/คืนเงิน = budget.spend (การเงิน + หัวหน้า/รอง)
 * ยืนยันใช้เกินงบ = budget.approve (หัวหน้า/รอง หรือผู้รับมอบอำนาจขอบเขตงบประมาณ) · ผู้บริหารดูอย่างเดียว
 */
const revalidate = (cohortId?: number) => { revalidatePath("/budget"); if (cohortId) revalidatePath(`/cohorts/${cohortId}/budget`); };

const AllocZ = z.object({
  fiscalYear: z.number().int(), source: z.string().max(40), docNo: z.string().max(100).nullable().optional(), docDate: z.string().max(10).nullable().optional(),
  subject: z.string().max(300), courseId: z.number().int().nullable().optional(), amount: z.string().max(20), targetPeople: z.number().int().nullable().optional(),
  targetCohorts: z.number().int().nullable().optional(), flexible: z.boolean(), note: z.string().max(500).nullable().optional(),
});

export async function saveAllocationAction(id: number | null, input: z.input<typeof AllocZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    const p = AllocZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลการจัดสรรไม่ถูกต้อง" };
    const { amount, ...rest } = p.data;
    saveAllocation(getDb(), id, { ...rest, amountSatang: parseBaht(amount) }, { userId: auth.user.id, ip: await clientIp() });
    revalidate();
    return { ok: true, message: "บันทึกการจัดสรรแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteAllocationAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    deleteAllocation(getDb(), id, { userId: auth.user.id, ip: await clientIp() });
    revalidate();
    return { ok: true, message: "ลบการจัดสรรแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const FactorZ = z.object({ qty: z.number().min(0).max(100000), unit: z.string().max(20) });
const LineZ = z.object({ allocationId: z.number().int(), item: z.string().max(60), label: z.string().max(200).nullable().optional(), unit: z.string().max(20), factors: z.array(FactorZ).min(1).max(4) });

export async function saveLineAction(cohortId: number, id: number | null, input: z.input<typeof LineZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    const p = LineZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลรายการงบไม่ถูกต้อง — ตรวจจำนวนในสูตร (0–100,000)" };
    const { unit, ...rest } = p.data;
    saveLine(getDb(), cohortId, id, { ...rest, unitSatang: parseBaht(unit) }, { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: "บันทึกรายการงบแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteLineAction(cohortId: number, id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    deleteLine(getDb(), cohortId, id, { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: "ลบรายการงบแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function applyTemplateAction(cohortId: number, allocationId: number, people: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    const r = applyCourseTemplate(getDb(), cohortId, allocationId, Math.trunc(Number(people)), { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: `เพิ่มจากแม่แบบ ${r.added} รายการ รวม ${(r.totalSatang / 100).toLocaleString("th-TH")} บาท` };
  } catch (e) {
    return toError(e);
  }
}

export async function copyLinesAction(cohortId: number, fromCohortId: number, allocationId: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.manage");
    const n = copyLinesFrom(getDb(), cohortId, fromCohortId, allocationId, { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: `คัดลอกแล้ว ${n} รายการ` };
  } catch (e) {
    return toError(e);
  }
}

const ExpZ = z.object({ allocationId: z.number().int(), item: z.string().max(60), date: z.string().max(10), description: z.string().max(300), amount: z.string().max(20), docNo: z.string().max(100).nullable().optional() });

/** บันทึกจ่ายจริง: เกินงบหมวดห้ามถัว → code "overrun" ให้หน้าจอถามเหตุผลยืนยัน (เฉพาะผู้มีสิทธิ์ยืนยัน) */
export async function recordExpenseAction(cohortId: number, input: z.input<typeof ExpZ>, confirmNote?: string | null): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.spend");
    const p = ExpZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลรายการใช้จ่ายไม่ถูกต้อง" };
    const via = auth.viaDelegation("budget.approve");
    const { amount, ...rest } = p.data;
    const r = recordExpense(getDb(), cohortId, { ...rest, amountSatang: parseBaht(amount) }, {
      userId: auth.user.id, ip: await clientIp(), canConfirm: auth.can("budget.approve"), confirmNote: confirmNote?.slice(0, 300) ?? null, delegationId: via?.id ?? null,
    });
    revalidate(cohortId);
    return { ok: true, message: r.confirmedOverrun ? "บันทึกแล้ว (ยืนยันใช้เกินงบ — บันทึกเหตุผลในประวัติ)" : "บันทึกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const RefundZ = z.object({ allocationId: z.number().int(), date: z.string().max(10), amount: z.string().max(20), description: z.string().max(300).nullable().optional(), docNo: z.string().max(100).nullable().optional() });

export async function recordRefundAction(cohortId: number, input: z.input<typeof RefundZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.spend");
    const p = RefundZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลการคืนเงินไม่ถูกต้อง" };
    const { amount, ...rest } = p.data;
    recordRefund(getDb(), cohortId, { ...rest, amountSatang: parseBaht(amount) }, { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: "บันทึกคืนเงินเหลือแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteExpenseAction(cohortId: number, id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.spend");
    deleteExpense(getDb(), cohortId, id, { userId: auth.user.id, ip: await clientIp() });
    revalidate(cohortId);
    return { ok: true, message: "ลบรายการแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

/** ยืนยันใช้เกินงบ (หัวหน้า/รอง/ผู้รับมอบอำนาจ) — extra = ยืนยันล่วงหน้าเพิ่มจากยอดที่เกินอยู่ */
export async function confirmOverrunAction(cohortId: number, allocationId: number, category: string, note: string, extra?: string | null): Promise<ActionResult> {
  try {
    const auth = await requireAction("budget.approve");
    if (!(category in BUDGET_CATEGORIES)) return { ok: false, error: "หมวดงบไม่ถูกต้อง" };
    const via = auth.viaDelegation("budget.approve");
    confirmOverrun(getDb(), cohortId, allocationId, category as BudgetCategory, String(note ?? "").slice(0, 300), { userId: auth.user.id, ip: await clientIp(), delegationId: via?.id ?? null, extraSatang: extra ? parseBaht(extra) : 0 });
    revalidate(cohortId);
    return { ok: true, message: "ยืนยันแล้ว" };
  } catch (e) {
    return toError(e);
  }
}
