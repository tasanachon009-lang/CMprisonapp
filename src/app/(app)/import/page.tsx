import { and, asc, eq, isNull } from "drizzle-orm";
import { Download } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { cohortLabel } from "@/lib/services/cohorts";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { ImportForm } from "./import-form";

export const dynamic = "force-dynamic";

export default async function ImportPage({ searchParams }: PageProps<"/import">) {
  await requirePage("registry.import");
  const sp = await searchParams;
  const cohorts = getDb()
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(isNull(schema.cohorts.deletedAt)))
    .orderBy(asc(schema.courses.sortOrder), asc(schema.cohorts.startDate))
    .all();
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "นำเข้า Excel" }]} />
      <PageHeader
        en="Import" title="นำเข้ารายชื่อจาก Excel"
        help="ใช้ลงทะเบียนจำนวนมาก หรือนำเข้ารุ่นเก่าย้อนหลังพร้อมสถานะ ระบบตรวจกฎกันซ้ำทุกแถวก่อนนำเข้า แถวที่ไม่ผ่านดาวน์โหลดไปแก้แล้วนำเข้าใหม่ได้ แถว “กำลังอบรม” ที่ยังไม่ลงนามยินยอมจะนำเข้าเป็นร่าง"
        actions={<a href="/api/import/template" className="btn-secondary"><Download size={20} aria-hidden /> ดาวน์โหลดแม่แบบ Excel</a>}
      />
      <ImportForm
        defaultCohort={Number(sp.cohort) || undefined}
        cohorts={cohorts.map(({ c, course }) => ({ id: c.id, label: `${course.shortName} ${cohortLabel(c)}${c.status === "closed" ? " (ปิดแล้ว)" : ""}`, closed: c.status === "closed" }))}
      />
    </div>
  );
}
