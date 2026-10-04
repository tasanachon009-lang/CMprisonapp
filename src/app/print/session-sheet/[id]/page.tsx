import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { sessionRoster } from "@/lib/services/attendance";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

const COLS = ["มา", "ขาด", "ลา", "ป่วย", "เหตุราชทัณฑ์"];

/** ใบเช็คชื่อรายคาบ (ใช้คู่กับกระดาษ / ชุดฉุกเฉิน) */
export default async function SessionSheet({ params }: PageProps<"/print/session-sheet/[id]">) {
  const auth = await requirePage();
  const { id } = await params;
  const db = getDb();
  let data;
  try { data = sessionRoster(db, Number(id)); } catch { notFound(); }
  if (!sessionAccess(auth, data.session.id, data.session.cohortId).canView) redirect("/forbidden");
  const { cohort, course } = getCohort(db, data.session.cohortId)!;
  const footer = await logPrint(auth, "session_sheet", data.session.id);
  const s = data.session;
  return (
    <div className="sheet">
      <DocHeader title="ใบเช็คชื่อผู้เข้ารับการฟื้นฟู" subtitle={`${course.name} ${cohortLabel(cohort)}`} />
      <p>กิจกรรม: <b>{s.title}</b> · {formatThaiDate(s.date, "full")} เวลา {s.startTime}–{s.endTime} น. {s.location ? `· ${s.location}` : ""}</p>
      <table style={{ marginTop: 6 }}>
        <thead>
          <tr><th style={{ width: "8%" }}>ที่</th><th>ชื่อ-สกุล</th><th style={{ width: "14%" }}>เลขประจำตัว</th>{COLS.map((c) => <th key={c} style={{ width: "7%" }} className="center">{c}</th>)}<th style={{ width: "14%" }}>หมายเหตุ</th></tr>
        </thead>
        <tbody>
          {data.rows.map((r, i) => (
            <tr key={r.enrollmentId}>
              <td className="center">{i + 1}</td>
              <td>{r.prefix}{r.firstName} {r.lastName}{r.duplicateName ? " (ชื่อซ้ำ)" : ""}</td>
              <td>{r.inmateNo}</td>
              {COLS.map((c) => <td key={c} className="center">☐</td>)}
              <td />
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: 16 }}>ลงชื่อ ...................................................... ผู้เช็คชื่อ &nbsp;&nbsp; วันที่ ....................</p>
      <DocFooter text={footer} />
    </div>
  );
}
