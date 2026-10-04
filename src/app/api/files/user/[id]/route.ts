import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getTrustedDeviceId } from "@/lib/auth/session";
import { resolveUpload } from "@/lib/photos";

/** รูปเจ้าหน้าที่ (ใช้ในหน้าเลือกผู้ใช้ — ต้องผ่านรหัสหน่วยงานแล้ว) */
export async function GET(_req: Request, ctx: RouteContext<"/api/files/user/[id]">) {
  if (!(await getTrustedDeviceId())) return new Response("ไม่อนุญาต", { status: 401 });
  const { id } = await ctx.params;
  const u = getDb().select({ p: schema.users.photoPath }).from(schema.users).where(eq(schema.users.id, Number(id))).get();
  const file = u?.p ? resolveUpload(u.p) : null;
  if (!file) return new Response("ไม่พบรูป", { status: 404 });
  return new Response(fs.readFileSync(file), { headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" } });
}
