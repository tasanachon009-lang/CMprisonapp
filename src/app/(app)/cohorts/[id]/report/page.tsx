import Link from "next/link";
import { notFound } from "next/navigation";
import { CheckCircle2, FileSpreadsheet, Printer, XCircle } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { closeChecklist } from "@/lib/services/close-cohort";
import { formatThaiDateTime } from "@/lib/thai-date";
import { Alert } from "@/components/ui";
import { CloseCohortButton } from "./close-button";

export const dynamic = "force-dynamic";

export default async function CohortReport({ params }: PageProps<"/cohorts/[id]/report">) {
  const auth = await requirePage("reports.view", "dashboard.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const cl = closeChecklist(db, row.cohort.id);
  const reports = [
    { href: `/print/cohort/${row.cohort.id}`, label: "รายงานรายรุ่น", desc: "รายชื่อ+สถานะ การเข้าร่วม คะแนนเฉลี่ยก่อน-หลัง สรุปตัวเลข" },
    { href: `/print/sign-sheet/${row.cohort.id}`, label: "ใบลงลายมือชื่อ", desc: "รายวัน ช่องเช้า-บ่าย" },
    { href: `/print/blank-forms/${row.cohort.id}`, label: "แบบประเมินเปล่ามีชื่อ", desc: "ทั้งรุ่น ไว้กรอกด้วยมือ (ไม่รวมแบบสุขภาพ ถ้าไม่มีสิทธิ์)" },
    { href: `/print/certificates/${row.cohort.id}`, label: "ใบรับรองการผ่านหลักสูตร", desc: "เฉพาะผู้ครบหลักสูตร" },
  ];
  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-xl">รายงานและเอกสารของรุ่น</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {reports.map((r) => (
            <Link key={r.href} href={r.href} target="_blank" className="flex items-start gap-3 rounded-2xl border border-line p-4 hover:border-navy">
              <Printer className="mt-1 text-navy" aria-hidden />
              <span><b>{r.label}</b><span className="block text-sm text-muted">{r.desc}</span></span>
            </Link>
          ))}
          {auth.can("export.names") && (
            <a href={`/api/export/cohort/${row.cohort.id}`} className="flex items-start gap-3 rounded-2xl border border-line p-4 hover:border-navy">
              <FileSpreadsheet className="mt-1 text-ok" aria-hidden />
              <span><b>ส่งออก Excel</b><span className="block text-sm text-muted">รายชื่อ สถานะ การเข้าร่วม คะแนน (มีชื่อผู้ต้องขัง — บันทึกการส่งออก)</span></span>
            </a>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl">เช็คลิสต์ก่อนปิดรุ่น</h2>
        {row.cohort.status === "closed" ? (
          <Alert tone="ok">ปิดรุ่นแล้วเมื่อ {formatThaiDateTime(row.cohort.closedAt)}</Alert>
        ) : (
          <>
            <ul className="mt-3 space-y-2">
              {cl.items.map((i) => (
                <li key={i.key} className="flex items-center gap-2">
                  {i.ok ? <CheckCircle2 className="text-ok" size={20} aria-hidden /> : <XCircle className="text-danger" size={20} aria-hidden />}
                  <span className={i.ok ? "" : "font-semibold"}>{i.label}</span>
                  {!i.ok && i.detail && <span className="text-sm text-danger">— {i.detail}</span>}
                </li>
              ))}
            </ul>
            
            {auth.can("course.manage") && <CloseCohortButton cohortId={row.cohort.id} ready={cl.ready} isAdmin={auth.isAdmin} />}
          </>
        )}
      </section>
    </div>
  );
}
