import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { maskNationalId } from "@/lib/thai-id";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";
import { SignatureBlock } from "../../pieces";

export const dynamic = "force-dynamic";

/**
 * รายชื่อผู้เข้าร่วมพร้อมเลขบัตรประชาชน (สเปก 18.4 — หลักสูตร 3 วัน)
 * เลขบัตรเต็มเฉพาะผู้มีสิทธิ์ national_id.view_full (ไม่มีสิทธิ์ = ปิดบัง) · บันทึกการพิมพ์ทุกครั้ง
 */
export default async function Participants({ params }: PageProps<"/print/participants/[cohortId]">) {
  const auth = await requirePage("docs.view");
  if (!auth.can("registry.view")) notFound();
  const { cohortId } = await params;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row || row.course.code !== "PRE3") notFound();
  const full = auth.can("national_id.view_full");
  const people = cohortRoster(db, row.cohort.id).filter((r) => ["active", "completed"].includes(r.enrollment.status));
  const footer = await logPrint(auth, full ? "participants_national_id" : "participants_masked", row.cohort.id);
  const noId = people.filter((p) => !p.person.nationalId).length;
  return (
    <div className="sheet">
      <DocHeader title="รายชื่อผู้เข้าร่วมโครงการ" subtitle={`${row.course.name} ${cohortLabel(row.cohort)} (${formatThaiDate(row.cohort.startDate)} – ${formatThaiDate(row.cohort.endDate)})`} />
      <p>จำนวน {people.length} คน{noId ? ` · ไม่มีเลขบัตรในระบบ ${noId} คน` : ""}{full ? "" : " · เลขบัตรแสดงแบบปิดบัง"}</p>
      {people.length === 0 ? <p className="center muted" style={{ marginTop: 20 }}>ยังไม่มีผู้ที่ยืนยันรับเข้า</p> : (
        <table style={{ marginTop: 6 }}>
          <thead><tr><th style={{ width: "10mm" }}>ที่</th><th>ชื่อ-สกุล</th><th style={{ width: "30mm" }}>เลขประจำตัวผู้ต้องขัง</th><th style={{ width: "44mm" }}>เลขประจำตัวประชาชน</th><th style={{ width: "28mm" }}>ผลการอบรม</th><th style={{ width: "26mm" }}>หมายเหตุ</th></tr></thead>
          <tbody>
            {people.map((p, i) => (
              <tr key={p.enrollment.id}>
                <td className="center">{i + 1}</td>
                <td>{p.person.prefix}{p.person.firstName} {p.person.lastName}</td>
                <td className="center">{p.inc.inmateNo}</td>
                <td className="center">{p.person.nationalId ? (full ? p.person.nationalId : maskNationalId(p.person.nationalId)) : "-"}</td>
                <td className="center">{ENROLLMENT_STATUS_LABEL[p.enrollment.status] ?? p.enrollment.status}</td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <SignatureBlock lines={[{ role: "ผู้จัดทำ" }, { role: "ผู้ตรวจสอบ" }]} />
      <DocFooter text={footer} />
    </div>
  );
}
