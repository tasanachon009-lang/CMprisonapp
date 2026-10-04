import Link from "next/link";
import { notFound } from "next/navigation";
import { Keyboard, Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { listForms, resultsOf, formAccess, dueAssessments } from "@/lib/services/assessments";
import { PrePostChart, type PrePostRow } from "@/components/prepost-chart";
import { Alert, EmptyState } from "@/components/ui";
import { PersonThumb } from "@/components/person-thumb";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { ok: "text-ok", warn: "text-warn", danger: "text-danger font-semibold" };
const MAX: Record<string, number> = { KNOW: 15, ATT: 105, MOTIV: 5, TEMP: 10, PMHQ: 72, PROG: 135 };

export default async function CohortAssessments({ params }: PageProps<"/cohorts/[id]/assessments">) {
  const auth = await requirePage("assessment.view", "health.view", "assessment.summary");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const { cohort, course } = row;
  const summaryOnly = !auth.can("assessment.view") && !auth.can("health.view");
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(course.code)).filter((f) => summaryOnly ? !f.sensitive : formAccess(auth.can, f).view);
  const roster = cohortRoster(db, cohort.id).filter((r) => ["draft", "active", "completed", "dropped", "failed"].includes(r.enrollment.status));
  const results = resultsOf(db, roster.map((r) => r.enrollment.id), summaryOnly ? (p) => p === "assessment.view" : auth.can);
  const due = dueAssessments(db, cohort.id);

  const chart: PrePostRow[] = forms.filter((f) => MAX[f.code] && (f.rounds as string[]).includes("pre") && (f.rounds as string[]).includes("post")).map((f) => {
    const avg = (round: string) => {
      const v = results.filter((r) => r.f.id === f.id && r.r.round === round && r.r.total != null).map((r) => r.r.total!);
      return { v: v.length ? Math.round((v.reduce((a, b) => a + b, 0) / v.length) * 10) / 10 : null, n: v.length };
    };
    const pre = avg("pre"), post = avg("post");
    return { label: f.shortName, max: MAX[f.code], pre: pre.v, post: post.v, preN: pre.n, postN: post.n };
  });

  return (
    <div className="space-y-6">
      {!summaryOnly && due.length > 0 && <Alert tone="warn">แบบประเมินถึงรอบแต่ยังไม่ทำ {due.length} รายการ ({Array.from(new Set(due.map((d) => d.formName))).join(", ")})</Alert>}
      <section className="card">
        <h2 className="text-xl">คะแนนเฉลี่ยก่อน-หลัง {summaryOnly && <span className="tag-muted ml-2 align-middle text-sm">สรุปไม่ระบุชื่อ</span>}</h2>
        {chart.length ? <div className="mt-3 max-w-3xl"><PrePostChart rows={chart} /></div> : <EmptyState title="ยังไม่มีข้อมูล" />}
      </section>

      {!summaryOnly && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-xl">รายคน</h2>
            {forms.filter((f) => f.kind === "items" && formAccess(auth.can, f).edit).map((f) => (
              <span key={f.id} className="inline-flex gap-1">
                {(f.rounds as string[]).filter((r) => r !== "monthly").map((r) => (
                  <Link key={r} href={`/cohorts/${cohort.id}/assessments/quick?form=${f.code}&round=${r}`} className="btn-ghost btn-sm"><Keyboard size={16} aria-hidden /> {f.shortName} ({r === "pre" ? "ก่อน" : "หลัง"})</Link>
                ))}
              </span>
            ))}
            <Link href={`/print/blank-forms/${cohort.id}`} target="_blank" className="btn-ghost btn-sm"><Printer size={16} aria-hidden /> พิมพ์แบบประเมินเปล่ามีชื่อ</Link>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="table-plain text-sm">
              <thead>
                <tr>
                  <th className="min-w-56">ชื่อ-สกุล</th>
                  {forms.map((f) => <th key={f.id} className="text-center">{f.shortName}<br /><span className="font-normal">ก่อน → หลัง</span></th>)}
                </tr>
              </thead>
              <tbody>
                {roster.map((r) => (
                  <tr key={r.enrollment.id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <PersonThumb name={`${r.person.prefix ?? ""}${r.person.firstName} ${r.person.lastName}`} thumb={r.inc.thumbPath ? `/api/files/photo/${r.inc.id}?s=thumb` : null} inmateNo={r.inc.inmateNo} zone={r.inc.zone} />
                        <Link href={`/enrollments/${r.enrollment.id}`} className="hover:underline">{r.person.firstName} {r.person.lastName}</Link>
                      </div>
                    </td>
                    {forms.map((f) => {
                      const cell = (round: string) => {
                        const x = results.find((y) => y.r.enrollmentId === r.enrollment.id && y.f.id === f.id && y.r.round === round);
                        if (!(f.rounds as string[]).includes(round)) return null;
                        return x ? <span className={TONE[x.r.tone ?? ""] ?? ""} title={x.r.level ?? ""}>{x.r.total ?? "✓"}</span> : <span className="text-muted">·</span>;
                      };
                      return <td key={f.id} className="text-center whitespace-nowrap">{cell("pre")}{(f.rounds as string[]).includes("post") && <> → {cell("post")}</>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted">· = ยังไม่ทำ · สีแดง = ผลเสี่ยง/ต้องปรับปรุง — กดชื่อเพื่อบันทึกรายคน</p>
        </section>
      )}
    </div>
  );
}

