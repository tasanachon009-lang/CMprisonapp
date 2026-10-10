import { notFound } from "next/navigation";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { getCohort } from "@/lib/queries/cohorts";
import { userNameMap } from "@/lib/queries/names";
import { houseChart, houseSummary, TEAM_ROTATE_DAYS } from "@/lib/services/tc-house";
import { todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { HelpButton } from "@/components/help-button";
import { PersonThumb } from "@/components/person-thumb";
import { AssignTable, type HouseRow } from "./house-client";

export const dynamic = "force-dynamic";

/** ผังบ้าน (สเปก 16): หัวหน้าศูนย์ → C.O.D → Chief Expeditor → Expeditor → Work Leader → Resident → Newcomer */
export default async function HousePage({ params }: PageProps<"/cohorts/[id]/tc/house">) {
  const auth = await requirePage("tc.view", "tc.summary");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row || row.course.code !== "FAST") notFound();
  const today = todayISO();
  const headTitle = getSetting<string>(db, "docs.unitHeadTitle", "") || "หัวหน้าศูนย์";
  const headName = getSetting<string>(db, "docs.unitHeadName", "");

  // ผู้บริหาร: สรุปจำนวนต่อตำแหน่ง/ทีม ไม่มีชื่อ
  if (!auth.can("tc.view")) {
    const s = houseSummary(db, row.cohort.id, today);
    return (
      <section className="card space-y-3">
        <h2 className="text-xl">โครงสร้างบ้าน <span className="tag-muted ml-2 align-middle text-sm">สรุปไม่ระบุชื่อ</span></h2>
        <p className="text-muted">สมาชิก {s.total} คน</p>
        <div className="grid gap-4 md:grid-cols-2">
          <table className="table-plain"><thead><tr><th>ตำแหน่ง</th><th className="text-right">คน</th></tr></thead><tbody>{s.positions.map((p) => <tr key={p.label}><td>{p.label}</td><td className="text-right">{p.n}</td></tr>)}</tbody></table>
          <table className="table-plain"><thead><tr><th>ทีมงาน</th><th className="text-right">คน</th></tr></thead><tbody>{s.teams.map((p) => <tr key={p.label}><td>{p.label}</td><td className="text-right">{p.n}</td></tr>)}</tbody></table>
        </div>
        {s.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}
      </section>
    );
  }

  const chart = houseChart(db, row.cohort.id, today);
  const names = userNameMap(db);
  const posLabel = new Map(chart.tiers.map((t) => [t.code, t.label]));
  const teamLabel = new Map(chart.teams.map((t) => [t.code, t.label]));
  const staff = db.select({ id: schema.users.id }).from(schema.userRoles).innerJoin(schema.users, eq(schema.users.id, schema.userRoles.userId))
    .where(and(inArray(schema.userRoles.role, ["rehab", "admin"]), eq(schema.users.status, "active"), isNull(schema.users.deletedAt))).all().map((u) => u.id);
  const rows: HouseRow[] = chart.members.map((m) => ({
    enrollmentId: m.enrollmentId, name: m.name, inmateNo: m.inmateNo, thumb: m.thumbPath ? `/api/files/photo/${m.incarcerationId}?s=thumb` : null, zone: m.zone,
    position: posLabel.get(m.position) ?? m.position, team: m.team ? teamLabel.get(m.team) ?? m.team : null, counselor: m.counselorId ? names.get(m.counselorId) ?? null : null, mentor: m.mentor,
    teamOverdue: m.teamDays != null && m.teamDays > TEAM_ROTATE_DAYS,
  }));

  return (
    <div className="space-y-6">
      <section className="card">
        <h2 className="flex items-center gap-1 text-xl">ผังบ้าน
          <HelpButton>ผังเรียงตามตำแหน่งจากสูงไปต่ำ สมาชิกที่ยังไม่ได้กำหนดตำแหน่งถือเป็น Newcomer เลือกสมาชิกในตารางด้านล่างเพื่อกำหนดตำแหน่ง ทีมงาน ที่ปรึกษา หรือพี่เลี้ยง การเปลี่ยนตำแหน่งต้องระบุเหตุผล ระบบเก็บประวัติเลื่อนและลดตำแหน่งให้ สมาชิกที่ออกจากโปรแกรมจะไม่อยู่ในผัง</HelpButton>
        </h2>
        <p className="text-muted">สมาชิก {chart.members.length} คน · ที่ปรึกษา {chart.counselors.length} คน · พี่เลี้ยง {chart.mentors.length} คน (เกณฑ์ 1:{chart.ratio.perStaff} และ 1:{chart.ratio.perMentor})</p>
        {chart.warnings.length > 0 && <div className="mt-3 space-y-2">{chart.warnings.map((w) => <Alert key={w} tone="warn">{w}</Alert>)}</div>}
        {chart.members.length === 0 ? <EmptyState title="ยังไม่มีสมาชิกที่กำลังอบรม" /> : (
          <ol className="mt-4 space-y-3" aria-label="ผังบ้านตามตำแหน่ง">
            <li className="rounded-3xl bg-navy p-4 text-center text-white"><p className="font-display text-sm uppercase tracking-[0.18em] text-lime">Staff</p><p className="font-semibold">{headTitle}{headName ? ` · ${headName}` : ""}</p></li>
            {chart.tiers.map((t) => (
              <li key={t.code} className="rounded-3xl border border-line p-4">
                <p className="font-semibold">{t.label} <span className="font-normal text-muted">({t.members.length} คน)</span></p>
                {t.members.length > 0 && (
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {t.members.map((m) => (
                      <li key={m.enrollmentId} className="inline-flex items-center gap-2 rounded-full border border-line bg-white py-1 pl-1 pr-3">
                        <PersonThumb name={m.name} thumb={m.thumbPath ? `/api/files/photo/${m.incarcerationId}?s=thumb` : null} inmateNo={m.inmateNo} zone={m.zone} />
                        <span>{m.name}</span>{m.team && <span className="text-sm text-muted">· {teamLabel.get(m.team) ?? m.team}</span>}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="card">
        <h2 className="text-xl">ตำแหน่ง ทีมงาน ที่ปรึกษา และพี่เลี้ยงของสมาชิก</h2>
        <div className="mt-3">
          <AssignTable cohortId={row.cohort.id} rows={rows} today={today} canEdit={auth.can("tc.edit") && row.cohort.status !== "closed"} kinds={["position", "team", "counselor", "mentor"]}
            options={{
              position: chart.tiers.filter((t) => t.active).map((t) => ({ value: t.code, label: t.label })),
              team: chart.teams.filter((t) => t.active).map((t) => ({ value: t.code, label: t.label })),
              counselor: Array.from(new Set(staff)).map((uid) => ({ value: String(uid), label: names.get(uid) ?? String(uid) })),
            }} />
        </div>
      </section>
    </div>
  );
}
