import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { getDocument } from "@/lib/services/documents";
import { DOC_KIND_LABEL, unknownVariables, type DocKind } from "@/lib/docs/templates";
import { userNameMap } from "@/lib/queries/names";
import { todayISO, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, RecordMeta } from "@/components/ui";
import { DocEditor } from "./doc-editor";

export const dynamic = "force-dynamic";

/** แก้เอกสารราชการก่อนพิมพ์ (สเปก 18.4) */
export default async function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  const auth = await requirePage("docs.view");
  const { id } = await params;
  const db = getDb();
  const d = getDocument(db, Number(id));
  if (!d) notFound();
  const row = d.cohortId ? getCohort(db, d.cohortId) : null;
  const canManage = auth.can("docs.manage") && row?.cohort.status !== "closed";
  const names = userNameMap(db);
  const kind = d.kind as DocKind;
  const leftover = unknownVariables(`${d.subject}\n${d.toLine}\n${d.body}`);
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[...(row ? [{ href: `/cohorts/${row.cohort.id}/documents`, label: `${row.course.shortName} ${cohortLabel(row.cohort)} · เอกสาร` }] : []), { label: d.title }]} />
      <PageHeader en="Official document" title={d.title} subtitle={DOC_KIND_LABEL[kind]} help="เอกสารที่ล็อกแล้วต้องกด “ปลดล็อกเพื่อแก้ไข” ก่อนแก้ ช่อง “…………” เติมได้ในเนื้อความ หรือเติมข้อมูลของรุ่นแล้วสร้างเอกสารใหม่"
        actions={<>
          <Link href={`/print/document/${d.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์ / PDF</Link>
          <a href={`/api/documents/${d.id}/docx`} className="btn-ghost"><FileDown size={20} aria-hidden /> Word</a>
        </>} />
      <div className="mb-3 space-y-2">
        <RecordMeta createdBy={names.get(d.createdBy ?? 0)} createdAt={formatThaiDateTime(d.createdAt)} updatedBy={names.get(d.updatedBy ?? 0)} updatedAt={formatThaiDateTime(d.updatedAt)} />
        {leftover.length > 0 && <Alert tone="warn">ยังมีตัวแปรที่ระบบไม่รู้จัก: {leftover.map((k) => `{{${k}}}`).join(", ")} — แก้เป็นข้อความจริงก่อนพิมพ์</Alert>}
        {/…………/.test(`${d.subject}${d.toLine}${d.body}`) && <Alert tone="warn">มีช่อง “…………” ที่ยังไม่มีข้อมูล กรุณาเติมในเนื้อความก่อนพิมพ์</Alert>}
        {!canManage && <Alert tone="info">ดูอย่างเดียว</Alert>}
      </div>
      <DocEditor
        id={d.id} kind={kind} today={todayISO()} readOnly={!canManage} locked={d.status === "final"}
        backHref={row ? `/cohorts/${row.cohort.id}/documents` : "/"}
        initial={{ version: d.version, docNo: d.docNo ?? "", docDate: d.docDate ?? "", subject: d.subject, toLine: d.toLine, refs: d.refs ?? "", attachments: d.attachments ?? "", body: d.body, signerName: d.signerName ?? "", signerTitle: d.signerTitle ?? "" }}
      />
    </div>
  );
}
