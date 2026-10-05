import type { DB } from "../db";
import { getSetting } from "../bootstrap";

/** ค่าปรับตำแหน่งการพิมพ์ทั้งหน้า (มม.) ต่อแบบฟอร์ม — หน้า "ปรับตำแหน่งการพิมพ์" (สเปก 22) */
export const PRINT_FORMS = { ktb: "แบบแจ้งรับเงินโอน KTB", voucher: "ใบสำคัญรับเงิน", report: "สรุป/ตารางรายละเอียด" } as const;
export type PrintForm = keyof typeof PRINT_FORMS;
export type Offset = { dx: number; dy: number };

export const OFFSET_LIMIT = 15;

export function printOffsets(db: DB): Record<PrintForm, Offset> {
  const raw = getSetting<Partial<Record<PrintForm, Partial<Offset>>>>(db, "print.offsets", {}) ?? {};
  const clamp = (v: unknown) => Math.max(-OFFSET_LIMIT, Math.min(OFFSET_LIMIT, Number(v) || 0));
  return Object.fromEntries((Object.keys(PRINT_FORMS) as PrintForm[]).map((k) => [k, { dx: clamp(raw[k]?.dx), dy: clamp(raw[k]?.dy) }])) as Record<PrintForm, Offset>;
}
