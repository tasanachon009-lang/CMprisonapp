"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { RuleError } from "@/lib/errors";
import { advancePhase, revertPhase, isFastCohort } from "@/lib/services/fast-phase";

const AdvanceSchema = z.object({
  enrollmentIds: z.array(z.number().int().positive()).min(1).max(200),
  toPhase: z.string().max(20),
  date: z.string().max(10),
  note: z.string().max(1000),
});

/** อนุมัติเลื่อนระยะ (สเปก 16) — เฉพาะผู้มีสิทธิ์อนุมัติ (หัวหน้า/รอง) */
export async function advancePhaseAction(cohortId: number, input: z.infer<typeof AdvanceSchema>): Promise<ActionResult<{ done: number; errors: string[] }>> {
  try {
    const auth = await requireAction("tc.approve");
    const parsed = AdvanceSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
    const db = getDb();
    if (!isFastCohort(db, cohortId)) throw new RuleError("รุ่นนี้ไม่ใช่หลักสูตรชุมชนบำบัด");
    const r = advancePhase(db, parsed.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}`);
    return { ok: true, data: { done: r.done.length, errors: r.errors.map((e) => e.error) } };
  } catch (e) {
    return toError(e);
  }
}

export async function revertPhaseAction(cohortId: number, enrollmentId: number, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("tc.approve");
    const db = getDb();
    if (!isFastCohort(db, cohortId)) throw new RuleError("รุ่นนี้ไม่ใช่หลักสูตรชุมชนบำบัด");
    revertPhase(db, enrollmentId, String(reason ?? "").slice(0, 500), { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
