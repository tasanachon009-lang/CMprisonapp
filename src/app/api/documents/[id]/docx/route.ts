import fs from "node:fs";
import path from "node:path";
import { requireAction, AuthError } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { getDocument, orgInfo } from "@/lib/services/documents";
import { buildDocView } from "@/lib/docs/view";
import { docxOf } from "@/lib/docs/docx";
import type { DocKind } from "@/lib/docs/templates";

/** เอกสารราชการเป็น Word (สเปก 18.4) — ต้องมีสิทธิ์ดูเอกสาร · บันทึกการส่งออก */
export async function GET(_req: Request, ctx: RouteContext<"/api/documents/[id]/docx">) {
  let auth;
  try {
    auth = await requireAction("docs.view");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const db = getDb();
  const d = getDocument(db, Number(id));
  if (!d) return new Response("ไม่พบเอกสาร", { status: 404 });
  const file = path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "doc-assets", "garuda.png");
  const buf = await docxOf(buildDocView({ ...d, kind: d.kind as DocKind }, orgInfo(db)), fs.existsSync(file) ? fs.readFileSync(file) : null);
  writeAudit(db, { userId: auth.user.id, action: "export", entity: "document_docx", entityId: d.id });
  return new Response(new Uint8Array(buf), {
    headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${d.title}-${d.id}.docx`)}` },
  });
}
