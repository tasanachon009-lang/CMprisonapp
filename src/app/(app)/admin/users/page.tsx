import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { PROFESSIONS, ROLES } from "@/lib/auth/permissions";
import { formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { NewUserButton } from "./user-forms";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  await requirePage("users.manage");
  const db = getDb();
  const users = db.select().from(schema.users).orderBy(asc(schema.users.sortOrder), asc(schema.users.firstName)).all();
  const roles = db.select().from(schema.userRoles).all();
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "ผู้ใช้และสิทธิ์" }]} />
      <PageHeader en="Users & Permissions" title="ผู้ใช้และสิทธิ์" subtitle="การเปลี่ยนสิทธิ์ทุกครั้งถูกบันทึก" help="ระงับบัญชีได้ทันทีโดยไม่ลบเพื่อเก็บประวัติ บัญชีผู้ควบคุมเปิดเฉพาะเมื่อจำเป็น สิทธิ์ที่กำหนดช่วงวันที่จะกลับเป็นค่าเดิมเมื่อครบกำหนด" actions={<NewUserButton />} />
      <div className="panel overflow-x-auto">
        <table className="table-plain">
          <thead><tr><th>ชื่อ</th><th>วิชาชีพ/ตำแหน่ง</th><th>บทบาท</th><th>เข้าใช้ล่าสุด</th><th>สถานะ</th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`} className="flex items-center gap-2 font-medium hover:underline">
                    <Avatar first={u.firstName} last={u.lastName} color={u.color} size={32} /> {u.prefix}{u.firstName} {u.lastName}
                  </Link>
                </td>
                <td className="text-sm">{u.titleLabel ? <b>{u.titleLabel} · </b> : null}{PROFESSIONS[u.profession]}<br /><span className="text-muted">{u.position}</span></td>
                <td className="space-x-1">{roles.filter((r) => r.userId === u.id).map((r) => <span key={r.role} className={r.role === "admin" ? "tag-danger" : "tag-navy"}>{ROLES[r.role as keyof typeof ROLES] ?? r.role}</span>)}</td>
                <td className="text-sm">{u.lastLoginAt ? formatThaiDateTime(u.lastLoginAt) : "ยังไม่เคยเข้า"}</td>
                <td>{u.status === "active" ? (u.lockedUntil && u.lockedUntil.getTime() > Date.now() ? <span className="tag-warn">ล็อกชั่วคราว</span> : <span className="tag-ok">ใช้งาน</span>) : <span className="tag-muted">ระงับ</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
