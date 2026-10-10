import { HelpButton } from "@/components/help-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { listDocuments, listTemplates } from "@/lib/services/documents";
import { DOC_KIND_LABEL, type DocKind } from "@/lib/docs/templates";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { CreateDocButton } from "./create-button";

export const dynamic = "force-dynamic";

/** เอกสารราชการของรุ่น (สเปก 18.4) — สร้างจากแม่แบบ แก้ก่อนพิมพ์ พิมพ์/PDF หรือ Word */
export default async function CohortDocuments({ params }: PageProps<"/cohorts/[id]/documents">) {
  const auth = await requirePage("docs.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const canManage = auth.can("docs.manage") && row.cohort.status !== "closed";
  const templates = listTemplates(db).filter((t) => !t.courseCodes || t.courseCodes.includes(row.course.code));
  const docs = listDocuments(db, row.cohort.id);
  const names = userNameMap(db);
  return (
    <div className="space-y-6">
      <Alert tone="info">แม่แบบเป็นร่างตามรูปแบบหนังสือราชการ กรุณาตรวจและแก้ข้อความก่อนพิมพ์ <HelpButton>เอกสารสร้างจากแม่แบบและเติมข้อมูลของรุ่นให้ แก้ข้อความได้ก่อนพิมพ์ เมื่อใช้จริงแล้วให้ล็อกเป็นฉบับจริง</HelpButton></Alert>
      {canManage && (
        <section className="card">
          <h2 className="text-xl">สร้างเอกสารใหม่</h2>
          <ul className="mt-3 grid gap-2 md:grid-cols-2">
            {templates.map((t) => (
              <li key={t.code} className="flex flex-wrap items-center gap-2 rounded-2xl border border-line px-4 py-3">
                <span><b>{t.name}</b> <span className="tag-muted ml-1">{DOC_KIND_LABEL[t.kind]}</span></span>
                <span className="ml-auto"><CreateDocButton cohortId={row.cohort.id} code={t.code} /></span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="card">
        <h2 className="text-xl">เอกสารของรุ่นนี้</h2>
        {docs.length === 0 ? <EmptyState title="ยังไม่มีเอกสาร">{canManage ? "เลือกแม่แบบด้านบนเพื่อสร้างฉบับแรก" : undefined}</EmptyState> : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left text-muted"><th className="py-2">เอกสาร</th><th>ที่</th><th>ลงวันที่</th><th>สถานะ</th><th>แก้ล่าสุด</th><th /></tr></thead>
              <tbody>
                {docs.map((d) => (
                  <tr key={d.id} className="border-t border-line align-top">
                    <td className="py-2"><Link href={`/documents/${d.id}`} className="font-semibold hover:underline">{d.title}</Link><span className="block text-muted">{DOC_KIND_LABEL[d.kind as DocKind]} · เรื่อง {d.subject}</span></td>
                    <td>{d.docNo ?? "-"}</td>
                    <td>{d.docDate ? formatThaiDate(d.docDate) : <span className="text-muted">เว้นว่าง</span>}</td>
                    <td>{d.status === "final" ? <span className="tag-ok">ล็อกแล้ว</span> : <span className="tag-warn">ร่าง</span>}{d.printedAt && <span className="tag-muted ml-1">พิมพ์แล้ว</span>}</td>
                    <td className="text-muted">{names.get(d.updatedBy ?? 0) ?? "-"}<span className="block">{formatThaiDateTime(d.updatedAt)}</span></td>
                    <td className="whitespace-nowrap text-right">
                      <Link href={`/documents/${d.id}`} className="btn-ghost btn-sm">{canManage && d.status !== "final" ? "เปิด/แก้ไข" : "เปิดดู"}</Link>
                      <Link href={`/print/document/${d.id}`} target="_blank" className="btn-ghost btn-sm ml-1">พิมพ์</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
