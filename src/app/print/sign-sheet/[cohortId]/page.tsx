import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster, cohortSessions } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/** ใบลงทะเบียน/เซ็นชื่อรายวัน (ช่องเช้า-บ่าย) */
export default async function SignSheet({ params, searchParams }: PageProps<"/print/sign-sheet/[cohortId]">) {
  const auth = await requirePage("course.view");
  const { cohortId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row) notFound();
  const days = Array.from(new Set(cohortSessions(db, row.cohort.id).map((s) => s.date)));
  const date = typeof sp.date === "string" && days.includes(sp.date) ? sp.date : days.includes(todayISO()) ? todayISO() : days[0];
  const people = cohortRoster(db, row.cohort.id).filter((r) => ["draft", "active", "completed"].includes(r.enrollment.status) && (!r.enrollment.leftDate || r.enrollment.leftDate > (date ?? "")));
  const footer = await logPrint(auth, "sign_sheet", row.cohort.id);
  return (
    <div className="sheet">
      <DocHeader title="ใบลงลายมือชื่อผู้เข้ารับการฟื้นฟู" subtitle={`${row.course.name} ${cohortLabel(row.cohort)}`} />
      <p className="center">วันที่ {date ? formatThaiDate(date, "full") : "........................"} (วันที่ {days.indexOf(date ?? "") + 1} ของหลักสูตร)</p>
      <table style={{ marginTop: 6 }}>
        <thead><tr><th style={{ width: "7%" }}>ที่</th><th>ชื่อ-สกุล</th><th style={{ width: "15%" }}>เลขประจำตัว</th><th style={{ width: "22%" }}>ลายมือชื่อ (เช้า)</th><th style={{ width: "22%" }}>ลายมือชื่อ (บ่าย)</th></tr></thead>
        <tbody>
          {people.map((r, i) => (
            <tr key={r.enrollment.id} style={{ height: "9mm" }}>
              <td className="center">{i + 1}</td><td>{r.person.prefix}{r.person.firstName} {r.person.lastName}{r.duplicateName ? " (ชื่อซ้ำ — ดูเลขประจำตัว)" : ""}</td><td>{r.inc.inmateNo}</td><td /><td />
            </tr>
          ))}
        </tbody>
      </table>
      <DocFooter text={footer} />
    </div>
  );
}
