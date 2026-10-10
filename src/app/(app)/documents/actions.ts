"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { createDocument, updateDocument, setDocumentStatus, deleteDocument, getDocument, saveTemplate, resetTemplate } from "@/lib/services/documents";

const actorOf = async (auth: { user: { id: number } }) => ({ userId: auth.user.id, ip: await clientIp() });
const refresh = (cohortId: number | null | undefined, id?: number) => {
  if (cohortId) revalidatePath(`/cohorts/${cohortId}/documents`);
  if (id) revalidatePath(`/documents/${id}`);
};

/** สร้างร่างเอกสารของรุ่นจากแม่แบบ (สเปก 18.4) */
export async function createDocumentAction(cohortId: number, templateCode: string): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("docs.manage");
    const d = createDocument(getDb(), Number(cohortId), String(templateCode).slice(0, 60), await actorOf(auth));
    refresh(d.cohortId);
    return { ok: true, data: { id: d.id } };
  } catch (e) {
    return toError(e);
  }
}

const EditSchema = z.object({
  docNo: z.string().max(200).nullish(),
  docDate: z.string().max(10).nullish(),
  subject: z.string().max(1000),
  toLine: z.string().max(1000),
  refs: z.string().max(4000).nullish(),
  attachments: z.string().max(4000).nullish(),
  body: z.string().max(40000),
  signerName: z.string().max(400).nullish(),
  signerTitle: z.string().max(600).nullish(),
});

export async function updateDocumentAction(id: number, input: z.input<typeof EditSchema>, loadedVersion?: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("docs.manage");
    const parsed = EditSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "ข้อมูลไม่ถูกต้องหรือยาวเกินไป — ตรวจช่องที่กรอกแล้วลองใหม่" };
    const db = getDb();
    updateDocument(db, Number(id), parsed.data, await actorOf(auth), loadedVersion);
    refresh(getDocument(db, Number(id))?.cohortId, Number(id));
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function setDocumentStatusAction(id: number, status: "draft" | "final"): Promise<ActionResult> {
  try {
    const auth = await requireAction("docs.manage");
    if (status !== "draft" && status !== "final") return { ok: false, error: "สถานะไม่ถูกต้อง — รีเฟรชหน้าแล้วลองใหม่" };
    const db = getDb();
    setDocumentStatus(db, Number(id), status, await actorOf(auth));
    refresh(getDocument(db, Number(id))?.cohortId, Number(id));
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteDocumentAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("docs.manage");
    const db = getDb();
    const cohortId = getDocument(db, Number(id))?.cohortId;
    deleteDocument(db, Number(id), await actorOf(auth));
    refresh(cohortId);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const TemplateSchema = z.object({ subject: z.string().max(1000), toLine: z.string().max(1000), body: z.string().max(40000) });

export async function saveTemplateAction(code: string, input: z.input<typeof TemplateSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("docs.templates");
    const parsed = TemplateSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: "ข้อความยาวเกินไป — ย่อให้สั้นลงแล้วลองใหม่" };
    saveTemplate(getDb(), String(code).slice(0, 60), parsed.data, await actorOf(auth));
    revalidatePath("/admin/doc-templates");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function resetTemplateAction(code: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("docs.templates");
    resetTemplate(getDb(), String(code).slice(0, 60), await actorOf(auth));
    revalidatePath("/admin/doc-templates");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
