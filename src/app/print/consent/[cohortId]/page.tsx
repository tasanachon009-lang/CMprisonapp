import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";
import { DEFAULT_CONSENT_TEXT, DEFAULT_CONSENT_TITLE, fillConsent } from "@/lib/consent-text";

export const dynamic = "force-dynamic";

export default async function ConsentForms({ params, searchParams }: PageProps<"/print/consent/[cohortId]">) {
  const auth = await requirePage("registry.edit");
  const { cohortId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row) notFound();
  const org = getSetting(db, "org.name", "");
  const unit = getSetting(db, "org.unitName", "");
  // ข้อความแก้ได้ที่ ตั้งค่า → แบบฟอร์มยินยอม (pdpa.consentTitle / pdpa.consentText)
  const text = (getSetting<string[] | null>(db, "pdpa.consentText", null) ?? DEFAULT_CONSENT_TEXT).map((t) => fillConsent(t, org, unit));
  const title = fillConsent(getSetting<string | null>(db, "pdpa.consentTitle", null) ?? DEFAULT_CONSENT_TITLE, org, unit);
  // ค่าเริ่มต้น: เฉพาะคนที่ยังไม่มีหลักฐานยินยอม · ?all=1 พิมพ์ทุกคน · ?blank=1 ฟอร์มเปล่า 1 แผ่น
  const people = sp.blank ? [null] : cohortRoster(db, row.cohort.id).filter((r) => sp.all || !r.enrollment.consentSigned);
  const footer = await logPrint(auth, "consent_form", row.cohort.id);
  return (
    <>
      {people.length === 0 && <div className="sheet"><p>ทุกคนในรุ่นนี้มีหลักฐานการยินยอมแล้ว — ถ้าต้องการพิมพ์ทุกคนให้เพิ่ม ?all=1 ท้ายที่อยู่</p></div>}
      {people.map((r, i) => (
        <div className="sheet" key={r?.enrollment.id ?? i}>
          <DocHeader title={title} subtitle={`${row.course.name} ${cohortLabel(row.cohort)}`} />
          <p style={{ marginTop: 16 }}>ข้าพเจ้า {r ? <b>{r.person.prefix}{r.person.firstName} {r.person.lastName}</b> : "................................................................"} เลขประจำตัวผู้ต้องขัง {r ? <b>{r.inc.inmateNo}</b> : "...................."}</p>
          {text.map((t, j) => <p key={j} style={{ textIndent: "2.5em", marginTop: 8 }}>{t}</p>)}
          <p style={{ marginTop: 16 }}>☐ ยินยอม &nbsp;&nbsp;&nbsp; ☐ ไม่ยินยอม เนื่องจาก ................................................................</p>
          <div style={{ marginTop: 40, marginLeft: "45%" }}>
            <p>ลงชื่อ ...................................................... ผู้ให้ความยินยอม</p>
            <p style={{ marginLeft: "3em" }}>({r ? `${r.person.prefix ?? ""}${r.person.firstName} ${r.person.lastName}` : "......................................................"})</p>
            <p style={{ marginTop: 20 }}>ลงชื่อ ...................................................... เจ้าหน้าที่ผู้รับเอกสาร</p>
            <p style={{ marginLeft: "3em" }}>(......................................................)</p>
            <p>วันที่ ........ เดือน .................... พ.ศ. ..........</p>
          </div>
          <DocFooter text={footer} />
        </div>
      ))}
    </>
  );
}
