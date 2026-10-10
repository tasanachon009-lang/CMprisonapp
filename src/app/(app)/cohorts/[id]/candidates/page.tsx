import { HelpButton } from "@/components/help-button";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { pre3Candidates } from "@/lib/queries/pre3-candidates";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** รายชื่อแนะนำหลักสูตร 3 วัน (สเปก 17) — ผ่าน 12 วัน/ชุมชนบำบัดแล้ว ยังไม่เคยเข้า 3 วัน · เรียงตามวันพ้นโทษโดยประมาณ */
export default async function CandidatesPage({ params, searchParams }: PageProps<"/cohorts/[id]/candidates">) {
  const auth = await requirePage("registry.edit"); // ใช้คัดเลือก — ผู้บริหารเห็นเฉพาะสรุป
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  if (row.course.code !== "PRE3") return <Alert tone="info">รายชื่อแนะนำใช้กับหลักสูตรฟื้นฟูก่อนพ้นโทษ 3 วัน</Alert>;
  const today = todayISO();
  const within = sp.within === "all" ? null : Number(sp.within) || 12;
  const list = pre3Candidates(db, today).filter((c) => within == null || (c.monthsLeft != null && c.monthsLeft <= within));
  const canRegister = row.cohort.status !== "closed";
  return (
    <div className="space-y-4">
      <Alert tone="info">วันพ้นโทษเป็นค่าประมาณ (วันรับตัว + กำหนดโทษ) กรุณาตรวจกับทะเบียนก่อนคัดเลือก <HelpButton>รายชื่อนี้คือผู้ที่ผ่านหลักสูตร 12 วันหรือชุมชนบำบัดแล้ว ยังไม่เคยเข้าหลักสูตร 3 วัน และยังไม่ออกจากเรือนจำ วันพ้นโทษโดยประมาณไม่รวมพักโทษหรือลดวันต้องโทษ</HelpButton></Alert>
      <div className="flex flex-wrap gap-2">
        {([["6", "เหลือโทษ ≤ 6 เดือน"], ["12", "≤ 1 ปี"], ["all", "ทั้งหมด"]] as const).map(([v, l]) => (
          <Link key={v} href={`?within=${v}`} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${(within == null ? "all" : String(within)) === v ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{l}</Link>
        ))}
      </div>
      {list.length === 0 ? <EmptyState title="ไม่มีรายชื่อแนะนำในช่วงนี้" /> : (
        <section className="card overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ-สกุล</th><th>เลขประจำตัว</th><th>แดน</th><th>ผ่านหลักสูตร</th><th>พ้นโทษโดยประมาณ</th><th>เลขบัตร</th><th /></tr></thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.incarcerationId} className="border-t border-line">
                  <td className="py-2"><Link className="underline" href={`/persons/${c.personId}`}>{c.name}</Link></td>
                  <td className="font-mono">{c.inmateNo}</td><td>{c.zone ?? "-"}</td><td>{c.courses.join(", ")}</td>
                  <td>{c.release ? `${formatThaiDate(c.release)} (${c.monthsLeft} เดือน)` : <span className="text-muted">ไม่มีข้อมูลโทษ</span>}</td>
                  <td>{c.hasNationalId ? <span className="tag-ok">มี</span> : <span className="tag-warn">ยังไม่มี (บังคับ)</span>}</td>
                  <td>{canRegister && <Link href={`/register?cohort=${row.cohort.id}&inmate=${encodeURIComponent(c.inmateNo)}`} className="btn-ghost btn-sm">ลงทะเบียน</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-sm text-muted">{list.length} คน</p>
        </section>
      )}
    </div>
  );
}
