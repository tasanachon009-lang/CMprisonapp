import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { sessionRoster, attendanceVersion } from "@/lib/services/attendance";
import { cohortLabel } from "@/lib/services/cohorts";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, Alert } from "@/components/ui";
import { AttendanceForm } from "./attendance-form";

export const dynamic = "force-dynamic";

/** หน้า "คาบของฉัน" — เช็คชื่อ (ผลกิจกรรมจะเพิ่มในขั้นที่ 3) */
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
  const names = userNameMap(db);
  const version = attendanceVersion(rows.map((r) => r.record));
  const canNavigateCohort = auth.can("course.view");

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
          <p className="text-muted">{course.shortName} {cohortLabel(cohort)} · วันที่ {session.dayNo ?? "-"} ของหลักสูตร</p>
          <h1 className="text-3xl">{session.title}</h1>
          <p className="text-muted">{formatThaiDate(session.date, "full")} · {session.startTime}–{session.endTime} น. ({session.hours} ชม.){session.location ? ` · ${session.location}` : ""}</p>
        </div>
        <Link href={`/print/session-sheet/${session.id}`} target="_blank" className="btn-ghost no-print"><Printer size={20} aria-hidden /> พิมพ์ใบเช็คชื่อ</Link>
      </div>

      {session.attendanceCheckedAt && (
        <Alert tone="ok">
          เช็คชื่อแล้วโดย {names.get(session.attendanceCheckedBy ?? 0) ?? "-"} เมื่อ {formatThaiDateTime(session.attendanceCheckedAt)}
          {access.canEdit ? " — แก้ไขได้ ระบบจะบันทึกค่าเดิม→ค่าใหม่ไว้" : ""}
        </Alert>
      )}
      {session.lockedAt && <div className="mt-2"><Alert tone="warn">คาบนี้ถูกล็อกหลังอนุมัติค่าตอบแทน — แก้ได้เฉพาะหัวหน้า/รอง</Alert></div>}
      {!session.takesAttendance && <Alert tone="info">คาบนี้ตั้งค่าว่าไม่ต้องเช็คชื่อ</Alert>}

      {session.takesAttendance && (
        <div className="mt-4">
          <AttendanceForm
            sessionId={session.id}
            loadedVersion={version}
            readOnly={!access.canEdit || (!!session.lockedAt && !auth.isAdmin)}
            rows={rows.map((r) => ({
              enrollmentId: r.enrollmentId,
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
            }))}
          />
        </div>
      )}
    </div>
  );
}
