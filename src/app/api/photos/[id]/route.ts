import fs from "node:fs";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp, AuthError } from "@/lib/auth/session";
import { savePhoto, PHOTO_MAX_BYTES, resolveUpload } from "@/lib/photos";
import { sameOrigin } from "@/lib/http";
import { writeAudit } from "@/lib/audit";

/** อัปโหลดรูปถ่ายประจำตัวของการต้องโทษ */
export async function POST(req: Request, ctx: RouteContext<"/api/photos/[id]">) {
  if (!sameOrigin(req)) return Response.json({ error: "คำขอไม่ถูกต้อง" }, { status: 403 });
  try {
    const auth = await requireAction("registry.edit");
    const { id } = await ctx.params;
    const db = getDb();
    const inc = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, Number(id))).get();
    if (!inc) return Response.json({ error: "ไม่พบข้อมูล" }, { status: 404 });
    const form = await req.formData();
    const file = form.get("photo");
    if (!(file instanceof File)) return Response.json({ error: "ยังไม่ได้เลือกรูป" }, { status: 400 });
    if (file.size > PHOTO_MAX_BYTES) return Response.json({ error: "ไฟล์ใหญ่เกิน 8 MB" }, { status: 400 });
    const saved = await savePhoto(Buffer.from(await file.arrayBuffer()), `inc${inc.id}`);
    db.update(schema.incarcerations).set({ ...saved, updatedBy: auth.user.id, updatedAt: new Date(), version: inc.version + 1 }).where(eq(schema.incarcerations.id, inc.id)).run();
    for (const old of [inc.photoPath, inc.thumbPath]) {
      const f = old ? resolveUpload(old) : null;
      if (f) fs.rmSync(f, { force: true });
    }
    writeAudit(db, { userId: auth.user.id, action: "photo.upload", entity: "incarceration", entityId: inc.id, personId: inc.personId, ip: await clientIp() });
    return Response.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return Response.json({ error: e.message }, { status: 403 });
    return Response.json({ error: e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ" }, { status: 400 });
  }
}
