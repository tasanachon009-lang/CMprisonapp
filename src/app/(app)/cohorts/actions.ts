"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { createCohort, planTrainingDays } from "@/lib/services/cohorts";
import { confirmAdmissions } from "@/lib/services/registry";
import { getSetting } from "@/lib/bootstrap";
import { isValidISODate, formatThaiDate } from "@/lib/thai-date";
import { toError, type ActionResult } from "@/lib/action-result";
import { writeAudit } from "@/lib/audit";

/** ดูตัวอย่างวันอบรม (คำนวณวันสิ้นสุดข้ามวันหยุด) ก่อนสร้างรุ่น */
export async function previewCohortDates(courseId: number, startDate: string): Promise<ActionResult<{ days: string[]; endLabel: string }>> {
  try {
    await requireAction("course.manage");
    if (!isValidISODate(startDate)) return { ok: false, error: "กรุณาเลือกวันเริ่ม" };
    const db = getDb();
    const course = db.select().from(schema.courses).where(eq(schema.courses.id, courseId)).get();
    if (!course) return { ok: false, error: "ไม่พบหลักสูตร" };
    const days = planTrainingDays(db, course, startDate);
    return { ok: true, data: { days, endLabel: formatThaiDate(days[days.length - 1], "full") } };
  } catch (e) {
    return toError(e);
  }
}

const CreateSchema = z.object({
  courseId: z.coerce.number().int().positive(),
  number: z.coerce.number().int().positive().optional(),
  startDate: z.string().refine(isValidISODate, "กรุณาเลือกวันเริ่มให้ถูกต้อง"),
  targetCount: z.coerce.number().int().min(0).max(500).optional(),
  location: z.string().max(200).optional(),
  note: z.string().max(2000).optional(),
});

export async function createCohortAction(input: z.input<typeof CreateSchema>): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("course.manage");
    const parsed = CreateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const c = createCohort(getDb(), { ...parsed.data, location: parsed.data.location || null, note: parsed.data.note || null }, auth.user.id);
    revalidatePath("/courses");
    return { ok: true, data: { id: c.id } };
  } catch (e) {
    return toError(e);
  }
}

export async function confirmAdmissionsAction(cohortId: number, enrollmentIds: number[]): Promise<ActionResult<{ done: number; skipped: Array<{ id: number; reason: string }> }>> {
  try {
    const auth = await requireAction("registry.edit");
    const db = getDb();
    const r = confirmAdmissions(db, enrollmentIds, { userId: auth.user.id, canOverride: auth.can("registry.override_duplicate"), consentRequired: getSetting(db, "pdpa.consentRequired", true), ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}`);
    return { ok: true, data: { done: r.done.length, skipped: r.skipped } };
  } catch (e) {
    return toError(e);
  }
}

/** บันทึกหลักฐานความยินยอมย้อนหลัง (สำหรับผู้ที่ลงเป็นร่างไว้) */
export async function recordConsentAction(enrollmentId: number, consentDate: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("registry.edit");
    if (!isValidISODate(consentDate)) return { ok: false, error: "กรุณาใส่วันที่ลงนาม" };
    const db = getDb();
    const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollmentId)).get();
    if (!e) return { ok: false, error: "ไม่พบการลงทะเบียน" };
    db.update(schema.enrollments)
      .set({ consentSigned: true, consentDate, consentReceiverId: auth.user.id, consentRefused: false, updatedBy: auth.user.id, updatedAt: new Date(), version: e.version + 1 })
      .where(eq(schema.enrollments.id, enrollmentId))
      .run();
    writeAudit(db, { userId: auth.user.id, action: "update", entity: "enrollment", entityId: enrollmentId, before: { consentSigned: e.consentSigned }, after: { consentSigned: true, consentDate }, ip: await clientIp() });
    revalidatePath(`/cohorts/${e.cohortId}/roster`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
