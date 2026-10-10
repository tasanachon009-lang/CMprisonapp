import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { userNameMap } from "@/lib/queries/names";
import { houseChart, teamReviews, teamsWithoutReview, RATING_LABEL, TEAM_ROTATE_DAYS } from "@/lib/services/tc-house";
import { weekStartOf } from "@/lib/services/cohorts";
import { addDays, formatThaiDate, todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { HelpButton } from "@/components/help-button";
import { AssignTable, TeamReviewForm, type HouseRow } from "../house/house-client";

export const dynamic = "force-dynamic";

/** ทีมงาน (งานบำบัด) ของชุมชนบำบัด: สมาชิกต่อทีม · หมุนทุก 1–2 เดือน (เตือนเกิน 2 เดือน) · ประเมินทีมรายสัปดาห์ */
export default async function TeamsPage({ params }: PageProps<"/cohorts/[id]/tc/teams">) {
  const auth = await requirePage("tc.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row || row.course.code !== "FAST") notFound();
  const today = todayISO();
  const chart = houseChart(db, row.cohort.id, today);
  const names = userNameMap(db);
  const canEdit = auth.can("tc.edit") && row.cohort.status !== "closed";
  const teamLabel = new Map(chart.teams.map((t) => [t.code, t.label]));
  const reviews = teamReviews(db, row.cohort.id);
  const pending = teamsWithoutReview(db, row.cohort.id, today);
  const lastWeek = pending.weekStart;
  const toRow = (m: (typeof chart.members)[number]): HouseRow => ({
    enrollmentId: m.enrollmentId, name: m.name, inmateNo: m.inmateNo, thumb: m.thumbPath ? `/api/files/photo/${m.incarcerationId}?s=thumb` : null, zone: m.zone,
    position: chart.tiers.find((t) => t.code === m.position)?.label ?? m.position, team: m.team ? `${teamLabel.get(m.team) ?? m.team} · ตั้งแต่ ${formatThaiDate(m.teamSince)}` : null,
    counselor: m.counselorId ? names.get(m.counselorId) ?? null : null, mentor: m.mentor, teamOverdue: m.teamDays != null && m.teamDays > TEAM_ROTATE_DAYS,
  });
  const overdue = chart.members.filter((m) => m.teamDays != null && m.teamDays > TEAM_ROTATE_DAYS).length;

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="flex items-center gap-1 text-xl">ทีมงาน (งานบำบัด)
          <HelpButton>ทีมงานควรหมุนทุก 1–2 เดือน ระบบเตือนเมื่อสมาชิกอยู่ทีมเดิมเกิน 2 เดือน เลือกสมาชิกแล้วกำหนดทีมใหม่เพื่อหมุนทีม ระบบเก็บประวัติให้ เพิ่มทีมงานได้ที่ตั้งค่าระบบ</HelpButton>
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
          {chart.teams.map((t) => <div key={t.code} className="rounded-2xl border border-line p-3 text-center"><p className="font-display text-3xl font-bold text-navy">{t.members.length}</p><p className="text-sm text-muted">{t.label}</p></div>)}
          <div className="rounded-2xl border border-line p-3 text-center"><p className={`font-display text-3xl font-bold ${chart.noTeam.length ? "text-warn" : "text-navy"}`}>{chart.noTeam.length}</p><p className="text-sm text-muted">ยังไม่กำหนดทีม</p></div>
        </div>
        {overdue > 0 && <div className="mt-3"><Alert tone="warn">อยู่ทีมงานเดิมเกิน 2 เดือน {overdue} คน ควรหมุนทีม</Alert></div>}
        {chart.members.length === 0 ? <EmptyState title="ยังไม่มีสมาชิกที่กำลังอบรม" /> : (
          <div className="mt-4"><AssignTable cohortId={row.cohort.id} rows={chart.members.map(toRow)} today={today} canEdit={canEdit} kinds={["team"]} options={{ position: [], counselor: [], team: chart.teams.filter((t) => t.active).map((t) => ({ value: t.code, label: t.label })) }} /></div>
        )}
      </section>

      <section className="card space-y-4">
        <h2 className="text-xl">ประเมินทีมรายสัปดาห์</h2>
        {pending.teams.length > 0 && <Alert tone="warn">สัปดาห์ที่แล้วยังไม่ได้ประเมิน: {pending.teams.map((t) => teamLabel.get(t) ?? t).join(", ")}</Alert>}
        {canEdit && chart.teams.length > 0 && <TeamReviewForm cohortId={row.cohort.id} teams={chart.teams.map((t) => ({ value: t.code, label: t.label }))} weekStart={lastWeek >= weekStartOf(row.cohort.startDate) ? lastWeek : weekStartOf(today)} weekLabel={`${formatThaiDate(lastWeek >= weekStartOf(row.cohort.startDate) ? lastWeek : weekStartOf(today))} – ${formatThaiDate(addDays(lastWeek >= weekStartOf(row.cohort.startDate) ? lastWeek : weekStartOf(today), 6))}`} />}
        {reviews.length === 0 ? <p className="text-muted">ยังไม่มีผลประเมิน</p> : (
          <div className="overflow-x-auto">
            <table className="table-plain">
              <thead><tr><th>สัปดาห์</th><th>ทีมงาน</th><th>ผล</th><th>หมายเหตุ</th><th>ผู้ประเมิน</th></tr></thead>
              <tbody>{reviews.map((r) => <tr key={r.id}><td className="whitespace-nowrap">{formatThaiDate(r.weekStart)}</td><td>{teamLabel.get(r.team) ?? r.team}</td><td><span className={r.rating === "needs_improvement" ? "tag-danger" : r.rating === "fair" ? "tag-warn" : "tag-ok"}>{RATING_LABEL[r.rating] ?? r.rating}</span></td><td>{r.note ?? "-"}</td><td>{names.get(r.updatedBy ?? r.createdBy ?? 0) ?? "-"}</td></tr>)}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
