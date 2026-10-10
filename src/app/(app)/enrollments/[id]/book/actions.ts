"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { saveGeneral, saveMonthlyNote, addCounselorOpinion, updateCounselorOpinion, deleteCounselorOpinion } from "@/lib/services/member-book";

const Text = z.string().max(6000);
const DateZ = z.string().max(10);

/** สมุดบันทึกความก้าวหน้า (สเปก 16A) — ทุก action ตรวจสิทธิ์ tc.edit ที่เซิร์ฟเวอร์ */
async function actor() {
  const auth = await requireAction("tc.edit");
  return { userId: auth.user.id, isAdmin: auth.isAdmin, ip: await clientIp() };
}
const done = (enrollmentId: number): ActionResult => { revalidatePath(`/enrollments/${enrollmentId}/book`); return { ok: true }; };

export async function saveGeneralAction(enrollmentId: number, input: { housingBefore: string; familyBond: string }, loadedVersion: number): Promise<ActionResult> {
  try {
    const a = await actor();
    const p = z.object({ housingBefore: Text, familyBond: Text }).safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อความยาวเกินกำหนด กรุณาย่อข้อความ" };
    saveGeneral(getDb(), enrollmentId, p.data, a, loadedVersion || undefined);
    return done(enrollmentId);
  } catch (e) { return toError(e); }
}

export async function saveMonthlyNoteAction(enrollmentId: number, input: { period: string; text: string; noteDate: string }, loadedVersion?: number): Promise<ActionResult> {
  try {
    const a = await actor();
    const p = z.object({ period: z.string().max(7), text: Text, noteDate: DateZ }).safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    saveMonthlyNote(getDb(), enrollmentId, p.data, a, loadedVersion);
    return done(enrollmentId);
  } catch (e) { return toError(e); }
}

export async function addOpinionAction(enrollmentId: number, input: { text: string; noteDate: string }): Promise<ActionResult> {
  try {
    const a = await actor();
    const p = z.object({ text: Text, noteDate: DateZ }).safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    addCounselorOpinion(getDb(), enrollmentId, p.data, a);
    return done(enrollmentId);
  } catch (e) { return toError(e); }
}

export async function updateOpinionAction(enrollmentId: number, noteId: number, input: { text: string; noteDate: string }): Promise<ActionResult> {
  try {
    const a = await actor();
    const p = z.object({ text: Text, noteDate: DateZ }).safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลไม่ถูกต้อง กรุณาตรวจช่องที่กรอก" };
    updateCounselorOpinion(getDb(), noteId, p.data, a);
    return done(enrollmentId);
  } catch (e) { return toError(e); }
}

export async function deleteOpinionAction(enrollmentId: number, noteId: number): Promise<ActionResult> {
  try {
    const a = await actor();
    deleteCounselorOpinion(getDb(), noteId, a);
    return done(enrollmentId);
  } catch (e) { return toError(e); }
}
