import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { sessionRoster, attendanceVersion } from "@/lib/services/attendance";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { QuickGrid } from "./quick-grid";

export const dynamic = "force-dynamic";

/** โหมดกรอกเร็ว: แถว = คน, คอลัมน์ = คาบของวันที่เลือก ใช้แป้นพิมพ์อย่างเดียว (สเปก 9) */
export default async function QuickAttendancePage({ params, searchParams }: PageProps<"/cohorts/[id]/attendance/quick">) {
  await requirePage("attendance.edit");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const all = cohortSessions(db, row.cohort.id).filter((s) => s.takesAttendance && s.date <= todayISO());
  const dates = Array.from(new Set(all.map((s) => s.date)));
  const firstUnchecked = all.find((s) => !s.attendanceCheckedAt)?.date;
  const date = typeof sp.date === "string" && dates.includes(sp.date) ? sp.date : firstUnchecked ?? dates[dates.length - 1];
  if (!date) return <p className="card">ยังไม่มีคาบที่ถึงกำหนดเช็คชื่อ</p>;
  const sessions = all.filter((s) => s.date === date);
  const rosters = sessions.map((s) => sessionRoster(db, s.id));
  // คนที่อยู่ในคาบใดคาบหนึ่งของวันนั้น
  const people = new Map<number, { enrollmentId: number; name: string; inmateNo: string; zone: string | null; thumb: string | null; duplicateName: boolean }>();
  for (const r of rosters) for (const p of r.rows) people.set(p.enrollmentId, { enrollmentId: p.enrollmentId, name: `${p.prefix ?? ""}${p.firstName} ${p.lastName}`, inmateNo: p.inmateNo, zone: p.zone, thumb: p.thumbPath ? `/api/files/photo/${p.incarcerationId}?s=thumb` : null, duplicateName: p.duplicateName });

  return (
    <QuickGrid
      cohortId={row.cohort.id}
      date={date}
      dates={dates.map((d) => ({ value: d, label: formatThaiDate(d), checked: all.filter((s) => s.date === d).every((s) => !!s.attendanceCheckedAt) }))}
      sessions={rosters.map((r) => ({
        id: r.session.id,
        title: r.session.title,
        time: `${r.session.startTime}–${r.session.endTime}`,
        version: attendanceVersion(r.rows.map((x) => x.record)),
        members: r.rows.map((x) => x.enrollmentId),
        values: Object.fromEntries(r.rows.filter((x) => x.record).map((x) => [x.enrollmentId, { status: x.record!.status, correctionsType: x.record!.correctionsType, note: x.record!.note }])),
      }))}
      people={[...people.values()]}
    />
  );
}
