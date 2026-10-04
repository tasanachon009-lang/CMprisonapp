import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { enrollmentContext, bstOf, medicalNotesOf, behaviorNotesOf } from "@/lib/queries/enrollment";
import { listForms, resultsOf, formAccess } from "@/lib/services/assessments";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { SYSTEM_LABEL, STEP_LABEL, TASK_STATUS_LABEL } from "@/lib/services/followup";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { userNameMap } from "@/lib/queries/names";
import { lookupLabel } from "@/lib/bootstrap";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, Alert, EmptyState, Eyebrow } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MedicalNoteForm, ExternalIdForm, TaskToggle, FollowupForm, CompleteButton, IntakePanel } from "./enrollment-client";
import { BehaviorNoteButton } from "@/components/behavior-note";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { ok: "tag-ok", warn: "tag-warn", danger: "tag-danger" };

/** แฟ้มการอบรม 1 รอบ: แบบประเมิน · สถานพยาบาล · บสต./ติดตาม · พฤติกรรม */
export default async function EnrollmentPage({ params }: PageProps<"/enrollments/[id]">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  if (!ctx) notFound();
  const { e, inc, p, c, course } = ctx;
  const today = todayISO();
  const names = userNameMap(db);
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(course.code)).map((f) => ({ f, access: formAccess(auth.can, f) })).filter((x) => x.access.view);
  const results = resultsOf(db, [e.id], auth.can);
  const canHealth = auth.can("health.view");
  const bst = bstOf(db, e.id);
  const notes = canHealth ? medicalNotesOf(db, e.id) : [];
  const behaviors = behaviorNotesOf(db, inc.id).filter((b) => b.enrollmentId === e.id || !b.enrollmentId);

  return (
    <div className="space-y-6">
      <Breadcrumb items={[
        { href: "/courses", label: "หลักสูตร" },
        { href: `/cohorts/${c.id}`, label: `${course.shortName} ${ctx.label}` },
        { href: `/cohorts/${c.id}/roster`, label: "รายชื่อ" },
        { label: ctx.name },
      ]} />
      <section className="card flex flex-wrap items-center gap-4">
        <Avatar first={p.firstName} last={p.lastName} src={inc.photoPath ? `/api/files/photo/${inc.id}` : null} size={72} color="var(--lime)" />
        <div className="flex-1">
          <Eyebrow>Member File</Eyebrow>
          <h1 className="text-2xl">{ctx.name}</h1>
          <p className="text-muted">เลขประจำตัว {inc.inmateNo} · {course.name} {ctx.label} · <span className="font-semibold">{ENROLLMENT_STATUS_LABEL[e.status]}</span>{e.leftDate ? ` (${formatThaiDate(e.leftDate)})` : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {auth.can("behavior.edit") && <BehaviorNoteButton incarcerationId={inc.id} enrollmentId={e.id} name={ctx.name} />}
          {auth.can("registry.edit") && e.status === "active" && <CompleteButton cohortId={c.id} enrollmentId={e.id} defaultDate={c.endDate <= today ? c.endDate : today} />}
          <Link href={`/persons/${p.id}`} className="btn-ghost">หน้าบุคคล</Link>
          {auth.can("reports.view") && <Link href={`/print/person/${p.id}`} target="_blank" className="btn-ghost">พิมพ์รายงานรายบุคคล</Link>}
        </div>
      </section>

      <section className="card">
        <IntakePanel
          enrollmentId={e.id}
          score={e.screeningScore}
          exclusions={((e.intake as { exclusions?: string[] } | null)?.exclusions) ?? []}
          criteria={course.intakeCriteria as never}
          consentSigned={e.consentSigned}
          consentDate={e.consentDate}
          today={today}
          canEdit={auth.can("registry.edit") && ["draft", "active"].includes(e.status)}
        />
      </section>

      <section className="card">
        <h2 className="text-xl">แบบประเมิน</h2>
        <p className="text-sm text-muted">ผูกกับการลงทะเบียนครั้งนี้เท่านั้น — คะแนนจากการต้องโทษรอบก่อนไม่ถูกนำมาใช้</p>
        <div className="mt-3 overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>แบบประเมิน</th>{["pre", "post", "monthly"].map((r) => <th key={r}>{ROUND_LABEL[r]}</th>)}</tr></thead>
            <tbody>
              {forms.map(({ f, access }) => (
                <tr key={f.id}>
                  <td className="font-medium">{f.shortName} {f.sensitive && <span className="tag-orange ml-1">สุขภาพ</span>}</td>
                  {["pre", "post", "monthly"].map((round) => {
                    if (!(f.rounds as string[]).includes(round) || (round === "monthly" && course.code !== "FAST")) return <td key={round} className="text-muted">—</td>;
                    const r = results.find((x) => x.f.id === f.id && x.r.round === round);
                    return (
                      <td key={round}>
                        {r ? (
                          <Link href={`/enrollments/${e.id}/assess/${f.code}?round=${round}`} className="inline-flex flex-wrap items-center gap-1 hover:underline">
                            {r.r.total != null && <b className="font-display text-navy">{r.r.total}</b>}
                            <span className={TONE[r.r.tone ?? ""] ?? "tag-muted"}>{r.r.level ?? "บันทึกแล้ว"}</span>
                            <span className="text-xs text-muted">{formatThaiDate(r.r.assessedDate)}</span>
                          </Link>
                        ) : access.edit ? (
                          <Link href={`/enrollments/${e.id}/assess/${f.code}?round=${round}`} className="btn-ghost btn-sm">บันทึก</Link>
                        ) : <span className="text-muted">ยังไม่ทำ</span>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {canHealth && (
        <section className="card">
          <h2 className="text-xl">ความเห็นเจ้าหน้าที่สถานพยาบาล <span className="tag-orange ml-1 align-middle text-sm">ข้อมูลอ่อนไหว</span></h2>
          <ul className="mt-3 space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-2xl bg-cream p-3">
                <p className="text-sm text-muted">{formatThaiDate(n.noteDate)} · {n.kind === "mental" ? "ด้านจิตวิทยา" : "ด้านการแพทย์"} · บันทึกโดย {names.get(n.createdBy ?? 0)}</p>
                {n.screeningResult && <p><b>ผลคัดกรอง:</b> {n.screeningResult}</p>}
                {n.opinion && <p><b>ความเห็น:</b> {n.opinion}</p>}
                {n.recommendation && <p><b>ข้อแนะนำ:</b> {n.recommendation}</p>}
                {n.referral && <p className="tag-warn mt-1">ส่งต่อ: {n.referralDetail ?? "-"}</p>}
              </li>
            ))}
            {!notes.length && <li><EmptyState title="ยังไม่มีความเห็น" /></li>}
          </ul>
          {(auth.can("health.edit") || auth.can("health.mental_edit")) && <MedicalNoteForm enrollmentId={e.id} today={today} canMedical={auth.can("health.edit")} />}
        </section>
      )}

      {(course.requiresBst || course.requiresRt101 || bst.followups.length > 0) && auth.can("bst.view") && (
        <section className="card">
          <h2 className="text-xl">บสต. / รท.101 และการติดตามหลังบำบัด</h2>
          <div className="mt-3 grid gap-4 lg:grid-cols-2">
            {(["bst", "rt101"] as const).filter((s) => (s === "bst" ? course.requiresBst : course.requiresRt101)).map((system) => (
              <div key={system} className="rounded-2xl border border-line p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-lg">{SYSTEM_LABEL[system]}</h3>
                  <ExternalIdForm enrollmentId={e.id} system={system} current={bst.ids.find((x) => x.system === system)?.externalId ?? ""} canEdit={auth.can("bst.edit")} />
                </div>
                <ul className="mt-2 divide-y divide-line">
                  {bst.tasks.filter((t) => t.system === system).map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="flex-1">{STEP_LABEL[t.step] ?? t.step}<span className="block text-xs text-muted">กำหนด {formatThaiDate(t.dueDate)}{t.reason ? ` · ${t.reason}` : ""}</span></span>
                      {t.status === "pending" || t.status === "done"
                        ? <TaskToggle taskId={t.id} done={t.status === "done"} overdue={t.status === "pending" && (t.dueDate ?? "") < today} canEdit={auth.can("bst.edit")} label={t.status === "done" ? `ลงแล้ว ${formatThaiDate(t.doneDate)} (${names.get(t.doneBy ?? 0) ?? ""})` : undefined} />
                        : <span className="tag-muted">{TASK_STATUS_LABEL[t.status]}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {bst.followups.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg">ติดตามหลังบำบัด</h3>
              <ul className="mt-2 space-y-2">
                {bst.followups.map((f) => (
                  <li key={f.id} className="rounded-2xl bg-cream p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>เดือนที่ {f.monthOffset}</b>
                      <span className="text-sm text-muted">กำหนด {formatThaiDate(f.dueDate)}</span>
                      {f.status === "done" && <span className="tag-ok">ติดตามแล้ว {formatThaiDate(f.doneDate)} · กลับไปเสพซ้ำ: {f.relapse === "yes" ? "ใช่" : f.relapse === "no" ? "ไม่ใช่" : "ไม่ทราบ"}</span>}
                      {f.status === "pending" && (f.dueDate < today ? <span className="tag-danger">เลยกำหนด</span> : <span className="tag-muted">รอติดตาม</span>)}
                      {(f.status === "closed" || f.status === "unfollowable") && <span className="tag-muted">{f.reason}</span>}
                    </div>
                    {f.status === "pending" && auth.can("bst.edit") && <FollowupForm followupId={f.id} today={today} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h2 className="text-xl">บันทึกพฤติกรรม</h2>
        <ul className="mt-3 space-y-2">
          {behaviors.map((b) => (
            <li key={b.id} className="flex flex-wrap items-start gap-2 rounded-2xl bg-cream px-3 py-2">
              <span className={b.tone === "positive" ? "tag-ok" : b.tone === "negative" ? "tag-danger" : "tag-muted"}>{b.tone === "positive" ? "เชิงบวก" : b.tone === "negative" ? "เชิงลบ" : "สังเกต"}</span>
              {b.category && <span className="tag-navy">{lookupLabel(db, "behavior_category", b.category)}</span>}
              <span className="flex-1">{b.text}</span>
              <span className="text-xs text-muted">{formatThaiDate(b.noteDate)} · {names.get(b.createdBy ?? 0)}</span>
            </li>
          ))}
          {!behaviors.length && <li><EmptyState title="ยังไม่มีบันทึกพฤติกรรม" /></li>}
        </ul>
        {e.status === "dropped" && <div className="mt-3"><Alert tone="info">ออกก่อนกำหนด — งานที่เหลือถูกปรับสถานะให้อัตโนมัติแล้ว</Alert></div>}
      </section>
    </div>
  );
}
