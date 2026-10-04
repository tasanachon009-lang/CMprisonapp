import { getSqlite } from "@/lib/db";

/** ตรวจว่าระบบทำงาน (ใช้โดย update.ps1) — ไม่มีข้อมูลใดๆ */
export function GET() {
  try {
    getSqlite().prepare("SELECT 1").get();
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
