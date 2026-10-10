import Link from "next/link";
import { redirect } from "next/navigation";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { assignedCohortIds, PERMISSIONS, type Permission } from "@/lib/auth/permissions";
import { openCohortOptions } from "@/lib/queries/home";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

/** งานที่ได้รับมอบหมายรายรุ่น (กลุ่ม B — สเปก 2.2-0, 2.2A): ญาติ/ผู้ติดต่อ · ติดตามหลังบำบัด · บันทึกพฤติกรรม */
export default async function AssignedPage() {
  const auth = await requirePage();
  const ids = assignedCohortIds(auth);
  if (!ids.length) redirect("/forbidden");
  const db = getDb();
  const today = todayISO();
  const cohorts = openCohortOptions(db, ids);
  const members = db
    .select({ e: schema.enrollments, p: schema.persons, inc: schema.incarcerations })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(inArray(schema.enrollments.cohortId, ids), isNull(schema.enrollments.deletedAt), inArray(schema.enrollments.status, ["active", "completed"])))
    .orderBy(asc(schema.persons.firstName))
    .all();
  const fus = members.length
    ? db.select().from(schema.followups).where(and(inArray(schema.followups.enrollmentId, members.map((m) => m.e.id)), eq(schema.followups.status, "pending"))).all()
    : [];
  const permsFor = (cohortId: number) => (["contacts.edit", "bst.view", "bst.edit", "behavior.edit"] as Permission[]).filter((p) => auth.scoped[p]?.includes(cohortId));

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "งานที่ได้รับมอบหมาย" }]} />
      <PageHeader en="Assigned Work" title="งานที่ได้รับมอบหมาย" subtitle="แสดงเฉพาะรุ่นและงานที่ได้รับมอบหมาย" />
      {cohorts.length === 0 && <EmptyState title="รุ่นที่ได้รับมอบหมายปิดรุ่นแล้ว" />}
      {cohorts.map((c) => {
        const list = members.filter((m) => m.e.cohortId === c.id);
        const perms = permsFor(c.id);
        return (
          <section key={c.id} className="card space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl">{c.label}</h2>
              {perms.map((p) => <span key={p} className="tag-navy">{PERMISSIONS[p]}</span>)}
            </div>
            {list.length === 0 ? <EmptyState title="ยังไม่มีผู้เข้าอบรมในรุ่นนี้" /> : (
              <ul className="divide-y divide-line">
                {list.map((m) => {
                  const due = fus.filter((f) => f.enrollmentId === m.e.id).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
                  return (
                    <li key={m.e.id} className="flex flex-wrap items-center gap-3 py-2">
                      <Link href={`/persons/${m.p.id}`} className="font-medium hover:underline">{m.p.prefix ?? ""}{m.p.firstName} {m.p.lastName}</Link>
                      <span className="text-sm text-muted">{m.inc.inmateNo} · {ENROLLMENT_STATUS_LABEL[m.e.status]}</span>
                      {due && (perms.includes("bst.view") || perms.includes("bst.edit")) && (
                        <span className={due.dueDate < today ? "tag-danger" : "tag-warn"}>ติดตามเดือนที่ {due.monthOffset} · กำหนด {formatThaiDate(due.dueDate)}</span>
                      )}
                      <Link href={`/enrollments/${m.e.id}`} className="btn-ghost btn-sm ml-auto">เปิดแฟ้ม</Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
