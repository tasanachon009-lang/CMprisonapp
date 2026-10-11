import fs from "node:fs";
import path from "node:path";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { orgInfo } from "@/lib/services/documents";
import { buildDocView } from "@/lib/docs/view";
import { MemoSheet } from "../document/[id]/sheet";

export const dynamic = "force-dynamic";

const K = (n: number) => "ก".repeat(n);
/** ข้อความชุดเดียวกับต้นแบบ docs/forms/memo-template.doc — ใช้วางทับตรวจระยะ (สเปก 18.3A) */
const SAMPLE = {
  subject: K(29), toLine: K(32),
  body: [`ภาคเหตุ ${K(265)}`, `ภาคความประสงค์ ${K(238)}`, `ภาคสรุป ${K(45)}`].join("\n"),
};

/**
 * ตัวอย่างแม่แบบบันทึกข้อความกลาง — เนื้อหาเหมือนต้นแบบจริงทุกตัวอักษร (ไม่มีข้อมูลบุคคล)
 * ?org=1 = ใช้ชื่อหน่วยงาน/เลขที่หนังสือจากตั้งค่า · ไม่ใส่ = เว้นว่างเหมือนต้นแบบ
 */
export default async function MemoSample({ searchParams }: PageProps<"/print/memo-sample">) {
  await requirePage("docs.view");
  const sp = await searchParams;
  const org = orgInfo(getDb());
  const v = buildDocView({ kind: "memo", docNo: null, docDate: null, subject: SAMPLE.subject, toLine: SAMPLE.toLine, refs: null, attachments: null, body: SAMPLE.body, signerName: "พิมพ์ชื่อเต็ม", signerTitle: "ตำแหน่ง" }, org);
  const hasGaruda = fs.existsSync(path.join(/*turbopackIgnore: true*/ process.cwd(), "public", "doc-assets", "garuda.png"));
  return <MemoSheet v={sp.org ? v : { ...v, orgLines: [""], docNo: sp.no ? "นร ๐๑๐๔/" : v.docNo }} hasGaruda={hasGaruda} />;
}
