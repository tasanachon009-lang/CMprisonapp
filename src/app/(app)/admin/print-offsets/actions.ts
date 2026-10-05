"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { setSetting } from "@/lib/bootstrap";
import { writeAudit } from "@/lib/audit";
import { printOffsets, OFFSET_LIMIT, PRINT_FORMS } from "@/lib/pdf/offsets";

const O = z.object({ dx: z.number().min(-OFFSET_LIMIT).max(OFFSET_LIMIT), dy: z.number().min(-OFFSET_LIMIT).max(OFFSET_LIMIT) });
const Z = z.object({ ktb: O, voucher: O, report: O });

/** ปรับตำแหน่งการพิมพ์ทั้งหน้า ±มม. ต่อแบบฟอร์ม (สเปก 22) — ผู้ดูแล */
export async function savePrintOffsetsAction(input: z.input<typeof Z>): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    const p = Z.safeParse(input);
    if (!p.success) return { ok: false, error: `ค่าปรับต้องอยู่ระหว่าง −${OFFSET_LIMIT} ถึง ${OFFSET_LIMIT} มม.` };
    const db = getDb();
    const before = printOffsets(db);
    const round = (v: number) => Math.round(v * 10) / 10;
    const next = Object.fromEntries((Object.keys(PRINT_FORMS) as Array<keyof typeof PRINT_FORMS>).map((k) => [k, { dx: round(p.data[k].dx), dy: round(p.data[k].dy) }]));
    setSetting(db, "print.offsets", next, auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "print_offsets", before, after: next, ip: await clientIp() });
    revalidatePath("/admin/print-offsets");
    return { ok: true, message: "บันทึกแล้ว — พิมพ์ใบทดสอบอีกครั้งเพื่อตรวจ" };
  } catch (e) {
    return toError(e);
  }
}
