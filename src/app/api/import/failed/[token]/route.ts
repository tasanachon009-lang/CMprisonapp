import { requireAction, AuthError, clientIp } from "@/lib/auth/session";
import { failedRowsWorkbook } from "@/lib/services/import";
import { importCache } from "@/lib/import-cache";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";

/** ดาวน์โหลดแถวที่ไม่ผ่านพร้อมเหตุผล (มีชื่อผู้ต้องขัง → ต้องมีสิทธิ์ส่งออก) */
export async function GET(_req: Request, ctx: RouteContext<"/api/import/failed/[token]">) {
  let userId: number;
  try {
    userId = (await requireAction("registry.import")).user.id;
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { token } = await ctx.params;
  const entry = importCache.get(token);
  if (!entry || entry.userId !== userId) return new Response("ผลตรวจหมดอายุแล้ว กรุณาตรวจไฟล์ใหม่", { status: 404 });
  writeAudit(getDb(), { userId, action: "export", entity: "import.failed_rows", entityId: entry.cohortId, note: entry.fileName, ip: await clientIp() });
  return new Response(new Uint8Array(await failedRowsWorkbook(entry.rows)), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("แถวที่ไม่ผ่าน.xlsx")}`,
    },
  });
}
