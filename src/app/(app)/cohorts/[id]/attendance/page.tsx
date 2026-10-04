import Link from "next/link";
import { notFound } from "next/navigation";
import { Keyboard } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { userNameMap } from "@/lib/queries/names";

export const dynamic = "force-dynamic";

export default async function CohortAttendancePage({ params }: PageProps<"/cohorts/[id]/attendance">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const sessions = cohortSessions(db, row.cohort.id).filter((s) => s.takesAttendance);
  const today = todayISO();
  const names = userNameMap(db);
  const byDate = new Map<string, typeof sessions>();
  for (const s of sessions) byDate.set(s.date, [...(byDate.get(s.date) ?? []), s]);
  const canEdit = auth.can("attendance.edit");

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex flex-wrap gap-2">
          <Link href={`/cohorts/${row.cohort.id}/attendance/quick`} className="btn-secondary"><Keyboard size={20} aria-hidden /> โหมดกรอกเร็ว (เช็คชื่อย้อนหลัง)</Link>
        </div>
      )}
      <div className="space-y-3">
        {[...byDate.entries()].map(([date, list], i) => (
          <section key={date} className={`panel p-4 ${date === today ? "ring-2 ring-navy" : ""}`}>
            <h2 className="text-lg">วันที่ {i + 1} · {formatThaiDate(date, "full")} {date === today && <span className="tag-navy ml-2">วันนี้</span>}</h2>
            <ul className="mt-2 divide-y divide-line">
              {list.map((s) => {
                const status = s.attendanceCheckedAt ? "done" : s.date < today ? "overdue" : s.date === today ? "today" : "future";
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2">
                    <span className="w-28 font-display font-semibold text-navy">{s.startTime}–{s.endTime}</span>
                    <Link href={`/sessions/${s.id}`} className="flex-1 font-medium hover:underline">{s.title}</Link>
                    {status === "done" && <span className="tag-ok">เช็คแล้ว · {names.get(s.attendanceCheckedBy ?? 0) ?? ""}</span>}
                    {status === "overdue" && <span className="tag-danger">เลยกำหนด ยังไม่เช็ค</span>}
                    {status === "today" && <span className="tag-warn">ยังไม่เช็ค</span>}
                    {status === "future" && <span className="tag-muted">ยังไม่ถึง</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
