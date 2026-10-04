import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster, cohortSessions } from "@/lib/queries/cohorts";
import { cohortAttendanceSummary } from "@/lib/services/attendance";
import { listForms, resultsOf } from "@/lib/services/assessments";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { cohortLabel } from "@/lib/services/cohorts";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";
import { SignatureBlock } from "../../pieces";

export const dynamic = "force-dynamic";

/** รายงานรายรุ่น (สเปก 18.1) + ตรวจความสอดคล้องตัวเลขก่อนออกรายงาน (สเปก 22A) */
export default async function CohortPrint({ params }: PageProps<"/print/cohort/[id]">) {
  const auth = await requirePage("reports.view", "dashboard.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const { cohort, course } = row;
  const roster = cohortRoster(db, cohort.id);
  const att = cohortAttendanceSummary(db, cohort.id, course.passAttendancePct, course.totalHours);
  const sessions = cohortSessions(db, cohort.id);
  const named = auth.can("reports.view");
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(course.code) && !f.sensitive);
  const results = resultsOf(db, roster.map((r) => r.enrollment.id), (p) => p === "assessment.view");
  const footer = await logPrint(auth, "cohort_report", cohort.id);

  const count = (s: string) => roster.filter((r) => r.enrollment.status === s).length;
  const entered = roster.filter((r) => r.enrollment.status !== "draft").length;
  const completed = count("completed");
  const notCompleted = count("dropped") + count("failed") + count("withdrawn");
  const remaining = count("active");
  const consistent = entered === completed + notCompleted + remaining;
  const avg = (formId: number, round: string) => {
    const v = results.filter((r) => r.f.id === formId && r.r.round === round && r.r.total != null).map((r) => r.r.total!);
    return v.length ? `${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)} (n=${v.length})` : "-";
  };

  return (
    <div className="sheet">
      <DocHeader title="รายงานผลการดำเนินงานรายรุ่น" subtitle={`${course.name} ${cohortLabel(cohort)} · ${formatThaiDate(cohort.startDate)} – ${formatThaiDate(cohort.endDate)}`} />
      <h2>1. สรุปจำนวน</h2>
      <table>
        <tbody>
          <tr><td>เข้ารับการฟื้นฟู (ยืนยันรับเข้า)</td><td className="right">{entered} คน</td></tr>
          <tr><td>ครบหลักสูตร</td><td className="right">{completed} คน</td></tr>
          <tr><td>ไม่จบ (ออกก่อนกำหนด {count("dropped")} / ไม่ผ่าน {count("failed")} / ถอนตัว {count("withdrawn")})</td><td className="right">{notCompleted} คน</td></tr>
          <tr><td>คงเหลือ (กำลังอบรม)</td><td className="right">{remaining} คน</td></tr>
          <tr><td>กิจกรรมทั้งหมด</td><td className="right">{sessions.length} คาบ · {sessions.reduce((s, x) => s + x.hours, 0)} ชั่วโมง</td></tr>
        </tbody>
      </table>
      {!consistent && <p style={{ color: "#b00" }}>⚠ ตัวเลขไม่สอดคล้อง: เข้า ≠ จบ + ไม่จบ + คงเหลือ — กรุณาตรวจสถานะรายคนก่อนส่งรายงาน</p>}

      <h2>2. คะแนนเฉลี่ยก่อน-หลัง</h2>
      <table>
        <thead><tr><th>แบบประเมิน</th><th>ก่อนเรียน</th><th>หลังเรียน</th></tr></thead>
        <tbody>{forms.filter((f) => (f.rounds as string[]).includes("pre")).map((f) => <tr key={f.id}><td>{f.shortName}</td><td className="center">{avg(f.id, "pre")}</td><td className="center">{(f.rounds as string[]).includes("post") ? avg(f.id, "post") : "-"}</td></tr>)}</tbody>
      </table>

      {named && (
        <>
          <h2 className="page-break">3. รายชื่อและสถานะ</h2>
          <table>
            <thead><tr><th>ที่</th><th>ชื่อ-สกุล</th><th>เลขประจำตัว</th><th>สถานะ</th><th>เข้าร่วม</th></tr></thead>
            <tbody>
              {roster.map((r, i) => {
                const s = att.get(r.enrollment.id);
                return <tr key={r.enrollment.id}><td className="center">{i + 1}</td><td>{r.person.prefix}{r.person.firstName} {r.person.lastName}</td><td>{r.inc.inmateNo}</td><td>{ENROLLMENT_STATUS_LABEL[r.enrollment.status]}</td><td className="center">{s?.pct != null ? `${s.pct}%` : "-"}</td></tr>;
              })}
            </tbody>
          </table>
        </>
      )}
      <SignatureBlock lines={[{ role: "ผู้จัดทำ" }, { role: "ผู้ตรวจสอบ" }]} />
      <DocFooter text={footer} />
    </div>
  );
}
