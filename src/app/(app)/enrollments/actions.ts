"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { saveAssessment } from "@/lib/services/assessments";
import { markTask, recordFollowup, completeEnrollments } from "@/lib/services/followup";
import { writeAudit } from "@/lib/audit";
import { isValidISODate, todayISO } from "@/lib/thai-date";

export async function saveAssessmentAction(input: { enrollmentId: number; formId: number; round: string; period?: string; assessedDate: string; answers: unknown; source?: string }, loadedVersion?: number): Promise<ActionResult<{ id: number; level: string | null; alerts: string[] }>> {
  try {
    const auth = await requireAction();
    if (!isValidISODate(input.assessedDate)) return { ok: false, error: "กรุณาใส่วันที่ประเมิน" };
    if (JSON.stringify(input.answers ?? null).length > 20000) return { ok: false, error: "ข้อมูลยาวเกินไป" };
    const r = saveAssessment(getDb(), input, { userId: auth.user.id, can: auth.can, ip: await clientIp() }, loadedVersion);
    revalidatePath(`/enrollments/${input.enrollmentId}`);
    return { ok: true, data: { id: r.id, level: r.result.level, alerts: r.result.alerts.map((a) => a.message) } };
  } catch (e) {
    return toError(e);
  }
}

/** โหมดกรอกเร็ว: บันทึกหลายคนพร้อมกัน — แถวที่ผิดจะแจ้งรายแถว แถวที่ถูกบันทึกไปแล้ว */
export async function saveAssessmentBatchAction(formId: number, round: string, assessedDate: string, rows: Array<{ enrollmentId: number; answers: Record<string, number> }>, fromKit: boolean): Promise<ActionResult<{ saved: number; errors: Array<{ enrollmentId: number; error: string }> }>> {
  try {
    const auth = await requireAction();
    if (!isValidISODate(assessedDate)) return { ok: false, error: "กรุณาใส่วันที่ประเมิน" };
    if (rows.length > 300) return { ok: false, error: "บันทึกได้ครั้งละไม่เกิน 300 คน" };
    const db = getDb();
    const ip = await clientIp();
    let saved = 0;
    const errors: Array<{ enrollmentId: number; error: string }> = [];
    for (const r of rows) {
      try {
        saveAssessment(db, { enrollmentId: r.enrollmentId, formId, round, assessedDate, answers: r.answers, source: fromKit ? "กรอกย้อนหลังจากชุดฉุกเฉิน" : "โหมดกรอกเร็ว" }, { userId: auth.user.id, can: auth.can, ip });
        saved++;
      } catch (e) {
        errors.push({ enrollmentId: r.enrollmentId, error: toError(e).error });
      }
    }
    revalidatePath("/cohorts");
    return { ok: true, data: { saved, errors } };
  } catch (e) {
    return toError(e);
  }
}

export async function completeEnrollmentsAction(cohortId: number, ids: number[], status: "completed" | "failed", date: string): Promise<ActionResult<{ done: number; skipped: Array<{ id: number; reason: string }> }>> {
  try {
    const auth = await requireAction("registry.edit");
    if (!isValidISODate(date)) return { ok: false, error: "กรุณาใส่วันที่จบหลักสูตร" };
    const r = completeEnrollments(getDb(), ids, status, date, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/cohorts/${cohortId}`);
    return { ok: true, data: { done: r.done.length, skipped: r.skipped } };
  } catch (e) {
    return toError(e);
  }
}

/** เกณฑ์รับเข้า (คะแนนคัดกรอง + ลักษณะต้องห้าม) กรอกภายหลังได้ */
export async function updateIntakeAction(enrollmentId: number, screeningScore: number | null, exclusions: string[]): Promise<ActionResult> {
  try {
    const auth = await requireAction("registry.edit");
    const db = getDb();
    const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, enrollmentId)).get();
    if (!e) return { ok: false, error: "ไม่พบการลงทะเบียน" };
    if (screeningScore != null && (screeningScore < 0 || screeningScore > 100)) return { ok: false, error: "คะแนนคัดกรองไม่ถูกต้อง" };
    const intake = { ...((e.intake as Record<string, unknown>) ?? {}), exclusions };
    db.update(schema.enrollments).set({ screeningScore, intake, updatedBy: auth.user.id, updatedAt: new Date(), version: e.version + 1 }).where(eq(schema.enrollments.id, enrollmentId)).run();
    writeAudit(db, { userId: auth.user.id, action: "update", entity: "enrollment", entityId: enrollmentId, before: { screeningScore: e.screeningScore, intake: e.intake }, after: { screeningScore, intake }, ip: await clientIp() });
    revalidatePath(`/enrollments/${enrollmentId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function markTaskAction(taskId: number, done: boolean, date?: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("bst.edit");
    markTask(getDb(), taskId, done ? date || todayISO() : null, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/bst");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const FollowSchema = z.object({
  doneDate: z.string().refine(isValidISODate, "กรุณาใส่วันที่ติดตาม"),
  method: z.enum(["phone", "visit", "referral"], { error: "กรุณาเลือกวิธีติดตาม" }),
  urineResult: z.string().max(50).nullable().optional(),
  relapse: z.enum(["yes", "no", "unknown"], { error: "กรุณาเลือกผลการกลับไปเสพซ้ำ" }),
  occupation: z.string().max(100).nullable().optional(),
  note: z.string().max(1000).nullable().optional(),
  bstRecorded: z.boolean(),
});

export async function recordFollowupAction(followupId: number, input: z.input<typeof FollowSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("bst.edit");
    const parsed = FollowSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    recordFollowup(getDb(), followupId, parsed.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/bst");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function setExternalIdAction(enrollmentId: number, system: "bst" | "rt101", externalId: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("bst.edit");
    const v = externalId.trim();
    if (!v) return { ok: false, error: "กรุณาใส่เลขประจำตัวในระบบ" };
    getDb()
      .insert(schema.externalIds)
      .values({ enrollmentId, system, externalId: v, createdBy: auth.user.id, updatedBy: auth.user.id })
      .onConflictDoUpdate({ target: [schema.externalIds.enrollmentId, schema.externalIds.system], set: { externalId: v, updatedBy: auth.user.id, updatedAt: new Date() } })
      .run();
    writeAudit(getDb(), { userId: auth.user.id, action: "update", entity: "external_id", entityId: enrollmentId, after: { system, externalId: v }, ip: await clientIp() });
    revalidatePath(`/enrollments/${enrollmentId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const NoteSchema = z.object({
  noteDate: z.string().refine(isValidISODate, "กรุณาใส่วันที่"),
  kind: z.enum(["medical", "mental"]),
  screeningResult: z.string().max(2000).nullable().optional(),
  opinion: z.string().max(4000).nullable().optional(),
  recommendation: z.string().max(4000).nullable().optional(),
  referral: z.boolean(),
  referralDetail: z.string().max(1000).nullable().optional(),
});

/** ความเห็นสถานพยาบาล (ข้อมูลอ่อนไหว) */
export async function addMedicalNoteAction(enrollmentId: number, input: z.input<typeof NoteSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("health.edit", "health.mental_edit");
    const parsed = NoteSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    if (parsed.data.kind === "medical" && !auth.can("health.edit")) return { ok: false, error: "ความเห็นด้านสุขภาพกาย บันทึกได้เฉพาะพยาบาล/สถานพยาบาล" };
    if (!parsed.data.opinion?.trim() && !parsed.data.screeningResult?.trim()) return { ok: false, error: "กรุณาใส่ผลคัดกรองหรือความเห็นอย่างน้อย 1 ช่อง" };
    const db = getDb();
    const id = db.insert(schema.medicalNotes).values({ enrollmentId, ...parsed.data, referralStatus: parsed.data.referral ? "pending" : null, createdBy: auth.user.id, updatedBy: auth.user.id }).returning().get().id;
    writeAudit(db, { userId: auth.user.id, action: "create", entity: "medical_note", entityId: id, ip: await clientIp() });
    revalidatePath(`/enrollments/${enrollmentId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const BehaviorSchema = z.object({
  incarcerationId: z.number().int(),
  enrollmentId: z.number().int().nullable(),
  noteDate: z.string().refine(isValidISODate, "กรุณาใส่วันที่"),
  tone: z.enum(["positive", "negative", "observe"]),
  category: z.string().max(40).nullable(),
  text: z.string().trim().min(1, "กรุณาพิมพ์ข้อความ").max(1000),
});

/** บันทึกพฤติกรรมด่วน (สเปก 22B) */
export async function addBehaviorNoteAction(input: z.input<typeof BehaviorSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("behavior.edit");
    const parsed = BehaviorSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const db = getDb();
    const inc = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, parsed.data.incarcerationId)).get();
    if (!inc) return { ok: false, error: "ไม่พบผู้ต้องขัง" };
    const id = db.insert(schema.behaviorNotes).values({ ...parsed.data, createdBy: auth.user.id, updatedBy: auth.user.id }).returning().get().id;
    writeAudit(db, { userId: auth.user.id, action: "create", entity: "behavior_note", entityId: id, personId: inc.personId, after: { tone: parsed.data.tone, category: parsed.data.category }, ip: await clientIp() });
    revalidatePath(`/persons/${inc.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const ContactSchema = z.object({
  personId: z.number().int(),
  kind: z.enum(["relative", "address_after_release", "health_unit"]),
  name: z.string().max(200).nullable(),
  relation: z.string().max(100).nullable(),
  phone: z.string().max(50).nullable(),
  address: z.string().max(500).nullable(),
  note: z.string().max(500).nullable(),
});

/** ญาติ/ผู้ติดต่อ ที่อยู่หลังปล่อย หน่วยบริการใกล้บ้าน (สเปก 7.5) */
export async function saveContactAction(id: number | null, input: z.input<typeof ContactSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("contacts.edit");
    const parsed = ContactSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    if (!parsed.data.name && !parsed.data.address && !parsed.data.phone) return { ok: false, error: "กรุณาใส่ชื่อ เบอร์ หรือที่อยู่อย่างน้อย 1 ช่อง" };
    const db = getDb();
    if (id) {
      const before = db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).get();
      db.update(schema.contacts).set({ ...parsed.data, updatedBy: auth.user.id, updatedAt: new Date() }).where(eq(schema.contacts.id, id)).run();
      writeAudit(db, { userId: auth.user.id, action: "update", entity: "contact", entityId: id, personId: parsed.data.personId, before, after: parsed.data, ip: await clientIp() });
    } else {
      const nid = db.insert(schema.contacts).values({ ...parsed.data, createdBy: auth.user.id, updatedBy: auth.user.id }).returning().get().id;
      writeAudit(db, { userId: auth.user.id, action: "create", entity: "contact", entityId: nid, personId: parsed.data.personId, ip: await clientIp() });
    }
    revalidatePath(`/persons/${parsed.data.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteContactAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("contacts.edit");
    const db = getDb();
    const c = db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).get();
    if (!c) return { ok: false, error: "ไม่พบรายการ" };
    db.update(schema.contacts).set({ deletedAt: new Date(), deletedBy: auth.user.id }).where(eq(schema.contacts.id, id)).run();
    writeAudit(db, { userId: auth.user.id, action: "delete", entity: "contact", entityId: id, personId: c.personId, ip: await clientIp() });
    revalidatePath(`/persons/${c.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function restoreContactAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("contacts.edit");
    const db = getDb();
    const c = db.select().from(schema.contacts).where(eq(schema.contacts.id, id)).get();
    if (!c) return { ok: false, error: "ไม่พบรายการ" };
    db.update(schema.contacts).set({ deletedAt: null, deletedBy: null, updatedBy: auth.user.id }).where(eq(schema.contacts.id, id)).run();
    writeAudit(db, { userId: auth.user.id, action: "restore", entity: "contact", entityId: id, personId: c.personId, ip: await clientIp() });
    revalidatePath(`/persons/${c.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

