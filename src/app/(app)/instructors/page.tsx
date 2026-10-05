import Link from "next/link";
import { Plus, Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listInstructors } from "@/lib/services/instructors";
import { EXTERNAL_TYPE_LABEL } from "@/lib/reference-data";
import { presentSensitive } from "@/lib/instructor-rules";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** ทะเบียนวิทยากร (สเปก 11.5B) — สถานะ "พร้อมเบิก" / "ข้อมูลไม่ครบ" */
export default async function InstructorsPage({ searchParams }: PageProps<"/instructors">) {
  const auth = await requirePage("instructors.view");
  const sp = await searchParams;
  const kind = sp.kind === "internal" || sp.kind === "external" ? sp.kind : "all";
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const status = sp.status === "missing" || sp.status === "ready" ? sp.status : "all";
  const full = auth.can("instructors.sensitive");
  const all = listInstructors(getDb());
  const rows = all
    .filter((x) => kind === "all" || x.kind === kind)
    .filter((x) => status === "all" || (status === "ready" ? x.readiness.ready : !x.readiness.ready))
    .filter((x) => !q || `${x.displayName} ${x.organization ?? ""} ${x.expertise ?? ""}`.includes(q));
  const link = (o: Record<string, string>) => `?${new URLSearchParams({ kind, status, ...(q ? { q } : {}), ...o }).toString()}`;
  const chip = (active: boolean, href: string, label: string) => (
    <Link href={href} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{label}</Link>
  );
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "ทะเบียนวิทยากร" }]} />
      <PageHeader en="Instructors" title="ทะเบียนวิทยากร" subtitle="กรอกครั้งเดียว ใช้เติมเอกสารเบิกจ่ายทุกฉบับ — เลขบัตร ที่อยู่ เลขบัญชี เห็นเต็มเฉพาะการเงิน/ผู้ดูแล"
        actions={<div className="flex flex-wrap gap-2">
          <Link href="/print/instructor-form" target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> แบบฟอร์มขอข้อมูลวิทยากร (เปล่า)</Link>
          {auth.can("instructors.manage") && <Link href="/instructors/new" className="btn-primary"><Plus size={20} aria-hidden /> เพิ่มวิทยากร</Link>}
        </div>} />
      <section className="card space-y-3">
        <form className="flex flex-wrap gap-2" action="">
          <input type="hidden" name="kind" value={kind} /><input type="hidden" name="status" value={status} />
          <input name="q" defaultValue={q} className="input max-w-xs" placeholder="ค้นหาชื่อ หน่วยงาน ความเชี่ยวชาญ" aria-label="ค้นหาวิทยากร" />
          <button className="btn-secondary">ค้นหา</button>
        </form>
        <div className="flex flex-wrap gap-2">
          {chip(kind === "all", link({ kind: "all" }), `ทั้งหมด ${all.length}`)}
          {chip(kind === "internal", link({ kind: "internal" }), "ภายใน")}
          {chip(kind === "external", link({ kind: "external" }), "ภายนอก")}
          <span className="mx-1 self-center text-muted">|</span>
          {chip(status === "all", link({ status: "all" }), "ทุกสถานะ")}
          {chip(status === "ready", link({ status: "ready" }), "พร้อมเบิก")}
          {chip(status === "missing", link({ status: "missing" }), "ข้อมูลไม่ครบ")}
        </div>
        {rows.length === 0 ? <EmptyState title="ไม่พบวิทยากร" /> : (
          <div className="overflow-x-auto">
            <table className="table-plain">
              <thead><tr><th>ชื่อ-สกุล</th><th>ประเภท</th><th>ตำแหน่ง / หน่วยงาน</th><th>เลขบัญชี</th><th>สถานะเอกสารเบิกจ่าย</th></tr></thead>
              <tbody>
                {rows.map((x) => {
                  const sens = presentSensitive(x, full);
                  return (
                    <tr key={x.id} className={x.active ? "" : "opacity-60"}>
                      <td><Link href={`/instructors/${x.id}`} className="font-medium hover:underline">{x.fullName || "-"}</Link>{!x.active && <span className="tag-muted ml-1">ไม่ใช้งาน</span>}</td>
                      <td>{x.kind === "internal" ? <span className="tag-navy">ใน</span> : <span className="tag-orange">นอก · {EXTERNAL_TYPE_LABEL[x.externalType ?? "gov"]}</span>}</td>
                      <td className="text-sm">{[x.position, x.organization].filter(Boolean).join(" · ") || "-"}</td>
                      <td className="font-mono text-sm">{sens.accountNo || "-"}</td>
                      <td>{x.readiness.ready ? <span className="tag-ok">พร้อมเบิก</span> : <span className="tag-danger" title={x.readiness.missing.join(", ")}>ข้อมูลไม่ครบ: ขาด{x.readiness.missing.slice(0, 3).join(", ")}{x.readiness.missing.length > 3 ? ` และอีก ${x.readiness.missing.length - 3}` : ""}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
