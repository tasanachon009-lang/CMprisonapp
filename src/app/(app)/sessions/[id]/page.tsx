import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { sessionRoster, attendanceVersion } from "@/lib/services/attendance";
import { cohortLabel } from "@/lib/services/cohorts";
import { activeStaff, STAFF_ROLE_LABEL } from "@/lib/services/schedule";
import { reportOf, sessionStarted, makeupNeeded, chipsForSession, OUTCOME_LABEL, PARTICIPATION_LABEL } from "@/lib/services/session-close";
import { getSetting } from "@/lib/bootstrap";
import { userNameMap, instructorNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, Alert } from "@/components/ui";
import { AttendanceForm } from "./attendance-form";
import { SessionCloseForm, MakeupButton } from "./session-close";

export const dynamic = "force-dynamic";

/** หน้า "คาบของฉัน" — เช็คชื่อ + ผลกิจกรรม + สอนจริง → "บันทึกและปิดคาบ" (สเปก 11.5, 22B) */
export default async function SessionPage({ params }: PageProps<"/sessions/[id]">) {
  const auth = await requirePage();
  const { id } = await params;
  const db = getDb();
  let data;
  try {
    data = sessionRoster(db, Number(id));
  } catch {
    notFound();
  }
  const { session, rows } = data;
  const access = sessionAccess(auth, session.id, session.cohortId);
  if (!access.canView) redirect("/forbidden");
  const { cohort, course } = getCohort(db, session.cohortId)!;
  // "ครั้งที่ x/y" ของรุ่น (เฉพาะคาบที่เช็คชื่อ)
  const all = cohortSessions(db, cohort.id);
  const allSessions = all.filter((s) => s.takesAttendance);
  const nth = allSessions.findIndex((s) => s.id === session.id) + 1;
  const names = userNameMap(db);
  const insNames = instructorNameMap(db);
  const version = attendanceVersion(rows.map((r) => r.record));
  const staff = activeStaff(db, [session.id]).sort((a, b) => (a.role === "lead" ? -1 : 0) - (b.role === "lead" ? -1 : 0));
  const staffName = (x: (typeof staff)[number]) => (x.userId ? names.get(x.userId) ?? "-" : (x.instructorId ? insNames.get(x.instructorId) : x.externalName) ?? "-");
  const canNavigateCohort = auth.can("course.view");
  const report = reportOf(db, session.id);
  const started = sessionStarted(session);
  const cancelled = session.status === "cancelled";
  const editable = access.canEdit && (!session.lockedAt || auth.isAdmin) && cohort.status !== "closed" && !cancelled;
  const makeup = session.makeupOfId ? null : makeupNeeded(db, cohort.id).get(session.id) ?? null;
  const original = session.makeupOfId ? all.find((s) => s.id === session.makeupOfId) : null;

  const attendanceRows = rows.map((r) => ({
    enrollmentId: r.enrollmentId,
    incarcerationId: r.incarcerationId,
    name: `${r.prefix ?? ""}${r.firstName} ${r.lastName}`,
    inmateNo: r.inmateNo,
    zone: r.zone,
    thumb: r.thumbPath ? `/api/files/photo/${r.incarcerationId}?s=thumb` : null,
    duplicateName: r.duplicateName,
    draft: r.enrollmentStatus === "draft",
    status: (r.record?.status as never) ?? "present",
    correctionsType: r.record?.correctionsType ?? null,
    note: r.record?.note ?? null,
    saved: !!r.record,
  }));

  return (
    <div>
      <Breadcrumb items={canNavigateCohort ? [
        { href: "/courses", label: "หลักสูตร" },
        { href: `/cohorts/${cohort.id}`, label: `${course.shortName} ${cohortLabel(cohort)}` },
        { href: `/cohorts/${cohort.id}/attendance`, label: "เช็คชื่อ" },
        { label: session.title },
      ] : [{ href: "/", label: "หน้าแรก" }, { label: session.title }]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-muted">{course.shortName} {cohortLabel(cohort)} · วันที่ {session.dayNo ?? "-"} ของหลักสูตร{nth > 0 ? ` · ครั้งที่ ${nth}/${allSessions.length}` : ""}</p>
          <h1 className="text-3xl">{session.title}</h1>
          <p className="text-muted">{formatThaiDate(session.date, "full")} · {session.startTime}–{session.endTime} น. ({session.hours} ชม.){session.location ? ` · ${session.location}` : ""}</p>
          <p className="mt-1">วิทยากร: {staff.length ? staff.map((x) => `${staffName(x)}${x.userId ? "" : " (ภายนอก)"}${x.role ? ` – ${STAFF_ROLE_LABEL[x.role]}` : ""}`).join(", ") : <span className="text-muted">ยังไม่ระบุ</span>}</p>
        </div>
        <div className="no-print flex flex-wrap gap-2">
          {session.takesAttendance && <Link href={`/print/session-sheet/${session.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> ใบเช็คชื่อ</Link>}
          {staff.some((x) => !x.userId) && <Link href={`/print/speaker-note/${session.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> ใบบันทึกหลังสอน (วิทยากร)</Link>}
          {session.taughtAt && <Link href={`/print/session-report?session=${session.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> บันทึกผลการจัดกิจกรรม</Link>}
        </div>
      </div>

      <div className="space-y-2">
        {cancelled && <Alert tone="warn">คาบนี้ถูกยกเลิก</Alert>}
        {original && <Alert tone="info">คาบชดเชยของ <Link className="underline" href={`/sessions/${original.id}`}>{original.title} ({formatThaiDate(original.date)})</Link> — รายชื่อเฉพาะผู้ที่ติดเหตุราชทัณฑ์ในคาบเดิม</Alert>}
        {makeup && (
          <Alert tone={makeup.makeupId ? "ok" : "warn"}>
            {makeup.makeupId
              ? <>มีคาบชดเชยแล้ว — <Link className="underline" href={`/sessions/${makeup.makeupId}`}>ไปที่คาบชดเชย</Link></>
              : <><span className="font-semibold">ควรจัดสอนชดเชย</span> — ผู้ติดเหตุราชทัณฑ์ {makeup.count} คน</>}
            {!makeup.makeupId && auth.can("schedule.edit") && cohort.status !== "closed" && (
              <MakeupButton sessionId={session.id} date={session.date} startTime={session.startTime} endTime={session.endTime} hours={session.hours} location={session.location} />
            )}
          </Alert>
        )}
        {session.attendanceCheckedAt && (
          <Alert tone="ok">
            เช็คชื่อแล้วโดย {names.get(session.attendanceCheckedBy ?? 0) ?? "-"} เมื่อ {formatThaiDateTime(session.attendanceCheckedAt)}
            {editable ? " — แก้ไขได้ ระบบจะบันทึกค่าเดิม→ค่าใหม่ไว้" : ""}
          </Alert>
        )}
        {report && session.taughtAt && (
          <Alert tone={report.outcome === "not_done" ? "warn" : "ok"}>
            ผลกิจกรรม: <b>{OUTCOME_LABEL[report.outcome]}</b>{report.reason ? ` (${report.reason})` : ""}
            {report.participation ? ` · การมีส่วนร่วม ${PARTICIPATION_LABEL[report.participation]}` : ""} · ผู้เข้าร่วม {report.participants} คน
            <br />บันทึกโดย {names.get(session.taughtBy ?? 0) ?? "-"} เมื่อ {formatThaiDateTime(session.taughtAt)}
            {report.proxyEntry && <span className="tag-orange ml-2">บันทึกแทนผู้สอน</span>}
            {report.source === "paper_copy" && <span className="tag-muted ml-2">คัดลอกจากใบบันทึกของวิทยากร</span>}
          </Alert>
        )}
        {session.lockedAt && <Alert tone="warn">คาบนี้ถูกล็อกหลังอนุมัติค่าตอบแทน</Alert>}
        {!session.takesAttendance && <Alert tone="info">คาบนี้ตั้งค่าว่าไม่ต้องเช็คชื่อ</Alert>}
      </div>

      <div className="mt-4">
        {editable ? (
          <SessionCloseForm
            sessionId={session.id}
            attendance={session.takesAttendance ? { rows: attendanceRows, loadedVersion: version, canNote: auth.can("behavior.edit") } : null}
            staff={staff.map((x) => ({ id: x.id, name: staffName(x), external: !x.userId, didTeach: x.didTeach, actualHours: x.actualHours }))}
            hours={session.hours}
            initial={report ? { outcome: report.outcome as never, reason: report.reason ?? "", participation: report.participation ?? "", summary: report.summary ?? "", issues: report.issues ?? "", chips: (report.chips as string[] | null) ?? [], source: report.source === "paper_copy" ? "paper_copy" : "direct" } : null}
            hasExternal={staff.some((x) => !x.userId)}
            chips={chipsForSession(db, session, getSetting<string[]>(db, "report.generalChips", []))}
            reasons={getSetting<{ partial: string[]; not_done: string[] }>(db, "report.reasons", { partial: [], not_done: [] })}
            canShift={auth.can("shift.use")}
            started={started}
            closed={!!session.taughtAt}
            proxyHint={!staff.some((x) => x.userId === auth.user.id)}
          />
        ) : (
          <>
            {session.takesAttendance && <AttendanceForm sessionId={session.id} loadedVersion={version} readOnly canNote={auth.can("behavior.edit")} rows={attendanceRows} />}
            {report?.summary && <section className="card mt-4"><h2 className="text-xl">สรุป</h2><p>{report.summary}</p>{report.issues && <p className="mt-2 text-muted">ปัญหา/ข้อเสนอแนะ: {report.issues}</p>}</section>}
          </>
        )}
      </div>
    </div>
  );
}
