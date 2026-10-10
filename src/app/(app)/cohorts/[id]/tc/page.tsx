import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortPhases, phaseSummary } from "@/lib/services/fast-phase";
import { FAST_PHASES, phaseLabel, scheduledPhase, weekOf } from "@/lib/fast/phases";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { HelpButton } from "@/components/help-button";
import { PhaseSteps } from "@/components/phase-steps";
import { PhaseTable, type MemberRow } from "./phase-client";

export const dynamic = "force-dynamic";

/** แท็บชุมชนบำบัด (สเปก 16): ระยะการบำบัด 5 ระยะ — ระยะตามปฏิทินคำนวณอัตโนมัติ ระยะจริงเลื่อนเมื่ออนุมัติ */
export default async function CohortTc({ params }: PageProps<"/cohorts/[id]/tc">) {
  const auth = await requirePage("tc.view", "tc.summary");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row || row.course.code !== "FAST") notFound();
  const { cohort } = row;
  const today = todayISO();
  const summaryOnly = !auth.can("tc.view");
  const summary = phaseSummary(db, cohort.id, today);
  const sched = scheduledPhase(cohort.startDate, today);
  const week = weekOf(cohort.startDate, today);

  let rows: MemberRow[] = [];
  if (!summaryOnly) {
    const phases = new Map(cohortPhases(db, cohort.id, today).map((m) => [m.enrollmentId, m]));
    rows = cohortRoster(db, cohort.id).filter((r) => phases.has(r.enrollment.id)).map((r) => {
      const m = phases.get(r.enrollment.id)!;
      const next = FAST_PHASES.find((p) => p.no === m.status.current.no + 1) ?? null;
      const last = m.records.at(-1);
      return {
        enrollmentId: r.enrollment.id, name: `${r.person.prefix ?? ""}${r.person.firstName} ${r.person.lastName}`, inmateNo: r.inc.inmateNo,
        thumb: r.inc.thumbPath ? `/api/files/photo/${r.inc.id}?s=thumb` : null, zone: r.inc.zone,
        phaseNo: m.status.current.no, phaseLabel: phaseLabel(m.status.current.code), since: formatThaiDate(last?.startDate ?? r.enrollment.enrolledDate),
        nextCode: next?.code ?? null, nextLabel: next ? phaseLabel(next.code) : null, due: !!m.status.due, ahead: m.status.ahead, lastNote: last?.note ?? null,
      };
    });
  }

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="flex items-center gap-1 text-xl">ระยะการบำบัด
          <HelpButton>ระยะตามปฏิทินคำนวณจากสัปดาห์ของรุ่นโดยอัตโนมัติ ระยะของสมาชิกแต่ละคนจะเลื่อนเมื่อผ่านการประเมินและได้รับอนุมัติ เลื่อนได้ทีละระยะ ระยะ After care เริ่มได้เมื่อบันทึกครบหลักสูตรแล้ว</HelpButton>
        </h2>
        <p className="text-muted">{week < 1 ? "ยังไม่เริ่มรุ่น" : week <= 24 ? `สัปดาห์ที่ ${week} จาก 24` : "ครบ 24 สัปดาห์แล้ว"} · สมาชิก {summary.total} คน</p>
        <div className="mt-3"><PhaseSteps phases={summary.byPhase} scheduledNo={sched?.no ?? null} week={week} /></div>
        {summary.due > 0 && <div className="mt-3"><Alert tone="warn">มีสมาชิกถึงกำหนดเลื่อนระยะ {summary.due} คน รอประเมินและอนุมัติ</Alert></div>}
      </section>

      {!summaryOnly && (
        <section className="card">
          <h2 className="text-xl">ระยะของสมาชิก</h2>
          {rows.length === 0 ? <EmptyState title="ยังไม่มีสมาชิกที่ยืนยันรับเข้า" /> : (
            <div className="mt-3"><PhaseTable cohortId={cohort.id} rows={rows} today={today} canApprove={auth.can("tc.approve") && cohort.status !== "closed"} /></div>
          )}
        </section>
      )}
    </div>
  );
}
