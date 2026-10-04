import { requireAction, AuthError } from "@/lib/auth/session";
import { buildTemplate } from "@/lib/services/import";

export async function GET() {
  try {
    await requireAction("registry.import");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  return new Response(new Uint8Array(await buildTemplate()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent("แม่แบบนำเข้ารายชื่อ.xlsx")}`,
    },
  });
}
