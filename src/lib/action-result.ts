import { RuleError } from "./services/registry";
import { AuthError } from "./auth/session";

export type ActionResult<T = undefined> = { ok: true; data?: T; message?: string } | { ok: false; error: string; code?: string; details?: unknown };

/** แปลงข้อผิดพลาดเป็นข้อความที่บอก "ต้องทำอะไร" (ไม่ส่งรายละเอียดภายในไปหน้าจอ) */
export function toError(e: unknown): { ok: false; error: string; code?: string; details?: unknown } {
  if (e instanceof RuleError) return { ok: false, error: e.message, code: e.code, details: e.result };
  if (e instanceof AuthError) return { ok: false, error: e.message, code: "auth" };
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes("UNIQUE constraint failed")) {
    return { ok: false, error: "ข้อมูลนี้มีอยู่แล้วในระบบ (ระบบกันบันทึกซ้ำ) กรุณาโหลดหน้าใหม่แล้วตรวจสอบ", code: "unique" };
  }
  if (msg.includes("SQLITE_BUSY")) return { ok: false, error: "ระบบกำลังบันทึกข้อมูลของผู้อื่นอยู่ กรุณากดบันทึกอีกครั้ง", code: "busy" };
  console.error(e);
  return { ok: false, error: "เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่ ถ้ายังไม่ได้ให้แจ้งผู้ดูแลระบบ", code: "internal" };
}
