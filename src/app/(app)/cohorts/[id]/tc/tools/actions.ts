"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { RuleError } from "@/lib/errors";
import { isFastCohort } from "@/lib/services/fast-phase";
import { createRecord, closeRecord, deleteRecord, suggestNextTool, type RecordKind } from "@/lib/services/tc-tools";

const RecordSchema = z.object({
  enrollmentId: z.number().int().positive(),
  kind: z.enum(["tool", "cardinal", "violation", "reward"]),
  code: z.string().min(1).max(60),
  recordDate: z.string().max(10),
  behavior: z.string().max(2000),
  topic: z.string().max(60).nullish(),
  level: z.string().max(20).nullish(),
  observer: z.string().max(200).nullish(),
  startDate: z.string().max(10).nullish(),
  endDate: z.string().max(10).nullish(),
  haircut: z.object({ requester: z.string().max(100).nullish(), when: z.string().max(200).nullish(), advisers: z.array(z.string().max(100)).max(6).optional() }).nullish(),
  sourceNoteId: z.number().int().positive().nullish(),
});

/** เครื่องมือบ้าน / กฎ 5 ข้อ / วินัย / รางวัล (สเปก 16) — ทุก action ตรวจสิทธิ์ tc.edit ที่เซิร์ฟเวอร์ */
async function ctx(cohortId: number) {
  const auth = await requireAction("tc.edit");
  const db = getDb();
  if (!isFastCohort(db, cohortId)) throw new RuleError("รุ่นนี้ไม่ใช่หลักสูตรชุมชนบำบัด");
  return { db, actor: { userId: auth.user.id, ip: await clientIp() } };
}

export async function createRecordAction(cohortId: number, input: z.infer<typeof RecordSchema>): Promise<ActionResult> {
  try {
    const { db, actor } = await ctx(cohortId);
    const p = RecordSchema.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    createRecord(db, { ...p.data, kind: p.data.kind as RecordKind }, actor);
    revalidatePath(`/cohorts/${cohortId}/tc/tools`);
    return { ok: true };
  } catch (e) { return toError(e); }
}

export async function closeRecordAction(cohortId: number, id: number, input: { date: string; outcome: string }): Promise<ActionResult> {
  try {
    const { db, actor } = await ctx(cohortId);
    closeRecord(db, id, { date: String(input.date).slice(0, 10), outcome: String(input.outcome).slice(0, 1000) }, actor);
    revalidatePath(`/cohorts/${cohortId}/tc/tools`);
    return { ok: true };
  } catch (e) { return toError(e); }
}

export async function deleteRecordAction(cohortId: number, id: number, reason: string): Promise<ActionResult> {
  try {
    const { db, actor } = await ctx(cohortId);
    deleteRecord(db, id, String(reason ?? "").slice(0, 500), actor);
    revalidatePath(`/cohorts/${cohortId}/tc/tools`);
    return { ok: true };
  } catch (e) { return toError(e); }
}

/** แนะนำเครื่องมือขั้นถัดไปเมื่อผิดซ้ำเรื่องเดิม */
export async function suggestToolAction(cohortId: number, enrollmentId: number, topic: string): Promise<ActionResult<{ code: string; repeat: number }>> {
  try {
    const { db } = await ctx(cohortId);
    return { ok: true, data: suggestNextTool(db, enrollmentId, String(topic).slice(0, 60)) };
  } catch (e) { return toError(e); }
}
