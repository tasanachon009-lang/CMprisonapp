"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { RuleError } from "@/lib/errors";
import { isFastCohort } from "@/lib/services/fast-phase";
import { assign, saveTeamReview, type AssignKind } from "@/lib/services/tc-house";

const AssignSchema = z.object({
  enrollmentIds: z.array(z.number().int().positive()).min(1).max(200),
  kind: z.enum(["position", "team", "counselor", "mentor"]),
  value: z.string().min(1).max(100),
  date: z.string().max(10),
  reason: z.string().max(500).optional(),
});

/** กำหนด/เปลี่ยน ตำแหน่ง ทีมงาน ที่ปรึกษา พี่เลี้ยง (สเปก 16) — ตรวจสิทธิ์ tc.edit ที่เซิร์ฟเวอร์ */
export async function assignAction(cohortId: number, input: z.infer<typeof AssignSchema>): Promise<ActionResult<{ done: number; errors: string[] }>> {
  try {
    const auth = await requireAction("tc.edit");
    const p = AssignSchema.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    const db = getDb();
    if (!isFastCohort(db, cohortId)) throw new RuleError("รุ่นนี้ไม่ใช่หลักสูตรชุมชนบำบัด");
    const r = assign(db, { ...p.data, kind: p.data.kind as AssignKind }, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/tc`);
    return { ok: true, data: { done: r.done.length, errors: r.errors.map((e) => e.error) } };
  } catch (e) {
    return toError(e);
  }
}

export async function saveTeamReviewAction(cohortId: number, input: { team: string; weekStart: string; rating: string; note?: string }): Promise<ActionResult> {
  try {
    const auth = await requireAction("tc.edit");
    const p = z.object({ team: z.string().max(60), weekStart: z.string().max(10), rating: z.string().max(30), note: z.string().max(1000).optional() }).safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    saveTeamReview(getDb(), cohortId, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}/tc/teams`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
