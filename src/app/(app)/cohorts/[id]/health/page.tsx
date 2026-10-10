import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requirePage, clientIp } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { getDb, schema } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { dueAssessments } from "@/lib/services/assessments";
import { q8Guidance } from "@/lib/assessments/scoring";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { formatThaiDate } from "@/lib/thai-date";
import { Alert, EmptyState, Stat } from "@/components/ui";
import { usesHealthReferral, cohortReferrals, referralSummary, physicalText } from "@/lib/services/health-referral";

export const dynamic = "force-dynamic";

/** แท็บสถานพยาบาล — ผู้มีสิทธิ์สุขภาพเห็นรายชื่อ / ผู้บริหารเห็นสรุปไม่ระบุชื่อ */
export default async function CohortHealth({ params }: PageProps<"/cohorts/[id]/health">) {
  const auth = await requirePage("health.view", "health.summary");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const roster = cohortRoster(db, row.cohort.id);
  const ids = roster.map((r) => r.enrollment.id);
  const results = ids.length
    ? db.select({ r: schema.assessmentResults, f: schema.assessmentForms }).from(schema.assessmentResults)
        .innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
        .where(and(inArray(schema.assessmentResults.enrollmentId, ids), eq(schema.assessmentForms.sensitive, true), isNull(schema.assessmentResults.deletedAt))).all()
    : [];
  const forms = Array.from(new Map(results.map((x) => [x.f.id, x.f])).values());

  // สรุปไม่ระบุชื่อ (ทุกคนที่เข้าหน้านี้ได้)
  const summary = forms.map((f) => {
    const rs = results.filter((x) => x.f.id === f.id && x.r.round === "pre");
    const by = new Map<string, number>();
    for (const x of rs) by.set(x.r.level ?? "-", (by.get(x.r.level ?? "-") ?? 0) + 1);
    return { f, n: rs.length, by: [...by.entries()].sort((a, b) => b[1] - a[1]), risk: rs.filter((x) => x.r.tone === "danger").length };
  });

  const named = auth.can("health.view");
  const risky = named ? results.filter((x) => x.r.tone === "danger" || x.r.tone === "warn") : [];
  const byEnr = new Map(roster.map((r) => [r.enrollment.id, r]));
  const due = named ? dueAssessments(db, row.cohort.id).filter((d) => d.sensitive) : [];
  const refs = named && ids.length ? db.select().from(schema.medicalNotes).where(and(inArray(schema.medicalNotes.enrollmentId, ids), eq(schema.medicalNotes.referral, true), isNull(schema.medicalNotes.deletedAt))).all() : [];

  // ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ (สเปก 17 กิจกรรม 11) — สรุปไม่ระบุชื่อ / รายชื่อเฉพาะผู้มีสิทธิ์สุขภาพ
  const hasReferral = usesHealthReferral(row.course.code);
  const refSum = hasReferral ? referralSummary(db, row.cohort.id) : null;
  const refList = hasReferral && named ? cohortReferrals(db, row.cohort.id) : [];
  // รายชื่อพร้อมโรค = เปิดดูข้อมูลสุขภาพ → บันทึกการเปิดดู
  if (refList.some((x) => x.referral)) writeAudit(db, { userId: auth.user.id, action: "view_sensitive", entity: "health_referral_list", entityId: row.cohort.id, ip: await clientIp() });

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="text-xl">สรุปผลคัดกรองสุขภาพ (ก่อนเรียน) <span className="tag-muted ml-2 align-middle text-sm">ไม่ระบุชื่อ</span></h2>
        {summary.length === 0 ? <EmptyState title="ยังไม่มีผลคัดกรอง" /> : (
          <div className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            {summary.map((s) => (
              <div key={s.f.id} className="rounded-2xl border border-line p-3">
                <p className="font-semibold">{s.f.shortName}</p>
                <p className="text-sm text-muted">ประเมินแล้ว {s.n} คน · เสี่ยง <b className={s.risk ? "text-danger" : ""}>{s.risk}</b></p>
                <ul className="mt-2 text-sm">{s.by.map(([l, n]) => <li key={l} className="flex justify-between gap-2"><span>{l}</span><b>{n}</b></li>)}</ul>
              </div>
            ))}
          </div>
        )}
      </section>

      {refSum && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-xl">ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ (กิจกรรม 11) {named ? <span className="tag-orange ml-2 align-middle text-sm">ข้อมูลอ่อนไหว</span> : <span className="tag-muted ml-2 align-middle text-sm">ไม่ระบุชื่อ</span>}</h2>
            {named && refSum.needs > 0 && <Link href={`/print/referral-list/${row.cohort.id}`} target="_blank" className="btn-ghost btn-sm ml-auto">พิมพ์รายการผู้ต้องส่งต่อ</Link>}
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-4">
            <Stat value={refSum.total} label="ผู้เข้าอบรม" />
            <Stat value={refSum.needs} label="ต้องส่งต่อ" tone={refSum.needs ? "warn" : undefined} />
            <Stat value={refSum.recorded - refSum.needs} label="ไม่ต้องส่งต่อ" tone="ok" />
            <Stat value={refSum.pending} label="ยังไม่บันทึก" tone={refSum.pending ? "danger" : undefined} />
          </div>
          {named && (refList.length === 0 ? <EmptyState title="ยังไม่มีผู้เข้าอบรมที่ยืนยันรับเข้า" /> : (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="text-left text-muted"><th className="py-2">ชื่อ-สกุล</th><th>เลขประจำตัว</th><th>ผล</th><th>ปัญหาสุขภาพ</th><th>รพ. ที่จะรักษาต่อ</th><th /></tr></thead>
                <tbody>
                  {refList.map((x) => (
                    <tr key={x.enrollmentId} className="border-t border-line align-top">
                      <td className="py-2">{x.name}</td>
                      <td className="font-mono">{x.inmateNo}</td>
                      <td>{!x.referral ? <span className="tag-danger">ยังไม่บันทึก</span> : x.referral.needsReferral ? <span className="tag-warn">ต้องส่งต่อ</span> : <span className="tag-ok">ไม่ต้องส่งต่อ</span>}</td>
                      <td>{x.referral?.needsReferral ? [physicalText(x.referral), x.referral.mental ? `สุขภาพจิต: ${x.referral.mental}` : ""].filter(Boolean).join(" · ") : "-"}</td>
                      <td>{x.referral?.hospital ?? "-"}</td>
                      <td className="whitespace-nowrap text-right">
                        <Link href={`/enrollments/${x.enrollmentId}/referral`} className="btn-ghost btn-sm">{x.referral ? "เปิด/แก้ไข" : "บันทึก"}</Link>
                        {x.referral?.needsReferral && <Link href={`/print/referral/${x.enrollmentId}`} target="_blank" className="btn-ghost btn-sm ml-1">{x.referral.printedAt ? "พิมพ์ซ้ำ" : "พิมพ์ใบส่งต่อ"}</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </section>
      )}

      {named && (
        <>
          <section className="card">
            <h2 className="text-xl">ผู้มีผลคัดกรองเสี่ยง <span className="tag-orange ml-2 align-middle text-sm">ข้อมูลอ่อนไหว</span></h2>
            {risky.length === 0 ? <EmptyState title="ไม่มีผู้มีผลเสี่ยง" /> : (
              <ul className="mt-3 space-y-2">
                {risky.sort((a, b) => (a.r.tone === "danger" ? -1 : 1) - (b.r.tone === "danger" ? -1 : 1)).map((x) => {
                  const p = byEnr.get(x.r.enrollmentId);
                  const q8 = (x.r.details as { q8?: number } | null)?.q8;
                  return (
                    <li key={x.r.id} className={`rounded-2xl border px-4 py-3 ${x.r.tone === "danger" ? "border-danger/50 bg-danger/5" : "border-warn-bg/60 bg-warn-bg/10"}`}>
                      <p><Link href={`/enrollments/${x.r.enrollmentId}/assess/${x.f.code}?round=${x.r.round}`} className="font-semibold hover:underline">{p?.person.firstName} {p?.person.lastName}</Link> <span className="text-muted">({p?.inc.inmateNo})</span> · {x.f.shortName} {ROUND_LABEL[x.r.round]} · {formatThaiDate(x.r.assessedDate)}</p>
                      <p className="text-sm">{x.r.level}</p>
                      {q8 != null && q8 > 0 && <p className="mt-1 text-sm"><b>แนวทางการดูแล (คำแนะนำ):</b> {q8Guidance(q8)}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="text-xl">แบบคัดกรองสุขภาพที่ยังไม่ทำ</h2>
            {due.length === 0 ? <EmptyState title="ครบแล้ว" /> : (
              <ul className="mt-3 flex flex-wrap gap-2">
                {due.map((d) => {
                  const p = byEnr.get(d.enrollmentId);
                  return <li key={`${d.enrollmentId}-${d.formId}-${d.round}`}><Link className="tag-warn hover:underline" href={`/enrollments/${d.enrollmentId}/assess/${d.formCode}?round=${d.round}`}>{p?.person.firstName} {p?.person.lastName} · {d.formName} ({ROUND_LABEL[d.round]})</Link></li>;
                })}
              </ul>
            )}
          </section>
          <section className="card">
            <h2 className="text-xl">รายการส่งต่อสุขภาพ</h2>
            {refs.length === 0 ? <EmptyState title="ไม่มีรายการส่งต่อ" /> : (
              <ul className="mt-3 space-y-1">{refs.map((n) => <li key={n.id}><Link href={`/enrollments/${n.enrollmentId}`} className="hover:underline">{byEnr.get(n.enrollmentId)?.person.firstName} {byEnr.get(n.enrollmentId)?.person.lastName}</Link> — {n.referralDetail ?? "-"} <span className="text-sm text-muted">({formatThaiDate(n.noteDate)})</span></li>)}</ul>
            )}
          </section>
        </>
      )}
      {!named && <Alert tone="info">ผู้บริหารเห็นเฉพาะสรุปแบบไม่ระบุชื่อ</Alert>}
    </div>
  );
}
