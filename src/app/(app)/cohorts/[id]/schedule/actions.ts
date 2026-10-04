"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { addStaff, removeStaff, setStaffRole } from "@/lib/services/schedule";

const StaffSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  externalName: z.string().max(200).nullable().optional(),
  role: z.enum(["lead", "co"]).nullable().optional(),
});

/** เพิ่มวิทยากรในคาบ — ชนเวลาจะได้ code "conflict" ให้หน้าจอถามยืนยัน */
export async function addStaffAction(cohortId: number, sessionId: number, input: z.input<typeof StaffSchema>, acknowledgeConflict = false): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    const parsed = StaffSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const r = addStaff(getDb(), sessionId, parsed.data, { userId: auth.user.id, ip: await clientIp() }, { acknowledgeConflict });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true, message: r.conflicts.length ? `เพิ่มแล้ว (ชนเวลา ${r.conflicts.length} คาบ — บันทึกไว้ในประวัติ)` : "เพิ่มแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function removeStaffAction(cohortId: number, staffId: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    removeStaff(getDb(), staffId, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function setStaffRoleAction(cohortId: number, staffId: number, role: "lead" | "co" | null): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    if (role !== null && role !== "lead" && role !== "co") return { ok: false, error: "บทบาทไม่ถูกต้อง" };
    setStaffRole(getDb(), staffId, role, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
