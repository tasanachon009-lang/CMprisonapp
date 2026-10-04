import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel, COHORT_STATUS_LABEL, effectiveCohortStatus } from "@/lib/services/cohorts";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb } from "@/components/ui";
import { CohortTabs } from "./tabs";
import { RememberCohort } from "@/components/remember-cohort";

export default async function CohortLayout({ children, params }: LayoutProps<"/cohorts/[id]">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const row = getCohort(getDb(), Number(id));
  if (!row) notFound();
  const { cohort, course } = row;
  const st = effectiveCohortStatus(cohort, todayISO());
  const label = cohortLabel(cohort);
  return (
    <div>
      <Breadcrumb items={[
        { href: "/courses", label: "หลักสูตร" },
        { href: `/courses/${course.code.toLowerCase()}?fy=${cohort.fiscalYear}`, label: `${course.shortName} · ปีงบ ${cohort.fiscalYear}` },
        { label },
      ]} />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p lang="en" className="font-display text-sm font-medium uppercase tracking-[0.18em] text-navy">Cohort</p>
          <p className="text-muted">{course.name}</p>
          <h1 className="text-3xl">{label}</h1>
          <p className="text-muted">{formatThaiDate(cohort.startDate)} – {formatThaiDate(cohort.endDate)} · {COHORT_STATUS_LABEL[st]}</p>
        </div>
      </div>
      <CohortTabs
        id={cohort.id}
        isFast={course.code === "FAST"}
        show={{
          assessments: auth.can("assessment.view") || auth.can("health.view") || auth.can("assessment.summary"),
          health: auth.can("health.view") || auth.can("health.summary"),
          reports: auth.can("reports.view") || auth.can("dashboard.view"),
        }}
      />
      <RememberCohort id={cohort.id} label={`${course.shortName} ${label}`} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
