import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { InstructorForm } from "../instructor-form";
import { staffOptions, emptyInstructor } from "../load";

export const dynamic = "force-dynamic";

export default async function NewInstructorPage({ searchParams }: PageProps<"/instructors/new">) {
  const auth = await requirePage("instructors.manage");
  const sp = await searchParams;
  const kind = sp.kind === "internal" ? "internal" : "external";
  return (
    <div className="max-w-5xl space-y-6">
      <Breadcrumb items={[{ href: "/instructors", label: "ทะเบียนวิทยากร" }, { label: "เพิ่มวิทยากร" }]} />
      <PageHeader en="New Instructor" title="เพิ่มวิทยากร" help="วิทยากรภายในใช้ชื่อจากบัญชีผู้ใช้ เติมเฉพาะเลขบัตร ที่อยู่ และบัญชีรับเงินโอน ค้นตำบลโดยพิมพ์ชื่อตำบลตามด้วยอำเภอหรือจังหวัด หรือพิมพ์รหัสไปรษณีย์" />
      <InstructorForm id={null} initial={emptyInstructor(kind)} users={staffOptions(getDb())} canSensitive={auth.can("instructors.sensitive")} today={todayISO()} masked={{ nationalId: "", accountNo: "" }} />
    </div>
  );
}
