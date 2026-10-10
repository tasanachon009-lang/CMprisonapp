import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage, clientIp } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getInstructor } from "@/lib/services/instructors";
import { presentSensitive } from "@/lib/instructor-rules";
import { userNameMap } from "@/lib/queries/names";
import { writeAudit } from "@/lib/audit";
import { formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, RecordMeta, Alert } from "@/components/ui";
import { InstructorForm } from "../instructor-form";
import { staffOptions } from "../load";

export const dynamic = "force-dynamic";

export default async function InstructorPage({ params }: PageProps<"/instructors/[id]">) {
  const auth = await requirePage("instructors.view");
  const { id } = await params;
  const db = getDb();
  const x = getInstructor(db, Number(id));
  if (!x) notFound();
  const full = auth.can("instructors.sensitive");
  const canEdit = auth.can("instructors.manage");
  const sens = presentSensitive(x, full);
  if (full && (x.nationalId || x.accountNo)) {
    // เปิดดูข้อมูลอ่อนไหวของวิทยากรแบบเต็ม → บันทึกการเปิดดู
    writeAudit(db, { userId: auth.user.id, action: "view_sensitive", entity: "instructor", entityId: x.id, ip: await clientIp() });
  }
  const names = userNameMap(db);
  const v = (s: string | null | undefined) => s ?? "";
  return (
    <div className="max-w-5xl space-y-6">
      <Breadcrumb items={[{ href: "/instructors", label: "ทะเบียนวิทยากร" }, { label: x.fullName || "วิทยากร" }]} />
      <PageHeader en="Instructor" title={x.fullName || "วิทยากร"} subtitle={x.kind === "internal" ? "วิทยากรภายใน" : "วิทยากรภายนอก"} help="วิทยากรภายในใช้ชื่อจากบัญชีผู้ใช้ เติมเฉพาะเลขบัตร ที่อยู่ และบัญชีรับเงินโอน ค้นตำบลโดยพิมพ์ชื่อตำบลตามด้วยอำเภอหรือจังหวัด หรือพิมพ์รหัสไปรษณีย์"
        actions={<Link href={`/print/instructor-form?id=${x.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์แบบฟอร์มขอข้อมูล (เติมเท่าที่มี)</Link>} />
      <RecordMeta createdBy={names.get(x.createdBy ?? 0)} createdAt={formatThaiDateTime(x.createdAt)} updatedBy={names.get(x.updatedBy ?? 0)} updatedAt={formatThaiDateTime(x.updatedAt)} />
      {!canEdit && <Alert tone="info">ดูอย่างเดียว</Alert>}
      <fieldset disabled={!canEdit}>
        <InstructorForm
          id={x.id}
          version={x.version}
          users={staffOptions(db)}
          canSensitive={full}
          today={todayISO()}
          masked={{ nationalId: sens.nationalId, accountNo: sens.accountNo }}
          initial={{
            kind: x.kind as "internal", userId: x.userId, externalType: x.externalType, prefix: v(x.kind === "internal" ? null : x.prefix), firstName: v(x.kind === "internal" ? null : x.firstName), lastName: v(x.kind === "internal" ? null : x.lastName),
            position: v(x.kind === "internal" ? null : x.position), organization: v(x.organization), phone: v(x.phone), email: v(x.email),
            nationalId: full ? v(x.nationalId) : "",
            addrHouseNo: full ? v(x.addrHouseNo) : (x.addrHouseNo ? "•••" : ""), addrMoo: full ? v(x.addrMoo) : "", addrSoi: full ? v(x.addrSoi) : "", addrRoad: full ? v(x.addrRoad) : "",
            addrSubdistrictId: x.addrSubdistrictId, addrSubdistrict: v(x.addrSubdistrict), addrDistrict: v(x.addrDistrict), addrProvince: v(x.addrProvince), addrPostcode: v(x.addrPostcode),
            payeeType: (x.payeeType as "person") ?? "person", companyName: v(x.companyName), bank: v(x.bank), bankBranch: v(x.bankBranch), accountType: v(x.accountType), accountName: v(x.accountName),
            accountNo: full ? v(x.accountNo) : "", notifyChannel: v(x.notifyChannel), bankBookReceived: x.bankBookReceived, bankBookReceivedDate: v(x.bankBookReceivedDate),
            expertise: v(x.expertise), note: v(x.note),
          }}
        />
      </fieldset>
    </div>
  );
}
