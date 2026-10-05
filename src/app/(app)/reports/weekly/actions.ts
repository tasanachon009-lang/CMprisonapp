"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { getSetting } from "@/lib/bootstrap";
import { upsertDraft, saveWeeklyTexts, approveWeekly, unapproveWeekly, mondayOf, weeklyLineSummary, type WeeklyData } from "@/lib/services/weekly-report";
import { sendLine } from "@/lib/line/send";
import { isValidISODate } from "@/lib/thai-date";

/** สร้าง/รีเฟรชร่างรายงานของสัปดาห์ที่มีวันที่นี้ */
export async function createWeeklyAction(date: string): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("reports.weekly");
    if (!isValidISODate(date)) return { ok: false, error: "วันที่ไม่ถูกต้อง" };
    const r = upsertDraft(getDb(), mondayOf(date), auth.user.id);
    revalidatePath("/reports/weekly");
    return { ok: true, data: { id: r.id }, message: r.status === "approved" ? "สัปดาห์นี้อนุมัติแล้ว" : "สร้าง/อัปเดตร่างแล้ว (ข้อความที่แก้ไว้ไม่ถูกทับ)" };
  } catch (e) {
    return toError(e);
  }
}

const TZ = z.object({ issues: z.string().max(5000).nullable(), nextPlan: z.string().max(5000).nullable(), note: z.string().max(2000).nullable() });

export async function saveWeeklyTextsAction(id: number, input: z.input<typeof TZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("reports.weekly");
    const p = TZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อความยาวเกินไป" };
    saveWeeklyTexts(getDb(), id, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/reports/weekly/${id}`);
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

/** อนุมัติ → ตัวเลขคงที่ · ถ้าตั้งค่าไว้ ส่ง "สรุปตัวเลข" ทาง LINE (ไม่มีชื่อบุคคล) */
export async function approveWeeklyAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("reports.weekly");
    const db = getDb();
    const r = approveWeekly(db, id, { userId: auth.user.id, ip: await clientIp() });
    let line = "";
    if (getSetting<boolean>(db, "line.weeklyReportSummary", false) === true) {
      const m = await sendLine(db, "weekly_report", weeklyLineSummary(r.data as WeeklyData), { targetDate: r.weekStart, sentBy: auth.user.id });
      line = m.status === "sent" ? " · ส่งสรุปทาง LINE แล้ว" : m.status === "dry_run" ? " · LINE โหมดทดลอง (ไม่ได้ส่งจริง)" : " · ส่ง LINE ไม่สำเร็จ (ดูที่หน้า LINE)";
    }
    revalidatePath(`/reports/weekly/${id}`);
    revalidatePath("/reports/weekly");
    return { ok: true, message: `อนุมัติแล้ว${line}` };
  } catch (e) {
    return toError(e);
  }
}

export async function unapproveWeeklyAction(id: number, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("reports.weekly");
    unapproveWeekly(getDb(), id, String(reason ?? "").slice(0, 300), { userId: auth.user.id, ip: await clientIp() });
    revalidatePath(`/reports/weekly/${id}`);
    return { ok: true, message: "ยกเลิกการอนุมัติแล้ว — แก้ไขแล้วอนุมัติใหม่" };
  } catch (e) {
    return toError(e);
  }
}
