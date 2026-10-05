"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { createBatch, approveBatch, unlockBatch, cancelBatch, setSessionSplit } from "@/lib/services/pay";
import { delegationNote } from "@/lib/services/delegation";
import { baht } from "@/lib/pay/calc";

const BatchZ = z.object({ cohortId: z.number().int(), dateFrom: z.string().max(10).nullable().optional(), dateTo: z.string().max(10).nullable().optional(), note: z.string().max(500).nullable().optional() });

export async function createBatchAction(input: z.input<typeof BatchZ>): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("pay.manage");
    const p = BatchZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลรอบเบิกไม่ถูกต้อง" };
    const b = createBatch(getDb(), p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/pay");
    return { ok: true, data: { id: b.id } };
  } catch (e) {
    return toError(e);
  }
}

/** อนุมัติ → ล็อกคาบ · ผู้รับมอบอำนาจอนุมัติได้ (audit "อนุมัติแทน ...") แต่อนุมัติยอดของตัวเองไม่ได้ */
export async function approveBatchAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("pay.approve");
    const via = auth.viaDelegation("pay.approve");
    const r = approveBatch(getDb(), id, { userId: auth.user.id, ip: await clientIp(), delegationId: via?.id ?? null, delegationNote: via ? delegationNote(via) : null });
    revalidatePath(`/pay/batches/${id}`);
    revalidatePath("/pay");
    return { ok: true, message: `อนุมัติแล้ว ${r.lines} รายการ รวม ${baht(r.total)} — ล็อก ${r.locked} คาบ` };
  } catch (e) {
    return toError(e);
  }
}

/** ปลดล็อก: หัวหน้า/รองเท่านั้น (ผู้รับมอบอำนาจทำไม่ได้) + เหตุผล */
export async function unlockBatchAction(id: number, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("pay.approve");
    unlockBatch(getDb(), id, String(reason ?? "").slice(0, 500), { userId: auth.user.id, isAdmin: auth.isAdmin, ip: await clientIp() });
    revalidatePath(`/pay/batches/${id}`);
    revalidatePath("/pay");
    return { ok: true, message: "ปลดล็อกแล้ว — รอบกลับเป็นร่าง แก้ข้อมูลแล้วอนุมัติใหม่" };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelBatchAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("pay.manage");
    cancelBatch(getDb(), id, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/pay");
    return { ok: true, message: "ยกเลิกรอบเบิกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const SplitZ = z.object({
  method: z.enum(["full", "equal", "ratio"]).nullable(),
  note: z.string().max(300).nullable().optional(),
  ratios: z.array(z.object({ staffId: z.number().int(), ratio: z.number() })).max(50).optional(),
});

/** แก้วิธีแบ่งเฉพาะคาบ (หัวหน้า/รอง) — สเปก 11.4 */
export async function setSessionSplitAction(cohortId: number, sessionId: number, input: z.input<typeof SplitZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    const p = SplitZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลวิธีแบ่งไม่ถูกต้อง" };
    setSessionSplit(getDb(), sessionId, p.data, { userId: auth.user.id, isAdmin: auth.isAdmin, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true, message: "บันทึกวิธีแบ่งแล้ว" };
  } catch (e) {
    return toError(e);
  }
}
