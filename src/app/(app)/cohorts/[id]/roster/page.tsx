import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer, UserPlus } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortAttendanceSummary } from "@/lib/services/attendance";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { RosterTable, type RosterRow } from "./roster-table";

export const dynamic = "force-dynamic";

export default async function RosterPage({ params, searchParams }: PageProps<"/cohorts/[id]/roster">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const { cohort, course } = row;
  const summary = cohortAttendanceSummary(db, cohort.id, course.passAttendancePct, course.totalHours);
  const all: RosterRow[] = cohortRoster(db, cohort.id).map((r) => {
    const s = summary.get(r.enrollment.id);
    return {
      enrollmentId: r.enrollment.id,
      personId: r.person.id,
      name: `${r.person.prefix ?? ""}${r.person.firstName} ${r.person.lastName}`,
      inmateNo: r.inc.inmateNo,
      zone: r.inc.zone,
      thumb: r.inc.thumbPath ? `/api/files/photo/${r.inc.id}?s=thumb` : null,
      photo: r.inc.photoPath ? `/api/files/photo/${r.inc.id}` : null,
      status: r.enrollment.status,
      statusLabel: ENROLLMENT_STATUS_LABEL[r.enrollment.status] ?? r.enrollment.status,
      consentSigned: r.enrollment.consentSigned,
      consentRefused: r.enrollment.consentRefused,
      pct: s?.pct ?? null,
      sessions: s ? `${s.present}/${s.counted}` : "-",
      below: !!s?.belowThreshold,
      otherCourses: r.otherCourses,
      isReturnee: r.isReturnee,
      duplicateName: r.duplicateName,
      released: !!r.inc.releasedDate,
      override: r.enrollment.overrideSeq > 0,
    };
  });
  const status = typeof sp.status === "string" ? sp.status : "";
  const filter = typeof sp.filter === "string" ? sp.filter : "";
  const rows = all.filter((r) => (!status || r.status === status) && (filter !== "below" || r.below) && (filter !== "nophoto" || !r.thumb));

  return (
    <div className="space-y-4">
      <div className="no-print flex flex-wrap items-center gap-2">
        <FilterLink href="?" active={!status && !filter} label={`ทั้งหมด (${all.length})`} />
        {Object.entries(ENROLLMENT_STATUS_LABEL).map(([k, v]) => {
          const n = all.filter((r) => r.status === k).length;
          return n ? <FilterLink key={k} href={`?status=${k}`} active={status === k} label={`${v} (${n})`} /> : null;
        })}
        <FilterLink href="?filter=below" active={filter === "below"} label="ต่ำกว่าเกณฑ์" />
        <FilterLink href="?filter=nophoto" active={filter === "nophoto"} label="ไม่มีรูป" />
        <div className="ml-auto flex gap-2">
          <Link href={`/print/sign-sheet/${cohort.id}`} className="btn-ghost" target="_blank"><Printer size={20} aria-hidden /> พิมพ์ใบเซ็นชื่อ</Link>
          {auth.can("registry.edit") && cohort.status !== "closed" && (
            <Link href={`/register?cohort=${cohort.id}`} className="btn-primary"><UserPlus size={20} aria-hidden /> ลงทะเบียน</Link>
          )}
        </div>
      </div>
      <RosterTable rows={rows} cohortId={cohort.id} canEdit={auth.can("registry.edit")} passPct={course.passAttendancePct} />
    </div>
  );
}

function FilterLink({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link href={href} className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>
      {label}
    </Link>
  );
}
