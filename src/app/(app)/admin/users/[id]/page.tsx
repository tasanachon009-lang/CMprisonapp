import { notFound } from "next/navigation";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { activeAdminIds } from "@/lib/services/admin";
import { getSetting } from "@/lib/bootstrap";
import { cohortLabel } from "@/lib/services/cohorts";
import { todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { EditUserPanel, GrantsPanel } from "../user-forms";

export const dynamic = "force-dynamic";

export default async function UserPage({ params }: PageProps<"/admin/users/[id]">) {
  const auth = await requirePage("users.manage");
  const { id } = await params;
  const db = getDb();
  const u = db.select().from(schema.users).where(eq(schema.users.id, Number(id))).get();
  if (!u) notFound();
  const roles = db.select().from(schema.userRoles).where(eq(schema.userRoles.userId, u.id)).all().map((r) => r.role);
  const grants = db.select().from(schema.permissionGrants).where(and(eq(schema.permissionGrants.userId, u.id), isNull(schema.permissionGrants.deletedAt))).orderBy(desc(schema.permissionGrants.id)).all();
  const today = todayISO();
  const cohorts = db
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(inArray(schema.cohorts.status, ["planned", "active"]), isNull(schema.cohorts.deletedAt)))
    .all();
  const admins = activeAdminIds(db);
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { href: "/admin/users", label: "ผู้ใช้และสิทธิ์" }, { label: `${u.firstName} ${u.lastName}` }]} />
      <PageHeader title={`${u.prefix ?? ""}${u.firstName} ${u.lastName}`} subtitle={u.status === "suspended" ? `บัญชีถูกระงับ: ${u.suspendedReason ?? ""}` : undefined} />
      <EditUserPanel
          otpEnabled={getSetting<boolean>(db, "security.adminOtp", false) === true}
        id={u.id}
        user={{ prefix: u.prefix, firstName: u.firstName, lastName: u.lastName, nickname: u.nickname, position: u.position, profession: u.profession, level: u.level as "staff", titleLabel: u.titleLabel, sortOrder: u.sortOrder, status: u.status }}
        roles={roles}
        isSelf={u.id === auth.user.id}
        isAdmin={roles.includes("admin")}
        adminCount={admins.length}
      />
      <div className="mt-6">
        <GrantsPanel
          userId={u.id}
          cohorts={cohorts.map(({ c, course }) => ({ id: c.id, label: `${course.shortName} ${cohortLabel(c)}` }))}
          grants={grants.map((g) => ({ id: g.id, permission: g.permission, allow: g.allow, scope: g.scope, validFrom: g.validFrom, validTo: g.validTo, reason: g.reason, active: !g.revokedAt && (!g.validTo || g.validTo >= today) }))}
        />
      </div>
    </div>
  );
}
