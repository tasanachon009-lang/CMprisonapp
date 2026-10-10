import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage, clientIp } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { enrollmentContext } from "@/lib/queries/enrollment";
import { referralOf, usesHealthReferral, PHYSICAL_PROBLEMS, COVERAGE } from "@/lib/services/health-referral";
import { userNameMap } from "@/lib/queries/names";
import { writeAudit } from "@/lib/audit";
import { todayISO, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, RecordMeta } from "@/components/ui";
import { ReferralForm } from "./referral-form";

export const dynamic = "force-dynamic";

/** บันทึกส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ (สเปก 17 กิจกรรม 11) — เฉพาะสถานพยาบาล/ผู้ดูแล */
export default async function ReferralPage({ params }: PageProps<"/enrollments/[id]/referral">) {
  const auth = await requirePage("health.view");
  const { id } = await params;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  if (!ctx) notFound();
  if (!usesHealthReferral(ctx.course.code)) return <Alert tone="info">หลักสูตรนี้ไม่มีกิจกรรมส่งต่อข้อมูลสุขภาพ (ใช้กับหลักสูตรฟื้นฟูก่อนพ้นโทษ 3 วัน)</Alert>;
  const existing = referralOf(db, ctx.e.id);
  if (existing) writeAudit(db, { userId: auth.user.id, action: "view_sensitive", entity: "health_referral", entityId: existing.id, personId: ctx.p.id, ip: await clientIp() });
  const canEdit = (auth.can("health.edit") || auth.can("health.mental_edit")) && ["active", "completed"].includes(ctx.e.status);
  const names = userNameMap(db);
  return (
    <div className="max-w-3xl">
      <Breadcrumb items={[{ href: `/cohorts/${ctx.c.id}/health`, label: `${ctx.course.shortName} ${ctx.label} · สถานพยาบาล` }, { href: `/enrollments/${ctx.e.id}`, label: ctx.name }, { label: "ส่งต่อข้อมูลสุขภาพ" }]} />
      <PageHeader en="Health referral" title="ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ" subtitle={`${ctx.name} · ${ctx.inc.inmateNo}`}
        actions={existing?.needsReferral ? <Link href={`/print/referral/${ctx.e.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์ใบส่งต่อ</Link> : undefined} />
      <div className="mb-3 space-y-2">
        <Alert tone="warn">ข้อมูลสุขภาพ — เห็นเฉพาะสถานพยาบาลและผู้ดูแล การเปิดดูและการพิมพ์ถูกบันทึกไว้ · ไม่เชื่อมกับระบบ HIV ภายนอก</Alert>
        {!["active", "completed"].includes(ctx.e.status) && <Alert tone="info">ยังไม่ได้ยืนยันรับเข้ารุ่น — บันทึกส่งต่อได้หลังเจ้าหน้าที่ฟื้นฟูยืนยันรับเข้า</Alert>}
        {existing && <RecordMeta createdBy={names.get(existing.createdBy ?? 0)} createdAt={formatThaiDateTime(existing.createdAt)} updatedBy={names.get(existing.updatedBy ?? 0)} updatedAt={formatThaiDateTime(existing.updatedAt)} />}
      </div>
      <ReferralForm
        enrollmentId={ctx.e.id}
        today={todayISO()}
        readOnly={!canEdit}
        canEditPhysical={auth.can("health.edit")}
        physicalOptions={PHYSICAL_PROBLEMS.map((p) => ({ ...p }))}
        coverageOptions={COVERAGE.map((p) => ({ ...p }))}
        backHref={`/cohorts/${ctx.c.id}/health`}
        initial={existing ? {
          version: existing.version, recordedDate: existing.recordedDate, needsReferral: existing.needsReferral, physical: existing.physical ?? [], physicalOther: existing.physicalOther ?? "",
          mental: existing.mental ?? "", treatmentPlan: existing.treatmentPlan ?? "", coverage: existing.coverage ?? "", coverageNote: existing.coverageNote ?? "", hospital: existing.hospital ?? "", medications: existing.medications ?? "",
        } : null}
      />
    </div>
  );
}
