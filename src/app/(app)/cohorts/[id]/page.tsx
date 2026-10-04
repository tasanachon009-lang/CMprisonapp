import Link from "next/link";
import { notFound } from "next/navigation";
import { UserPlus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortSessions, enrollmentCounts, cohortRoster } from "@/lib/queries/cohorts";
import { cohortAttendanceSummary } from "@/lib/services/attendance";
import { todayISO, formatThaiDate } from "@/lib/thai-date";
import { Stat, Alert, EmptyState } from "@/components/ui";
import { SessionCardView } from "@/components/session-card";
import { cohortLabel } from "@/lib/services/cohorts";

export const dynamic = "force-dynamic";

export default async function CohortOverview({ params }: PageProps<"/cohorts/[id]">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const { cohort, course } = row;
  const today = todayISO();
  const sessions = cohortSessions(db, cohort.id);
  const trainingDates = Array.from(new Set(sessions.map((s) => s.date)));
  const dayIndex = trainingDates.indexOf(today);
  const todays = sessions.filter((s) => s.date === today);
  const unchecked = sessions.filter((s) => s.takesAttendance && s.date <= today && !s.attendanceCheckedAt);
  const counts = enrollmentCounts(db, cohort.id);
  const summary = cohortAttendanceSummary(db, cohort.id, course.passAttendancePct, course.totalHours);
  const roster = cohortRoster(db, cohort.id);
  const pcts = [...summary.values()].map((s) => s.pct).filter((p): p is number => p != null);
  const avgPct = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : null;
  const below = roster.filter((r) => ["active", "draft"].includes(r.enrollment.status) && summary.get(r.enrollment.id)?.belowThreshold);
  const noPhoto = roster.filter((r) => !r.inc.thumbPath && ["active", "draft"].includes(r.enrollment.status)).length;
  const noConsent = roster.filter((r) => !r.enrollment.consentSigned && r.enrollment.status === "draft").length;
  const toMakeup = [...summary.values()].reduce((s, x) => s + x.needsMakeup, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        {dayIndex >= 0 ? (
          <p className="tag-ok text-base">วันนี้วันที่ {dayIndex + 1} จาก {trainingDates.length} ของหลักสูตร</p>
        ) : today < cohort.startDate ? (
          <p className="tag-muted text-base">เริ่มอบรม {formatThaiDate(cohort.startDate, "long")}</p>
        ) : today > cohort.endDate ? (
          <p className="tag-navy text-base">อบรมครบกำหนดแล้ว</p>
        ) : (
          <p className="tag-muted text-base">วันนี้ไม่มีกิจกรรม (วันหยุด)</p>
        )}
        {auth.can("registry.edit") && cohort.status !== "closed" && (
          <Link href={`/register?cohort=${cohort.id}`} className="btn-primary ml-auto"><UserPlus size={20} aria-hidden /> ลงทะเบียนเข้ารุ่นนี้</Link>
        )}
      </div>

      <section className="card grid grid-cols-2 gap-2 md:grid-cols-5">
        <Stat value={counts.active + counts.draft} label="คนในรุ่นตอนนี้" href={`/cohorts/${cohort.id}/roster`} />
        <Stat value={avgPct != null ? `${avgPct}%` : "-"} label="เข้าร่วมเฉลี่ย" tone={avgPct != null && avgPct < course.passAttendancePct ? "danger" : undefined} />
        <Stat value={counts.completed} label="ครบหลักสูตร" tone="ok" href={`/cohorts/${cohort.id}/roster?status=completed`} />
        <Stat value={counts.dropped} label="ออกก่อนกำหนด" href={`/cohorts/${cohort.id}/roster?status=dropped`} />
        <Stat value={unchecked.length} label="คาบที่ยังไม่เช็คชื่อ" tone={unchecked.length ? "warn" : undefined} href={`/cohorts/${cohort.id}/attendance`} />
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card">
          <h2 className="text-xl">กิจกรรมวันนี้</h2>
          <div className="mt-3 space-y-2">
            {todays.length ? todays.map((s) => (
              <SessionCardView key={s.id} today={today} s={{ id: s.id, cohortId: cohort.id, cohortLabel: cohortLabel(cohort), courseName: course.shortName, date: s.date, startTime: s.startTime, endTime: s.endTime, title: s.title, location: s.location, checked: !!s.attendanceCheckedAt, takesAttendance: s.takesAttendance }} />
            )) : <EmptyState title="วันนี้ไม่มีกิจกรรมของรุ่นนี้" />}
          </div>
        </section>
        <section className="card">
          <h2 className="text-xl">แจ้งเตือนของรุ่น</h2>
          <div className="mt-3 space-y-2">
            {unchecked.length > 0 && <Alert tone="warn">ยังไม่เช็คชื่อ {unchecked.length} คาบ — <Link className="underline" href={`/cohorts/${cohort.id}/attendance`}>ไปเช็คชื่อ</Link></Alert>}
            {counts.draft > 0 && <Alert tone="warn">มีผู้ลงทะเบียนเป็น &quot;ร่าง&quot; {counts.draft} คน รอยืนยันรับเข้า{noConsent ? ` (ยังไม่มีหลักฐานยินยอม ${noConsent} คน)` : ""} — <Link className="underline" href={`/cohorts/${cohort.id}/roster?status=draft`}>ตรวจและยืนยัน</Link></Alert>}
            {below.length > 0 && <Alert tone="danger">การเข้าร่วมต่ำกว่าเกณฑ์ {course.passAttendancePct}%: {below.length} คน — <Link className="underline" href={`/cohorts/${cohort.id}/roster?filter=below`}>ดูรายชื่อ</Link></Alert>}
            {toMakeup > 0 && <Alert tone="info">มีเหตุราชทัณฑ์ (ไปศาล/พบทนาย ฯลฯ) {toMakeup} ครั้ง — ควรพิจารณาจัดสอนชดเชย</Alert>}
            {noPhoto > 0 && <Alert tone="info">ยังไม่มีรูปถ่าย {noPhoto} คน — <Link className="underline" href={`/cohorts/${cohort.id}/roster?filter=nophoto`}>เพิ่มรูป</Link></Alert>}
            {!unchecked.length && !counts.draft && !below.length && !noPhoto && !toMakeup && <EmptyState title="ไม่มีเรื่องที่ต้องทำ" />}
          </div>
        </section>
      </div>
    </div>
  );
}
