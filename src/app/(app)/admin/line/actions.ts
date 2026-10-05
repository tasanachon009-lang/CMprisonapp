"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { getSetting, setSetting } from "@/lib/bootstrap";
import { writeAudit } from "@/lib/audit";
import { sendLine, LINE_STATUS_LABEL } from "@/lib/line/send";
import { dayText, hashText, nextWorkingDay } from "@/lib/line/messages";
import { todayISO } from "@/lib/thai-date";

const Z = z.object({ enabled: z.boolean(), sendTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), weeklyOnFriday: z.boolean(), weeklyReportSummary: z.boolean() });

/** ตั้งค่า LINE (สเปก 12) — token อยู่ใน .env เท่านั้น ไม่รับผ่านหน้าจอ */
export async function saveLineSettingsAction(input: z.input<typeof Z>): Promise<ActionResult> {
  try {
    const auth = await requireAction("line.manage");
    const p = Z.safeParse(input);
    if (!p.success) return { ok: false, error: "เวลาส่งต้องเป็นรูปแบบ ชม.:นาที เช่น 16:00" };
    const db = getDb();
    const before = { enabled: getSetting(db, "line.enabled", false), sendTime: getSetting(db, "line.sendTime", "16:00") };
    setSetting(db, "line.enabled", p.data.enabled, auth.user.id);
    setSetting(db, "line.sendTime", p.data.sendTime, auth.user.id);
    setSetting(db, "line.weeklyOnFriday", p.data.weeklyOnFriday, auth.user.id);
    setSetting(db, "line.weeklyReportSummary", p.data.weeklyReportSummary, auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "line_settings", before, after: p.data, ip: await clientIp() });
    revalidatePath("/admin/line");
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

/** ส่งทดสอบ: ข้อความสั้น หรือ ตารางวันทำการถัดไป (ตามที่เลือก) */
export async function sendLineTestAction(kind: "ping" | "tomorrow"): Promise<ActionResult> {
  try {
    const auth = await requireAction("line.manage");
    const db = getDb();
    let r;
    if (kind === "tomorrow") {
      const target = nextWorkingDay(db, todayISO());
      const t = dayText(db, target);
      r = await sendLine(db, "daily", t.text, { targetDate: target, contentHash: hashText(t.text), sentBy: auth.user.id });
    } else {
      r = await sendLine(db, "test", "✅ ทดสอบการส่งจากระบบสถานฟื้นฟู — ถ้าได้รับข้อความนี้ แปลว่าตั้งค่า LINE ถูกต้อง", { sentBy: auth.user.id });
    }
    revalidatePath("/admin/line");
    return r.status === "failed" ? { ok: false, error: `ส่งไม่สำเร็จ: ${r.error ?? ""} — กด "คัดลอกข้อความ" ส่งเองในกลุ่ม LINE ได้` } : { ok: true, message: LINE_STATUS_LABEL[r.status] + (r.error ? ` — ${r.error}` : "") };
  } catch (e) {
    return toError(e);
  }
}
