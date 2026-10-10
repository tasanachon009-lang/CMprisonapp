import { isPendingReview, PENDING_REVIEW_LABEL } from "@/lib/assessments/forms";
import { notFound, redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { enrollmentContext } from "@/lib/queries/enrollment";
import { getForm, formAccess, versionFor } from "@/lib/services/assessments";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { defaultChannel } from "@/lib/assessments/forms";
import { todayISO, formatThaiDateTime } from "@/lib/thai-date";
import { userNameMap } from "@/lib/queries/names";
import { writeAudit } from "@/lib/audit";
import { clientIp } from "@/lib/auth/session";
import { Breadcrumb, PageHeader, Alert, RecordMeta } from "@/components/ui";
import { AssessmentForm } from "@/components/assessment-form";
import type { Item } from "@/lib/assessments/scoring";

export const dynamic = "force-dynamic";

export default async function AssessPage({ params, searchParams }: PageProps<"/enrollments/[id]/assess/[code]">) {
  const auth = await requirePage();
  const { id, code } = await params;
  const sp = await searchParams;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  const form = getForm(db, code.toUpperCase());
  if (!ctx || !form) notFound();
  const access = formAccess(auth.can, form);
  if (!access.view) redirect("/forbidden");
  const round = typeof sp.round === "string" && (form.rounds as string[]).includes(sp.round) ? sp.round : (form.rounds as string[])[0];
  const period = typeof sp.period === "string" ? sp.period : "";
  const existing = db
    .select()
    .from(schema.assessmentResults)
    .where(and(eq(schema.assessmentResults.enrollmentId, ctx.e.id), eq(schema.assessmentResults.formId, form.id), eq(schema.assessmentResults.round, round), eq(schema.assessmentResults.period, period), isNull(schema.assessmentResults.deletedAt)))
    .get();
  const date = existing?.assessedDate ?? todayISO();
  const version = existing ? db.select().from(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.id, existing.versionId)).get()! : versionFor(db, form.id, date);
  if (form.sensitive && existing) {
    // เปิดดูข้อมูลสุขภาพ → บันทึกการเปิดดู
    writeAudit(db, { userId: auth.user.id, action: "view_sensitive", entity: "assessment", entityId: existing.id, personId: ctx.p.id, ip: await clientIp() });
  }
  const names = userNameMap(db);
  return (
    <div className="max-w-5xl">
      <Breadcrumb items={[{ href: `/cohorts/${ctx.c.id}`, label: `${ctx.course.shortName} ${ctx.label}` }, { href: `/enrollments/${ctx.e.id}`, label: ctx.name }, { label: form.shortName }]} />
      <PageHeader en="Assessment" title={form.name} subtitle={`${ctx.name} · ${ctx.inc.inmateNo} · รอบ${ROUND_LABEL[round] ?? round}${period ? ` ${period}` : ""}`} />
      {form.sensitive && <div className="mb-3"><Alert tone="warn">ข้อมูลสุขภาพ — เห็นเฉพาะสถานพยาบาลและผู้ดูแล การเปิดดูถูกบันทึกไว้</Alert></div>}
      {isPendingReview(form.code) && <div className="mb-3"><Alert tone="warn"><b>{PENDING_REVIEW_LABEL}</b> — ข้อคำถามและเกณฑ์ของแบบนี้ทำตามรายละเอียดในสเปก ยังไม่ได้เทียบกับแบบฟอร์มของหน่วยงาน</Alert></div>}
      {!access.edit && <div className="mb-3"><Alert tone="info">ดูอย่างเดียว</Alert></div>}
      {existing && <div className="mb-3"><RecordMeta createdBy={names.get(existing.createdBy ?? 0)} createdAt={formatThaiDateTime(existing.createdAt)} updatedBy={names.get(existing.updatedBy ?? 0)} updatedAt={formatThaiDateTime(existing.updatedAt)} /></div>}
      <AssessmentForm
        enrollmentId={ctx.e.id}
        form={{ id: form.id, code: form.code, name: form.name, kind: form.kind, description: form.description }}
        version={{ items: version.items as Item[], scoring: version.scoring as Record<string, unknown> }}
        round={round}
        period={period}
        today={todayISO()}
        initial={existing ? { answers: existing.answers, assessedDate: existing.assessedDate, version: existing.version, channel: existing.channel, paperLocation: existing.paperLocation } : null}
        defaultChannel={defaultChannel(form.code)}
        readOnly={!access.edit}
        backHref={`/enrollments/${ctx.e.id}`}
      />
    </div>
  );
}
