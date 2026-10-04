import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { SignatureBlock } from "../../pieces";

export const dynamic = "force-dynamic";

/** ใบรับรองการผ่านหลักสูตร (เฉพาะผู้ครบหลักสูตร) */
export default async function Certificates({ params }: PageProps<"/print/certificates/[cohortId]">) {
  const auth = await requirePage("reports.view");
  const { cohortId } = await params;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row) notFound();
  await logPrint(auth, "certificates", row.cohort.id);
  const people = cohortRoster(db, row.cohort.id).filter((r) => r.enrollment.status === "completed");
  const org = getSetting(db, "org.name", "");
  const unit = getSetting(db, "org.unitName", "");
  const head = getSetting(db, "org.headTitle", "ผู้บัญชาการเรือนจำ");
  return (
    <>
      {people.length === 0 && <div className="sheet">ยังไม่มีผู้ครบหลักสูตรในรุ่นนี้</div>}
      {people.map((p) => (
        <div className="sheet center" key={p.enrollment.id} style={{ border: "6px double #3D5590", paddingTop: "30mm" }}>
          <p style={{ fontSize: "1.2em" }}>{unit} {org}</p>
          <h1 style={{ fontSize: "2em", marginTop: 16 }}>ใบรับรองการผ่านหลักสูตร</h1>
          <p style={{ marginTop: 24 }}>ขอรับรองว่า</p>
          <p style={{ fontSize: "1.8em", fontWeight: 700, marginTop: 8 }}>{p.person.prefix}{p.person.firstName} {p.person.lastName}</p>
          <p style={{ marginTop: 16 }}>ได้ผ่านการอบรม{row.course.name}</p>
          <p>{cohortLabel(row.cohort)} ระหว่างวันที่ {formatThaiDate(row.cohort.startDate, "long")} ถึง {formatThaiDate(row.cohort.endDate, "long")}</p>
          <p style={{ marginTop: 8 }}>ขอให้มีความมุ่งมั่นในการดำเนินชีวิตที่ดีต่อไป</p>
          <p style={{ marginTop: 16 }}>ให้ไว้ ณ วันที่ {formatThaiDate(p.enrollment.leftDate ?? row.cohort.endDate, "long")}</p>
          <SignatureBlock lines={[{ role: "หัวหน้าสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด" }, { role: head }]} />
        </div>
      ))}
    </>
  );
}
