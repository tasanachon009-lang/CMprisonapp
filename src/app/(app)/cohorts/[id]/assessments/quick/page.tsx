import { isPendingReview, PENDING_REVIEW_LABEL } from "@/lib/assessments/forms";
import { notFound, redirect } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { getForm, formAccess, versionFor } from "@/lib/services/assessments";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { defaultChannel } from "@/lib/assessments/forms";
import { todayISO } from "@/lib/thai-date";
import type { Item, ItemsScoring } from "@/lib/assessments/scoring";
import { PageHeader, Alert } from "@/components/ui";
import { AssessmentGrid } from "./grid";

export const dynamic = "force-dynamic";

/** โหมดกรอกเร็วแบบประเมิน: แถว = คน คอลัมน์ = ข้อ (สเปก 9, 10.1) — แบบเลือกข้อเดียว (แรงจูงใจ/อุณหภูมิใจ) = 1 คอลัมน์ */
export default async function QuickAssess({ params, searchParams }: PageProps<"/cohorts/[id]/assessments/quick">) {
  const auth = await requirePage();
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  const form = getForm(db, String(sp.form ?? "").toUpperCase());
  if (!row || !form || (form.kind !== "items" && form.kind !== "single")) notFound();
  if (!formAccess(auth.can, form).edit) redirect("/forbidden");
  const round = typeof sp.round === "string" && (form.rounds as string[]).includes(sp.round) ? sp.round : (form.rounds as string[])[0] ?? "pre";
  const roster = cohortRoster(db, row.cohort.id).filter((r) => (round === "pre" ? ["draft", "active"] : ["active", "completed"]).includes(r.enrollment.status));
  const existing = roster.length
    ? db.select().from(schema.assessmentResults).where(and(eq(schema.assessmentResults.formId, form.id), eq(schema.assessmentResults.round, round), inArray(schema.assessmentResults.enrollmentId, roster.map((r) => r.enrollment.id)), isNull(schema.assessmentResults.deletedAt))).all()
    : [];
  const today = todayISO();
  const v = versionFor(db, form.id, today);
  return (
    <div>
      <PageHeader en="Quick Entry" title={`กรอกเร็ว: ${form.shortName} (${ROUND_LABEL[round]})`} subtitle={`${row.course.shortName} รุ่นที่ ${row.cohort.number}/${row.cohort.fiscalYear} · ${roster.length} คน`} />
      {isPendingReview(form.code) && <div className="mb-3"><Alert tone="warn"><b>{PENDING_REVIEW_LABEL}</b> — กรอกตามเลขข้อในแบบกระดาษ</Alert></div>}
      <AssessmentGrid
        cohortId={row.cohort.id}
        formId={form.id}
        round={round}
        today={today}
        kind={form.kind as "items" | "single"}
        items={form.kind === "single" ? [{ no: 1, text: form.shortName }] : (v.items as Item[])}
        scoring={v.scoring as unknown as ItemsScoring}
        defaultChannel={defaultChannel(form.code)}
        lastLocation={existing.find((e) => e.paperLocation)?.paperLocation ?? ""}
        people={roster.map((r) => ({ enrollmentId: r.enrollment.id, name: `${r.person.firstName} ${r.person.lastName}`, inmateNo: r.inc.inmateNo, thumb: r.inc.thumbPath ? `/api/files/photo/${r.inc.id}?s=thumb` : null, duplicateName: r.duplicateName }))}
        existing={Object.fromEntries(existing.map((e) => [e.enrollmentId, form.kind === "single" ? { "1": (e.answers as { value: number }).value } : (e.answers as Record<string, number>)]))}
      />
    </div>
  );
}
