import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { incompleteData } from "@/lib/queries/incomplete";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

type P = { enrollmentId: number; personId: number; name: string; inmateNo: string; cohort: string };

/** ข้อมูลที่ยังไม่ครบ — กดแล้วพาไปกรอก */
export default async function IncompletePage() {
  const auth = await requirePage("registry.view");
  const d = incompleteData(getDb(), auth.can);
  const groups: Array<{ title: string; items: P[]; href: (p: P) => string; extra?: (p: P) => string }> = [
    { title: "ยังไม่มีรูปถ่าย", items: d.noPhoto, href: (p) => `/persons/${p.personId}` },
    { title: "ยังไม่มีหลักฐานลงนามยินยอม (PDPA)", items: d.noConsent, href: (p) => `/enrollments/${p.enrollmentId}` },
    { title: "ยังไม่บันทึกคะแนนคัดกรอง (เกณฑ์รับเข้า)", items: d.noScreening, href: (p) => `/enrollments/${p.enrollmentId}` },
    { title: "ยังไม่มีวันเกิด", items: d.noBirthDate, href: (p) => `/persons/${p.personId}` },
    { title: "ยังไม่มีข้อมูลญาติ/ผู้ติดต่อ", items: d.noContact, href: (p) => `/persons/${p.personId}` },
  ];
  const total = groups.reduce((s, g) => s + g.items.length, 0) + d.preAssessment.length + d.cohortsToClose.length;
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "ข้อมูลที่ยังไม่ครบ" }]} />
      <PageHeader en="Data Completeness" title="ข้อมูลที่ยังไม่ครบ" subtitle={`ช่องที่ไม่บังคับตอนลงทะเบียน จะมาแสดงที่นี่ (รุ่นที่ยังไม่ปิด) — รวม ${total} รายการ`} />
      {d.cohortsToClose.length > 0 && (
        <section className="card">
          <h2 className="text-xl">รุ่นที่อบรมครบแล้วแต่ยังไม่ปิด</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{d.cohortsToClose.map((c) => <li key={c.id}><Link href={`/cohorts/${c.id}/report`} className="tag-warn hover:underline">{c.label}</Link></li>)}</ul>
        </section>
      )}
      <section className="card">
        <h2 className="text-xl">ยังไม่ประเมินก่อนเรียน <span className="text-muted">({d.preAssessment.length})</span></h2>
        {d.preAssessment.length === 0 ? <EmptyState title="ครบแล้ว" /> : (
          <ul className="mt-2 flex flex-wrap gap-2">
            {d.preAssessment.slice(0, 200).map((p) => <li key={`${p.enrollmentId}-${p.formCode}`}><Link href={`/enrollments/${p.enrollmentId}/assess/${p.formCode}?round=pre`} className="tag-muted hover:underline">{p.name} · {p.form}</Link></li>)}
          </ul>
        )}
      </section>
      <div className="grid gap-4 lg:grid-cols-2">
        {groups.map((g) => (
          <section key={g.title} className="card">
            <h2 className="text-xl">{g.title} <span className="text-muted">({g.items.length})</span></h2>
            {g.items.length === 0 ? <EmptyState title="ครบแล้ว" /> : (
              <ul className="mt-2 max-h-80 divide-y divide-line overflow-y-auto">
                {g.items.map((p) => (
                  <li key={`${g.title}-${p.enrollmentId}`} className="flex items-center gap-2 py-1.5">
                    <Link href={g.href(p)} className="flex-1 hover:underline">{p.name}</Link>
                    <span className="text-sm text-muted">{p.inmateNo} · {p.cohort}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
