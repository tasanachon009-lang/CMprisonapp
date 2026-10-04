"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, getAuth, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { createMessage, ackMessage, resolveMessage, shiftViewer } from "@/lib/services/shift";
import { isValidISODate } from "@/lib/thai-date";

const viewer = (a: NonNullable<Awaited<ReturnType<typeof getAuth>>>) => shiftViewer(getDb(), a);

const MsgSchema = z.object({
  level: z.enum(["normal", "important", "red"]),
  body: z.string().trim().min(1, "กรุณาพิมพ์ข้อความ").max(2000),
  personId: z.number().int().nullable(),
  healthRelated: z.boolean(),
  recipientType: z.enum(["next_shift", "all", "user", "cohort"]),
  recipientUserId: z.number().int().nullable(),
  recipientCohortId: z.number().int().nullable().optional(),
  needsAction: z.boolean(),
  dueDate: z.string().nullable().refine((v) => !v || isValidISODate(v), "วันที่ไม่ถูกต้อง"),
});

export async function sendShiftMessage(input: z.input<typeof MsgSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("shift.use");
    const parsed = MsgSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    createMessage(getDb(), parsed.data, { userId: auth.user.id, ip: await clientIp(), viewer: viewer(auth) });
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** รับทราบภารกิจ — ใช้ getAuth เพราะต้องทำได้แม้ถูกกั้นด้วยข้อความสีแดง */
export async function ackShiftMessage(id: number): Promise<ActionResult> {
  try {
    const auth = await getAuth();
    if (!auth || auth.locked) return { ok: false, error: "กรุณาเข้าสู่ระบบ" };
    ackMessage(getDb(), id, viewer(auth));
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function resolveShiftMessage(id: number, resolution: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("shift.use");
    resolveMessage(getDb(), id, resolution, viewer(auth));
    revalidatePath("/inbox");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
