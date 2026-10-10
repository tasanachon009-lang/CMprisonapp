import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { cohortReferrals, usesHealthReferral, physicalText, coverageLabel } from "@/lib/services/health-referral";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/** รายการผู้ต้องส่งต่อข้อมูลสุขภาพของรุ่น สำหรับสถานพยาบาล (สเปก 17 กิจกรรม 11) — เฉพาะผู้มีสิทธิ์ข้อมูลสุขภาพ */
export default async function ReferralList({ params }: PageProps<"/print/referral-list/[cohortId]">) {
  const auth = await requirePage("health.view");
  const { cohortId } = await params;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row || !usesHealthReferral(row.course.code)) notFound();
  const all = cohortReferrals(db, row.cohort.id);
  const list = all.filter((x) => x.referral?.needsReferral);
  const pending = all.filter((x) => !x.referral).length;
  const footer = await logPrint(auth, "health_referral_list", row.cohort.id);
  return (
    <div className="sheet">
      <DocHeader title="รายการผู้ต้องส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ" subtitle={`${row.course.name} ${cohortLabel(row.cohort)} (${formatThaiDate(row.cohort.startDate)} – ${formatThaiDate(row.cohort.endDate)})`} />
      <p>ผู้เข้าอบรม {all.length} คน · ต้องส่งต่อ {list.length} คน{pending ? ` · ยังไม่บันทึก ${pending} คน` : ""}</p>
      {list.length === 0 ? <p className="center muted" style={{ marginTop: 20 }}>ไม่มีผู้ต้องส่งต่อ</p> : (
        <table style={{ marginTop: 6 }}>
          <thead><tr><th style={{ width: "8mm" }}>ที่</th><th>ชื่อ-สกุล</th><th>เลขประจำตัว</th><th>ปัญหาสุขภาพ</th><th>สิทธิการรักษา</th><th>รพ. ที่จะรักษาต่อ</th><th>ยาที่ต้องเตรียม</th></tr></thead>
          <tbody>
            {list.map((x, i) => {
              const r = x.referral!;
              return (
                <tr key={x.enrollmentId}>
                  <td className="center">{i + 1}</td><td>{x.name}</td><td>{x.inmateNo}</td>
                  <td>{[physicalText(r), r.mental ? `สุขภาพจิต: ${r.mental}` : ""].filter(Boolean).join(" · ")}</td>
                  <td>{r.coverage ? coverageLabel(r.coverage) : "-"}</td><td>{r.hospital ?? "-"}</td><td>{r.medications ?? "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <DocFooter text={footer} />
    </div>
  );
}
