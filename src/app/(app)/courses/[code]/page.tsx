import Link from "next/link";
import { notFound } from "next/navigation";
import { Plus, CalendarRange } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCourseByCode, cohortsOfCourse, fiscalYearsOfCourse } from "@/lib/queries/cohorts";
import { COHORT_STATUS_LABEL, cohortLabel, effectiveCohortStatus } from "@/lib/services/cohorts";
import { currentFiscalYear, diffDays, formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, EmptyState, PageHeader, Progress } from "@/components/ui";

export const dynamic = "force-dynamic";

const STATUS_TAG: Record<string, string> = { planned: "tag-muted", active: "tag-ok", ended: "tag-warn", closed: "tag-navy" };

export default async function CoursePage({ params, searchParams }: PageProps<"/courses/[code]">) {
  const auth = await requirePage("course.view");
  const { code } = await params;
  const sp = await searchParams;
  const db = getDb();
  const course = getCourseByCode(db, code);
  if (!course || !course.enabled) notFound();
  const fyNow = currentFiscalYear();
  const fy = Number(sp.fy) || fyNow;
  const years = Array.from(new Set([fyNow + 1, fyNow, ...fiscalYearsOfCourse(db, course.id)])).sort((a, b) => b - a);
  const cohorts = cohortsOfCourse(db, course.id, fy);
  const today = todayISO();

  return (
    <div>
      <Breadcrumb items={[{ href: "/courses", label: "หลักสูตร" }, { label: course.name }]} />
      <PageHeader
        en="Program"
        title={course.name}
        subtitle={`${course.durationDays} วัน · ${course.totalHours} ชั่วโมง · เกณฑ์เข้าร่วม ${course.passAttendancePct}%`}
        actions={
          auth.can("course.manage") && (
            <Link href={`/cohorts/new?course=${course.code}`} className="btn-primary"><Plus size={20} aria-hidden /> สร้างรุ่นใหม่</Link>
          )
        }
      />
      <div className="mb-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="ปีงบประมาณ">
        <span className="mr-1 font-semibold">ปีงบประมาณ</span>
        {years.map((y) => (
          <Link key={y} href={`?fy=${y}`} role="tab" aria-selected={y === fy} className={`btn-sm rounded-full px-4 font-semibold ${y === fy ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"} inline-flex min-h-9 items-center`}>
            {y}{y === fyNow && " (ปีนี้)"}
          </Link>
        ))}
      </div>

      {cohorts.length === 0 ? (
        <EmptyState title={`ยังไม่มีรุ่นในปีงบประมาณ ${fy}`}>
          {auth.can("course.manage") ? "กดปุ่ม \"สร้างรุ่นใหม่\" ด้านบนเพื่อเริ่ม" : "ผู้ดูแลระบบเป็นผู้สร้างรุ่น"}
        </EmptyState>
      ) : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {cohorts.map((c) => {
            const st = effectiveCohortStatus(c, today);
            const total = diffDays(c.startDate, c.endDate) + 1;
            const passed = Math.min(total, Math.max(0, diffDays(c.startDate, today) + 1));
            return (
              <Link key={c.id} href={`/cohorts/${c.id}`} className="card block transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-2xl">{cohortLabel(c)}</h2>
                  <span className={STATUS_TAG[st]}>{COHORT_STATUS_LABEL[st]}</span>
                </div>
                <p className="mt-1 flex items-center gap-1 text-muted"><CalendarRange size={16} aria-hidden /> {formatThaiDate(c.startDate)} – {formatThaiDate(c.endDate)}</p>
                <div className="mt-4 flex gap-6">
                  <div>
                    <p className="font-display text-3xl font-bold text-navy">{c.counts.total}</p>
                    <p className="text-sm text-muted">คน{c.targetCount ? ` (เป้า ${c.targetCount})` : ""}</p>
                  </div>
                  {c.counts.draft > 0 && (
                    <div>
                      <p className="font-display text-3xl font-bold text-warn">{c.counts.draft}</p>
                      <p className="text-sm text-muted">รอยืนยันรับเข้า</p>
                    </div>
                  )}
                  {c.counts.completed > 0 && (
                    <div>
                      <p className="font-display text-3xl font-bold text-ok">{c.counts.completed}</p>
                      <p className="text-sm text-muted">ครบหลักสูตร</p>
                    </div>
                  )}
                </div>
                <div className="mt-4"><Progress value={(passed / total) * 100} label={st === "planned" ? "ยังไม่เริ่ม" : st === "active" ? `วันที่ ${passed} จาก ${total} วัน (ปฏิทิน)` : "ครบกำหนดแล้ว"} /></div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
