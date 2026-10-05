"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { createDelegation, revokeDelegation } from "@/lib/services/delegation";

const Z = z.object({ toUserId: z.number().int(), scopes: z.array(z.string().max(20)).max(5), startDate: z.string().max(10), endDate: z.string().max(10), reason: z.string().max(300).nullable().optional() });

/** มอบอำนาจ: หัวหน้า/รองเท่านั้น (ตรวจบทบาทผู้ดูแลซ้ำในบริการ) */
export async function createDelegationAction(input: z.input<typeof Z>): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const p = Z.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลการมอบอำนาจไม่ถูกต้อง" };
    createDelegation(getDb(), p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/delegations");
    return { ok: true, message: "มอบอำนาจแล้ว — สิทธิ์จะคืนเองเมื่อพ้นวันสิ้นสุด" };
  } catch (e) {
    return toError(e);
  }
}

export async function revokeDelegationAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    revokeDelegation(getDb(), id, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/delegations");
    return { ok: true, message: "ยกเลิกการมอบอำนาจแล้ว" };
  } catch (e) {
    return toError(e);
  }
}
