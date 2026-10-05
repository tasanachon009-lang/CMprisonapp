import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getCourseByCode } from "@/lib/queries/cohorts";
import { nextCohortNumber, cohortLabel } from "@/lib/services/cohorts";
import { currentFiscalYear, formatThaiDate } from "@/lib/thai-date";
import { lookupsOf } from "@/lib/queries/lookups";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { NewCohortForm } from "./new-cohort-form";

export const dynamic = "force-dynamic";

export default async function NewCohortPage({ searchParams }: PageProps<"/cohorts/new">) {
  await requirePage("course.manage");
  const sp = await searchParams;
  const db = getDb();
  const course = getCourseByCode(db, String(sp.course ?? "B12"));
  if (!course || !course.enabled) notFound();
  const fy = currentFiscalYear();
  return (
    <div className="max-w-2xl">
      <Breadcrumb items={[{ href: "/courses", label: "หลักสูตร" }, { href: `/courses/${course.code.toLowerCase()}`, label: course.name }, { label: "สร้างรุ่นใหม่" }]} />
      <PageHeader en="New Cohort" title="สร้างรุ่นใหม่" subtitle={`${course.name} — ระบบคำนวณวันสิ้นสุด (ข้ามวันหยุด) และสร้างตารางจากแม่แบบ หรือคัดลอกจากรุ่นก่อน (เลื่อนวันที่ให้อัตโนมัติ)`} />
      <NewCohortForm
        courseId={course.id}
        courseCode={course.code}
        suggestedNumber={nextCohortNumber(db, course.id, fy)}
        fiscalYear={fy}
        locations={lookupsOf(db, "location").map((l) => l.label)}
        sources={db.select().from(schema.cohorts).where(and(eq(schema.cohorts.courseId, course.id), isNull(schema.cohorts.deletedAt))).orderBy(desc(schema.cohorts.startDate)).limit(12).all().map((c) => ({ id: c.id, label: `${cohortLabel(c)} (เริ่ม ${formatThaiDate(c.startDate)})` }))}
      />
    </div>
  );
}
