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
