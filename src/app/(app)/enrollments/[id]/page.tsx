import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { cohortOfEnrollment } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { enrollmentContext, bstOf, medicalNotesOf, behaviorNotesOf } from "@/lib/queries/enrollment";
import { cohortAttendanceSummary } from "@/lib/services/attendance";
import { listForms, resultsOf, formAccess, versionFor } from "@/lib/services/assessments";
import { maxScore, individualPrePost } from "@/lib/assessments/prepost";
import type { Item } from "@/lib/assessments/scoring";
import { PrePostChart } from "@/components/prepost-chart";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { STEP_LABEL, TASK_STATUS_LABEL, BST_STEP_ORDER, DONE_BUTTON_LABEL } from "@/lib/services/followup";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { userNameMap } from "@/lib/queries/names";
import { lookupLabel } from "@/lib/bootstrap";
import { intakeGaps } from "@/lib/services/registry";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, Alert, EmptyState, Eyebrow } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { MedicalNoteForm, ExternalIdForm, TaskToggle, FollowupForm, CompleteButton, IntakePanel } from "./enrollment-client";
import { BehaviorNoteButton } from "@/components/behavior-note";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { ok: "tag-ok", warn: "tag-warn", danger: "tag-danger" };

/** แฟ้มการอบรม 1 รอบ: แบบประเมิน · สถานพยาบาล · บสต./ติดตาม · พฤติกรรม */
export default async function EnrollmentPage({ params }: PageProps<"/enrollments/[id]">) {
  const auth = await requirePage();
  const { id } = await params;
  const db = getDb();
  // กลุ่ม B ที่ได้รับมอบหมายรายรุ่น: เปิดได้เฉพาะคนในรุ่นนั้น และเห็นเฉพาะส่วนที่ได้รับมอบหมาย
  const full = auth.can("course.view");
  const cohortId = cohortOfEnrollment(Number(id));
  const scopedOk = cohortId != null && (["bst.view", "bst.edit", "behavior.edit", "contacts.edit"] as Permission[]).some((x) => auth.canIn(x, [cohortId]));
  if (!full && !scopedOk) redirect("/forbidden");
  const ctx = enrollmentContext(db, Number(id));
  if (!ctx) notFound();
  const { e, inc, p, c, course } = ctx;
  const canBstView = auth.canIn("bst.view", [c.id]) || auth.canIn("bst.edit", [c.id]);
  const canBstEdit = auth.canIn("bst.edit", [c.id]);
  const today = todayISO();
  const names = userNameMap(db);
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(course.code)).map((f) => ({ f, access: formAccess(auth.can, f) })).filter((x) => x.access.view);
  const results = resultsOf(db, [e.id], auth.can);
  const maxOf = new Map(forms.map(({ f }) => {
    const v = versionFor(db, f.id, today);
    return [f.id, maxScore(f.kind, v.items as Item[], v.scoring as Record<string, unknown>)] as const;
  }));
  const chartRows = individualPrePost(results, e.id, maxOf);
  const att = cohortAttendanceSummary(db, c.id, course.passAttendancePct, course.totalHours).get(e.id);
  const canHealth = auth.can("health.view");
  const bst = bstOf(db, e.id);
  const notes = canHealth ? medicalNotesOf(db, e.id) : [];
  const behaviors = behaviorNotesOf(db, inc.id).filter((b) => b.enrollmentId === e.id || !b.enrollmentId);

  return (
    <div className="space-y-6">
      <Breadcrumb items={!full ? [{ href: "/assigned", label: "งานที่ได้รับมอบหมาย" }, { label: ctx.name }] : [
        { href: "/courses", label: "หลักสูตร" },
        { href: `/cohorts/${c.id}`, label: `${course.shortName} ${ctx.label}` },
        { href: `/cohorts/${c.id}/roster`, label: "รายชื่อ" },
        { label: ctx.name },
      ]} />
      <section className="card flex flex-wrap items-center gap-4">
        <Avatar first={p.firstName} last={p.lastName} src={full && inc.photoPath ? `/api/files/photo/${inc.id}` : null} size={72} color="var(--lime)" />
        <div className="flex-1">
          <Eyebrow>Member File</Eyebrow>
          <h1 className="text-2xl">{ctx.name}</h1>
          <p className="text-muted">เลขประจำตัว {inc.inmateNo} · {course.name} {ctx.label} · <span className="font-semibold">{ENROLLMENT_STATUS_LABEL[e.status]}</span>{e.leftDate ? ` (${formatThaiDate(e.leftDate)})` : ""}</p>
          {att && (
            <p className={`text-sm ${att.belowThreshold ? "font-semibold text-danger" : "text-muted"}`}>
              เข้าร่วม {att.pct ?? "-"}% (มา {att.present}/{att.counted} ครั้ง{att.corrections ? ` · เหตุราชทัณฑ์ ${att.corrections} ครั้ง ไม่นับ` : ""}) · ชั่วโมงสะสม {att.presentHours}/{course.totalHours} ชม.{att.belowThreshold ? ` — ต่ำกว่าเกณฑ์ ${course.passAttendancePct}%` : ""}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {auth.canIn("behavior.edit", [c.id]) && <BehaviorNoteButton incarcerationId={inc.id} enrollmentId={e.id} name={ctx.name} />}
          {auth.can("registry.edit") && e.status === "active" && <CompleteButton cohortId={c.id} enrollmentId={e.id} defaultDate={c.endDate <= today ? c.endDate : today} />}
          <Link href={`/persons/${p.id}`} className="btn-ghost">หน้าบุคคล</Link>
          {auth.can("reports.view") && <Link href={`/print/person/${p.id}`} target="_blank" className="btn-ghost">พิมพ์รายงานรายบุคคล</Link>}
        </div>
      </section>

      {full && <>
      <section className="card">
        <IntakePanel
          enrollmentId={e.id}
          score={e.screeningScore}
          exclusions={((e.intake as { exclusions?: string[] } | null)?.exclusions) ?? []}
          intake={(e.intake as { confirmations?: string[]; drugClass?: string | null; priorityFlags?: string[] } | null) ?? {}}
          gaps={e.status === "draft" ? intakeGaps(db, e) : []}
          criteria={course.intakeCriteria as never}
          consentSigned={e.consentSigned}
          consentDate={e.consentDate ? formatThaiDate(e.consentDate) : null}
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
                            <span className={TONE[r.r.tone ?? ""] ?? "tag-muted"} title={typeof (r.r.details as { guidance?: unknown } | null)?.guidance === "string" ? `แนวทาง: ${(r.r.details as { guidance: string }).guidance}` : undefined}>{r.r.level ?? "บันทึกแล้ว"}</span>
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
        {chartRows.length > 0 && <div className="mt-4 max-w-3xl"><PrePostChart rows={chartRows} individual title="กราฟก่อน-หลัง (การลงทะเบียนครั้งนี้เท่านั้น)" /></div>}
      </section>
      </>}

      {canHealth && course.code === "PRE3" && (
        <section className="card flex flex-wrap items-center gap-3">
          <h2 className="text-xl">ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ <span className="tag-orange ml-1 align-middle text-sm">ข้อมูลอ่อนไหว</span></h2>
          <Link href={`/enrollments/${e.id}/referral`} className="btn-ghost ml-auto">เปิดแบบบันทึกส่งต่อ (กิจกรรม 11)</Link>
        </section>
      )}

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

      {(course.requiresBst || bst.followups.length > 0) && canBstView && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl">บสต. และการติดตามหลังบำบัด</h2>
            {course.requiresBst && <ExternalIdForm enrollmentId={e.id} system="bst" current={bst.ids.find((x) => x.system === "bst")?.externalId ?? ""} canEdit={canBstEdit} />}
          </div>
          {course.requiresBst && (
            <ul className="mt-2 divide-y divide-line">
              {bst.tasks.filter((t) => t.system === "bst").sort((a, b) => BST_STEP_ORDER.indexOf(a.step) - BST_STEP_ORDER.indexOf(b.step)).map((t) => (
                <li key={t.id} className="flex flex-wrap items-center gap-2 py-2">
                  <span className="flex-1">{STEP_LABEL[t.step] ?? t.step}<span className="block text-xs text-muted">ครบกำหนด {formatThaiDate(t.dueDate)}{t.reason ? ` · ${t.reason}` : ""}</span></span>
                  {t.status === "pending" || t.status === "done"
                    ? <TaskToggle taskId={t.id} done={t.status === "done"} overdue={t.status === "pending" && (t.dueDate ?? "") < today} canEdit={canBstEdit} doneLabel={DONE_BUTTON_LABEL.bst} label={t.status === "done" ? `ลง บสต. แล้ว ${formatThaiDate(t.doneDate)} (${names.get(t.doneBy ?? 0) ?? ""})` : undefined} />
                    : <span className="tag-muted">{TASK_STATUS_LABEL[t.status]}</span>}
                </li>
              ))}
              {e.status === "active" && <li className="py-2 text-sm text-muted">งาน &quot;จำหน่าย&quot; และติดตาม 4 ครั้งจะเกิดเมื่อบันทึกครบหลักสูตร — ติดตามนับจากวันจำหน่าย</li>}
            </ul>
          )}
          {bst.followups.length > 0 && (
            <div className="mt-4">
              <h3 className="text-lg">ติดตามหลังบำบัด (นับจากวันจำหน่าย)</h3>
              <ul className="mt-2 space-y-2">
                {bst.followups.map((f) => (
                  <li key={f.id} className="rounded-2xl bg-cream p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <b>ครั้งที่ {f.seq} · เดือนที่ {f.monthOffset}</b>
                      <span className="text-sm text-muted">กำหนด {formatThaiDate(f.dueDate)}</span>
                      {f.status === "done" && <span className="tag-ok">ติดตามแล้ว {formatThaiDate(f.doneDate)} · กลับไปเสพซ้ำ: {f.relapse === "yes" ? "ใช่" : f.relapse === "no" ? "ไม่ใช่" : "ไม่ทราบ"}</span>}
                      {f.status === "pending" && (f.dueDate < today ? <span className="tag-danger">เลยกำหนด</span> : <span className="tag-muted">รอติดตาม</span>)}
                      {(f.status === "closed" || f.status === "unfollowable") && <span className="tag-muted">{f.reason}</span>}
                    </div>
                    {f.status === "pending" && canBstEdit && <FollowupForm followupId={f.id} today={today} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {course.requiresRt101 && canBstView && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl">รท.101 — บันทึกผ่านการฟื้นฟู</h2>
            <ExternalIdForm enrollmentId={e.id} system="rt101" current={bst.ids.find((x) => x.system === "rt101")?.externalId ?? ""} canEdit={canBstEdit} />
          </div>
          {(() => {
            const rt = bst.tasks.find((t) => t.system === "rt101" && t.step === "record");
            if (!rt) return <p className="mt-2 text-muted">{e.status === "completed" ? "ไม่มีงาน รท.101" : "ลงเมื่อครบหลักสูตรเท่านั้น — ยังไม่ต้องลง"}</p>;
            return (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <span className="flex-1">ครบกำหนด {formatThaiDate(rt.dueDate)}{inc.releasedDate ? <span className="block text-xs text-muted">ออกจากเรือนจำแล้ว — งาน รท.101 ยังคงต้องลง</span> : null}</span>
                {rt.status === "pending" || rt.status === "done"
                  ? <TaskToggle taskId={rt.id} done={rt.status === "done"} overdue={rt.status === "pending" && (rt.dueDate ?? "") < today} canEdit={canBstEdit} doneLabel={DONE_BUTTON_LABEL.rt101} label={rt.status === "done" ? `ลง รท.101 แล้ว ${formatThaiDate(rt.doneDate)} (${names.get(rt.doneBy ?? 0) ?? ""})` : undefined} />
                  : <span className="tag-muted">{TASK_STATUS_LABEL[rt.status]}</span>}
              </div>
            );
          })()}
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
