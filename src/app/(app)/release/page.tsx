import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { lookupsOf } from "@/lib/queries/lookups";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { ReleaseForm, CancelReleaseButton } from "./release-form";

export const dynamic = "force-dynamic";

/** บันทึกการออกจากเรือนจำ — บันทึกเมื่อทราบว่าออกไปแล้วเท่านั้น (สเปก 8) */
export default async function ReleasePage() {
  const auth = await requirePage("release.view");
  const db = getDb();
  const reasons = lookupsOf(db, "release_reason");
  const reasonLabel = new Map(reasons.map((r) => [r.code, r.label]));
  const names = userNameMap(db);
  const recent = db
    .select({ ev: schema.releaseEvents, inc: schema.incarcerations, p: schema.persons })
    .from(schema.releaseEvents)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.releaseEvents.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .orderBy(desc(schema.releaseEvents.id))
    .limit(50)
    .all();
  const canEdit = auth.can("release.edit");

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "บันทึกออกจากเรือนจำ" }]} />
      <PageHeader en="Release Records" title="บันทึกออกจากเรือนจำ" subtitle="ไม่ต้องกรอกวันพ้นโทษล่วงหน้า — บันทึกเมื่อทราบว่าออกไปแล้วเท่านั้น ระบบจะปรับสถานะการอบรมและการเช็คชื่อให้อัตโนมัติ" />
      {canEdit && <ReleaseForm reasons={reasons} today={todayISO()} />}
      <section className="card">
        <h2 className="text-xl">รายการล่าสุด</h2>
        {recent.length === 0 ? <div className="mt-3"><EmptyState title="ยังไม่มีการบันทึก" /></div> : (
          <div className="mt-3 overflow-x-auto">
            <table className="table-plain">
              <thead><tr><th>วันที่ออก</th><th>ชื่อ-สกุล</th><th>เลขประจำตัว</th><th>เหตุผล</th><th>บันทึกโดย</th><th>สถานะ</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {recent.map(({ ev, inc, p }) => (
                  <tr key={ev.id} className={ev.cancelledAt ? "text-muted line-through" : ""}>
                    <td>{formatThaiDate(ev.releasedDate)}</td>
                    <td><Link href={`/persons/${p.id}`} className="hover:underline">{p.prefix}{p.firstName} {p.lastName}</Link></td>
                    <td className="font-mono">{inc.inmateNo}</td>
                    <td>{reasonLabel.get(ev.reason) ?? ev.reason}{ev.note ? ` · ${ev.note}` : ""}</td>
                    <td className="text-sm">{names.get(ev.createdBy ?? 0)}<br /><span className="text-muted">{formatThaiDateTime(ev.createdAt)}</span></td>
                    <td>{ev.cancelledAt ? <span className="tag-muted no-underline" title={ev.cancelReason ?? ""}>ยกเลิกแล้ว</span> : <span className="tag-navy">มีผล</span>}</td>
                    {canEdit && <td>{!ev.cancelledAt && <CancelReleaseButton eventId={ev.id} label={`${p.firstName} ${p.lastName}`} />}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
