import Link from "next/link";
import { and, desc, eq, gte, lte, like, type SQL } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDateTime, isValidISODate } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const ACTION_TH: Record<string, string> = {
  "login.success": "เข้าระบบ", "login.fail": "เข้าระบบไม่สำเร็จ", logout: "ออกจากระบบ", "device.trust": "เครื่องผ่านรหัสหน่วยงาน", "device.fail": "รหัสหน่วยงานผิด",
  create: "เพิ่ม", update: "แก้ไข", delete: "ลบ", view_sensitive: "เปิดดูข้อมูลอ่อนไหว", print: "พิมพ์", export: "ส่งออก", backup: "สำรองข้อมูล", restore: "กู้คืน",
  "permission.change": "เปลี่ยนสิทธิ์", "password.change": "เปลี่ยนรหัสผ่าน", "password.reset": "รีเซ็ตรหัสผ่าน", "release.record": "บันทึกออกจากเรือนจำ", "release.cancel": "ยกเลิกบันทึกออก",
  "attendance.check": "เช็คชื่อ", "enrollment.override_duplicate": "ปลดล็อกลงซ้ำ", import: "นำเข้า Excel", "import.commit": "นำเข้า Excel", unlock: "ปลดล็อกหน้าจอ", "unlock.fail": "ปลดล็อกหน้าจอไม่สำเร็จ",
  "user.suspend": "ระงับบัญชี", "user.reactivate": "เปิดบัญชี", "dual.request": "ขอยืนยัน 2 คน", "dual.approve": "ยืนยัน 2 คน", "dual.approve_emergency": "ใช้รหัสฉุกเฉิน", "settings.change": "เปลี่ยนตั้งค่า",
  "photo.upload": "อัปโหลดรูป", "inmate_no.change": "แก้เลขประจำตัว", "org_code.change": "เปลี่ยนรหัสหน่วยงาน",
};

/** ค้นหาประวัติตามผู้ใช้ / ผู้ต้องขัง / ช่วงวันที่ — ดูอย่างเดียว ไม่มีปุ่มแก้/ลบ */
export default async function AuditPage({ searchParams }: PageProps<"/admin/audit">) {
  await requirePage("audit.view");
  const sp = await searchParams;
  const db = getDb();
  const names = userNameMap(db);
  const userId = Number(sp.user) || null;
  const personId = Number(sp.person) || null;
  const from = typeof sp.from === "string" && isValidISODate(sp.from) ? sp.from : null;
  const to = typeof sp.to === "string" && isValidISODate(sp.to) ? sp.to : null;
  const action = typeof sp.action === "string" ? sp.action : "";
  const conds: SQL[] = [];
  if (userId) conds.push(eq(schema.auditLogs.userId, userId));
  if (personId) conds.push(eq(schema.auditLogs.personId, personId));
  if (from) conds.push(gte(schema.auditLogs.at, new Date(`${from}T00:00:00+07:00`)));
  if (to) conds.push(lte(schema.auditLogs.at, new Date(`${to}T23:59:59+07:00`)));
  if (action) conds.push(like(schema.auditLogs.action, `${action}%`));
  const rows = db.select().from(schema.auditLogs).where(conds.length ? and(...conds) : undefined).orderBy(desc(schema.auditLogs.id)).limit(300).all();
  const persons = new Map(
    db.select({ id: schema.persons.id, f: schema.persons.firstName, l: schema.persons.lastName }).from(schema.persons).all().map((p) => [p.id, `${p.f} ${p.l}`]),
  );

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "ประวัติการใช้งาน" }]} />
      <PageHeader en="Audit Log" title="ประวัติการใช้งาน" subtitle="บันทึกแบบเพิ่มได้อย่างเดียว — ไม่มีใครแก้หรือลบได้ แม้แต่ผู้ดูแล" />
      <form className="card grid gap-3 sm:grid-cols-6" method="get">
        <label className="sm:col-span-2"><span className="label">ผู้ใช้</span>
          <select name="user" className="input" defaultValue={userId ?? ""}><option value="">ทั้งหมด</option>{[...names].map(([id, n]) => <option key={id} value={id}>{n}</option>)}</select>
        </label>
        <label className="sm:col-span-1"><span className="label">รหัสบุคคล</span><input name="person" className="input" inputMode="numeric" defaultValue={personId ?? ""} /></label>
        <label className="sm:col-span-1"><span className="label">ตั้งแต่ (ค.ศ.)</span><input type="date" name="from" className="input" defaultValue={from ?? ""} /></label>
        <label className="sm:col-span-1"><span className="label">ถึง</span><input type="date" name="to" className="input" defaultValue={to ?? ""} /></label>
        <label className="sm:col-span-1"><span className="label">การกระทำ</span>
          <select name="action" className="input" defaultValue={action}><option value="">ทั้งหมด</option><option value="login">เข้า/ออกระบบ</option><option value="view_sensitive">ดูข้อมูลอ่อนไหว</option><option value="export">ส่งออก</option><option value="print">พิมพ์</option><option value="permission">เปลี่ยนสิทธิ์</option><option value="backup">สำรอง</option><option value="restore">กู้คืน</option><option value="update">แก้ไข</option></select>
        </label>
        <div className="sm:col-span-6"><button className="btn-primary">ค้นหา</button> <Link href="/admin/audit" className="btn-ghost">ล้าง</Link></div>
      </form>
      {rows.length === 0 ? <EmptyState title="ไม่พบรายการ" /> : (
        <div className="panel overflow-x-auto">
          <table className="table-plain text-sm">
            <thead><tr><th>เวลา</th><th>ผู้ใช้</th><th>การกระทำ</th><th>ข้อมูล</th><th>บุคคล</th><th>รายละเอียด</th><th>IP</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{formatThaiDateTime(r.at)}</td>
                  <td>{r.userId ? names.get(r.userId) : "-"}</td>
                  <td>{ACTION_TH[r.action] ?? r.action}</td>
                  <td>{r.entity}{r.entityId ? ` #${r.entityId}` : ""}</td>
                  <td>{r.personId ? <Link className="underline" href={`/persons/${r.personId}`}>{persons.get(r.personId)}</Link> : ""}</td>
                  <td className="max-w-md">
                    {r.note && <p>{r.note}</p>}
                    {r.before != null && r.action === "update" && <p className="text-muted">{JSON.stringify(r.before)} → {JSON.stringify(r.after)}</p>}
                  </td>
                  <td className="font-mono text-xs">{r.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-sm text-muted">แสดงล่าสุด 300 รายการตามตัวกรอง</p>
    </div>
  );
}
