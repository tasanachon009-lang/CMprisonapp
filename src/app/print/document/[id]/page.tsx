import fs from "node:fs";
import path from "node:path";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getDocument, orgInfo, markDocumentPrinted } from "@/lib/services/documents";
import { buildDocView } from "@/lib/docs/view";
import type { DocKind } from "@/lib/docs/templates";
import { logPrint } from "@/lib/print";
import { DocSheet } from "./sheet";

export const dynamic = "force-dynamic";

/** หน้าพิมพ์เอกสารราชการ (สเปก 18.4) — พิมพ์หรือ "บันทึกเป็น PDF" จากปุ่มพิมพ์ของเบราว์เซอร์ */
export default async function DocumentPrint({ params }: PageProps<"/print/document/[id]">) {
  const auth = await requirePage("docs.view");
  const { id } = await params;
  const db = getDb();
  const d = getDocument(db, Number(id));
  if (!d) notFound();
  await logPrint(auth, "document", d.id);
  markDocumentPrinted(db, d.id);
  const hasGaruda = fs.existsSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "doc-assets", "garuda.png"));
  return <DocSheet v={buildDocView({ ...d, kind: d.kind as DocKind }, orgInfo(db))} hasGaruda={hasGaruda} />;
}
