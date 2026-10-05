"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { saveAttendance } from "@/lib/services/attendance";
import { ATTENDANCE_STATUSES } from "@/lib/rules/attendance-rules";
import { toError, type ActionResult } from "@/lib/action-result";
import { saveSessionReport, createMakeupSession, setInviteStatus } from "@/lib/services/session-close";

const Entry = z.object({
  enrollmentId: z.number().int(),
  status: z.enum(ATTENDANCE_STATUSES),
  correctionsType: z.string().max(40).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export async function saveAttendanceAction(
  sessionId: number,
  entries: z.input<typeof Entry>[],
  loadedVersion: number,
  source?: "emergency_kit" | "quick_entry",
): Promise<ActionResult<{ created: number; updated: number }>> {
  try {
    const auth = await requireAction();
    const db = getDb();
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, sessionId)).get();
    if (!s) return { ok: false, error: "ไม่พบคาบกิจกรรม" };
    if (!sessionAccess(auth, s.id, s.cohortId).canEdit) return { ok: false, error: "คุณไม่มีสิทธิ์เช็คชื่อคาบนี้" };
    const parsed = z.array(Entry).max(500).safeParse(entries);
    if (!parsed.success) return { ok: false, error: "ข้อมูลการเช็คชื่อไม่ถูกต้อง กรุณาโหลดหน้าใหม่" };
    const r = saveAttendance(
      db, sessionId, parsed.data,
      { userId: auth.user.id, isAdmin: auth.isAdmin, ip: await clientIp(), source: source === "emergency_kit" ? "กรอกย้อนหลังจากชุดฉุกเฉิน" : source === "quick_entry" ? "โหมดกรอกเร็ว" : null },
      loadedVersion,
    );
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath(`/cohorts/${s.cohortId}`);
    return { ok: true, data: r };
  } catch (e) {
    return toError(e);
  }
}

const ReportZ = z.object({
  outcome: z.enum(["planned", "partial", "not_done"]),
  reason: z.string().max(500).nullable().optional(),
  participation: z.enum(["excellent", "good", "fair", "needs_improvement"]).nullable().optional(),
  summary: z.string().max(500).nullable().optional(),
  issues: z.string().max(1000).nullable().optional(),
  staff: z.array(z.object({ staffId: z.number().int(), didTeach: z.boolean(), actualHours: z.number().nullable().optional() })).max(50).optional(),
  chips: z.array(z.string().max(100)).max(30).nullable().optional(),
  source: z.enum(["direct", "paper_copy"]).optional(),
});

/** "บันทึกและปิดคาบ" — ผู้สอน หรือเจ้าหน้าที่ที่เช็คชื่อได้ (บันทึกแทนวิทยากรภายนอก) */
export async function saveSessionReportAction(sessionId: number, input: z.input<typeof ReportZ>): Promise<ActionResult<{ participants: number; proxyEntry: boolean }>> {
  try {
    const auth = await requireAction();
    const db = getDb();
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, sessionId)).get();
    if (!s) return { ok: false, error: "ไม่พบคาบกิจกรรม" };
    if (!sessionAccess(auth, s.id, s.cohortId).canEdit) return { ok: false, error: "คุณไม่มีสิทธิ์บันทึกผลคาบนี้" };
    const p = ReportZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลผลกิจกรรมไม่ถูกต้อง" };
    const r = saveSessionReport(db, sessionId, p.data, { userId: auth.user.id, isAdmin: auth.isAdmin, ip: await clientIp() });
    revalidatePath(`/sessions/${sessionId}`);
    revalidatePath("/");
    return { ok: true, data: r, message: r.proxyEntry ? "บันทึกแล้ว (บันทึกแทนผู้สอน — ระบบเก็บชื่อผู้บันทึกแยกไว้)" : "บันทึกและปิดคาบแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const MakeupZ = z.object({ date: z.string(), startTime: z.string(), endTime: z.string(), hours: z.number(), location: z.string().max(200).nullable().optional() });

export async function createMakeupAction(originalId: number, input: z.input<typeof MakeupZ>): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("schedule.edit");
    const p = MakeupZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลคาบชดเชยไม่ถูกต้อง" };
    const row = createMakeupSession(getDb(), originalId, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/sessions/${originalId}`);
    revalidatePath(`/cohorts/${row.cohortId}/schedule`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}

export async function setInviteStatusAction(staffId: number, status: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("schedule.edit");
    setInviteStatus(getDb(), staffId, status, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/cohorts");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}