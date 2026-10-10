import Link from "next/link";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { lookupsOf } from "@/lib/queries/lookups";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { RegisterWizard } from "./wizard";

export const dynamic = "force-dynamic";

export default async function RegisterPage({ searchParams }: PageProps<"/register">) {
  const auth = await requirePage("registry.edit");
  const sp = await searchParams;
  const db = getDb();
  const cohortId = Number(sp.cohort);
  const row = cohortId ? getCohort(db, cohortId) : null;

  if (!row) {
    const open = db
      .select({ c: schema.cohorts, course: schema.courses })
      .from(schema.cohorts)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
      .where(and(inArray(schema.cohorts.status, ["planned", "active"]), eq(schema.courses.enabled, true), isNull(schema.cohorts.deletedAt)))
      .orderBy(asc(schema.cohorts.startDate))
      .all();
    return (
      <div className="max-w-2xl">
        <Breadcrumb items={[{ label: "ลงทะเบียน" }]} />
        <PageHeader en="Registration" title="ลงทะเบียนเข้ารุ่น" subtitle="เลือกรุ่นที่จะลงทะเบียน" />
        {open.length ? (
          <ul className="space-y-2">
            {open.map(({ c, course }) => (
              <li key={c.id}><Link href={`/register?cohort=${c.id}`} className="card block hover:shadow-md"><b>{course.shortName} {cohortLabel(c)}</b> <span className="text-muted">· {formatThaiDate(c.startDate)} – {formatThaiDate(c.endDate)}</span></Link></li>
            ))}
          </ul>
        ) : <EmptyState title="ยังไม่มีรุ่นที่เปิดรับ">ผู้ดูแลต้องสร้างรุ่นก่อนในหน้า &quot;หลักสูตร&quot;</EmptyState>}
      </div>
    );
  }

  const { cohort, course } = row;
  const staff = db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).where(eq(schema.users.status, "active")).all();
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/courses", label: "หลักสูตร" }, { href: `/cohorts/${cohort.id}`, label: `${course.shortName} ${cohortLabel(cohort)}` }, { label: "ลงทะเบียน" }]} />
      <PageHeader en="Registration" title="ลงทะเบียนเข้ารุ่น" subtitle={`${course.name} ${cohortLabel(cohort)}`} help="ช่องบังคับ: เลขประจำตัว ชื่อ และนามสกุล ข้อมูลอื่นกรอกภายหลังได้ ระบบบันทึกร่างทุก 30 วินาที เลขประจำตัวแก้ไม่ได้หลังบันทึก เลขบัตรใช้ค้นประวัติเดิม ถ้าไม่มี ระบบเทียบชื่อ-สกุลและวันเกิด กรณีไม่ยินยอม ระบบแจ้งผู้ดูแลระบบ" />
      <RegisterWizard
        cohortId={cohort.id}
        cohortStatus={cohort.status}
        today={todayISO()}
        criteria={course.intakeCriteria as Parameters<typeof RegisterWizard>[0]["criteria"]}
        lookups={{ prisonerClass: lookupsOf(db, "prisoner_class"), substance: lookupsOf(db, "substance") }}
        staff={staff.map((s) => ({ id: s.id, name: `${s.f} ${s.l}` }))}
        me={auth.user.id}
        canOverride={auth.can("registry.override_duplicate")}
        canRevealId={auth.can("national_id.view_full")}
        initialInmateNo={typeof sp.inmate === "string" ? sp.inmate.trim().slice(0, 30) || undefined : undefined}
      />
    </div>
  );
}
