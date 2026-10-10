import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { enrollmentContext } from "@/lib/queries/enrollment";
import { referralOf, markReferralPrinted, physicalText, coverageLabel } from "@/lib/services/health-referral";
import { ageOn, formatThaiDate, todayISO } from "@/lib/thai-date";
import { maskNationalId } from "@/lib/thai-id";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

const Line = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <p style={{ margin: "6px 0" }}><b>{label}</b> {children || "-"}</p>
);

/** ใบส่งต่อข้อมูลสุขภาพรายบุคคล (สเปก 17 กิจกรรม 11) — พิมพ์ได้เฉพาะผู้มีสิทธิ์ข้อมูลสุขภาพ บันทึกการพิมพ์ทุกครั้ง */
export default async function ReferralSlip({ params }: PageProps<"/print/referral/[id]">) {
  const auth = await requirePage("health.view");
  const { id } = await params;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  const r = ctx ? referralOf(db, ctx.e.id) : null;
  if (!ctx || !r || !r.needsReferral) notFound();
  const footer = await logPrint(auth, "health_referral", r.id, ctx.p.id);
  markReferralPrinted(db, [r.id], auth.user.id);
  const nid = auth.can("national_id.view_full") ? ctx.p.nationalId ?? "-" : maskNationalId(ctx.p.nationalId);
  return (
    <div className="sheet">
      <DocHeader title="ใบส่งต่อข้อมูลสุขภาพเพื่อการรักษาต่อเนื่องหลังพ้นโทษ" subtitle={`${ctx.course.name} ${ctx.label}`} />
      <p className="right" style={{ margin: "4px 0 10px" }}>วันที่บันทึก {formatThaiDate(r.recordedDate, "long")}</p>
      <Line label="ชื่อ-สกุล">{ctx.name}</Line>
      <Line label="เลขประจำตัวประชาชน">{nid} &nbsp; <b>วันเกิด</b> {ctx.p.birthDate ? `${formatThaiDate(ctx.p.birthDate)} (อายุ ${ageOn(ctx.p.birthDate, todayISO())} ปี)` : "-"}</Line>
      <Line label="เลขประจำตัวผู้ต้องขัง">{ctx.inc.inmateNo}</Line>
      <h2 style={{ marginTop: 14 }}>ข้อมูลสุขภาพ</h2>
      <Line label="ปัญหาสุขภาพกาย:">{physicalText(r)}</Line>
      <Line label="ปัญหาสุขภาพจิต:">{r.mental}</Line>
      <Line label="แผนการรักษาหลังพ้นโทษ:"><span style={{ whiteSpace: "pre-wrap" }}>{r.treatmentPlan}</span></Line>
      <Line label="สิทธิการรักษา:">{r.coverage ? `${coverageLabel(r.coverage)}${r.coverageNote ? ` (${r.coverageNote})` : ""}` : ""}</Line>
      <Line label="โรงพยาบาลที่จะรักษาต่อ:">{r.hospital}</Line>
      <Line label="ยาที่ต้องเตรียมให้ก่อนพ้นโทษ:"><span style={{ whiteSpace: "pre-wrap" }}>{r.medications}</span></Line>
      <div style={{ display: "flex", justifyContent: "space-around", marginTop: "22mm", textAlign: "center", breakInside: "avoid" }}>
        <div><p>ลงชื่อ ........................................ ผู้รับการส่งต่อ</p><p>({ctx.name})</p></div>
        <div><p>ลงชื่อ ........................................ เจ้าหน้าที่สถานพยาบาล</p><p>(........................................)</p></div>
      </div>
      <DocFooter text={footer} />
    </div>
  );
}
