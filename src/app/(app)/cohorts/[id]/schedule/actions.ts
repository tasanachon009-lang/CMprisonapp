"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { addStaff, removeStaff, setStaffRole } from "@/lib/services/schedule";
import { updateSession, addSession, cancelSession, replaceStaffInRange } from "@/lib/services/schedule-edit";
import { setDutyOfficer } from "@/lib/services/duty";

const StaffSchema = z.object({
  userId: z.number().int().positive().nullable().optional(),
  instructorId: z.number().int().positive().nullable().optional(),
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

const PatchZ = z.object({
  date: z.string().optional(), startTime: z.string().optional(), endTime: z.string().optional(), hours: z.number().optional(),
  location: z.string().max(200).nullable().optional(), title: z.string().max(300).optional(), topicId: z.number().int().nullable().optional(),
});

/** ย้าย/แก้คาบ — ทับซ้อน (วิทยากร/สถานที่) ได้ code "conflict" ให้หน้าจอถามยืนยัน */
export async function updateSessionAction(cohortId: number, sessionId: number, patch: z.input<typeof PatchZ>, acknowledge = false): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    const p = PatchZ.safeParse(patch);
    if (!p.success) return { ok: false, error: "ข้อมูลคาบไม่ถูกต้อง" };
    const r = updateSession(getDb(), sessionId, p.data, { userId: auth.user.id, ip: await clientIp() }, { acknowledge });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true, message: r.warnings.length ? `บันทึกแล้ว (มีความทับซ้อน ${r.warnings.length} รายการ — บันทึกไว้ในประวัติ)` : "บันทึกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const AddZ = z.object({ date: z.string(), startTime: z.string(), endTime: z.string(), hours: z.number(), title: z.string().max(300).optional(), topicId: z.number().int().nullable().optional(), location: z.string().max(200).nullable().optional(), takesAttendance: z.boolean().optional() });

export async function addSessionAction(cohortId: number, input: z.input<typeof AddZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    const p = AddZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลคาบไม่ถูกต้อง" };
    addSession(getDb(), cohortId, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true, message: "เพิ่มคาบแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelSessionAction(cohortId: number, sessionId: number, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    cancelSession(getDb(), sessionId, String(reason).slice(0, 500), { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    return { ok: true, message: "ยกเลิกคาบแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const PersonZ = z.object({ userId: z.number().int().positive().nullable().optional(), instructorId: z.number().int().positive().nullable().optional() });
const ReplaceZ = z.object({ from: PersonZ, to: PersonZ, dateFrom: z.string(), dateTo: z.string(), cohortId: z.number().int().positive().nullable().optional() });

/** เปลี่ยน ก. เป็น ข. ทุกคาบในช่วงวันที่ (รุ่นนี้ หรือทุกรุ่น) */
export async function replaceStaffAction(input: z.input<typeof ReplaceZ>): Promise<ActionResult<{ replaced: number; skipped: Array<{ title: string; date: string; reason: string }>; conflicts: string[] }>> {
  try {
    const auth = await requireAction("schedule.edit");
    const p = ReplaceZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ครบ — เลือกคนเดิม คนใหม่ และช่วงวันที่" };
    const r = replaceStaffInRange(getDb(), p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/cohorts");
    revalidatePath("/calendar");
    return { ok: true, data: r };
  } catch (e) {
    return toError(e);
  }
}
/** ผู้รับผิดชอบประจำวันของรุ่น (สเปก 22B) */
export async function setDutyAction(cohortId: number, date: string, userId: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    setDutyOfficer(getDb(), cohortId, date, userId, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/schedule`);
    revalidatePath("/");
    return { ok: true, message: "เปลี่ยนผู้รับผิดชอบประจำวันแล้ว" };
  } catch (e) {
    return toError(e);
  }
}