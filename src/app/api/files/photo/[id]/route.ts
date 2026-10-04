import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth/session";
import { resolveUpload } from "@/lib/photos";

/** รูปผู้ต้องขัง — เปิดได้เฉพาะผู้ล็อกอิน (และไม่ถูกล็อกหน้าจอ) */
export async function GET(req: Request, ctx: RouteContext<"/api/files/photo/[id]">) {
  const auth = await getAuth();
  if (!auth || auth.locked) return new Response("ต้องเข้าสู่ระบบ", { status: 401 });
  const { id } = await ctx.params;
  const inc = getDb().select({ p: schema.incarcerations.photoPath, t: schema.incarcerations.thumbPath }).from(schema.incarcerations).where(eq(schema.incarcerations.id, Number(id))).get();
  const thumb = new URL(req.url).searchParams.get("s") === "thumb";
  const rel = thumb ? inc?.t : inc?.p;
  const file = rel ? resolveUpload(rel) : null;
  if (!file) return new Response("ไม่พบรูป", { status: 404 });
  return new Response(fs.readFileSync(file), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
