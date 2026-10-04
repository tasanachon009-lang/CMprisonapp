import Link from "next/link";
import { desc, eq, inArray, or } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { MarkAllRead } from "./mark-read";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const auth = await requirePage();
  const rows = getDb()
    .select()
    .from(schema.notifications)
    .where(or(eq(schema.notifications.userId, auth.user.id), inArray(schema.notifications.role, auth.user.roles.length ? auth.user.roles : ["-"])))
    .orderBy(desc(schema.notifications.id))
    .limit(100)
    .all();
  const unread = rows.filter((r) => !r.readAt).map((r) => r.id);
  return (
    <div className="max-w-3xl space-y-4">
      <Breadcrumb items={[{ label: "การแจ้งเตือน" }]} />
      <PageHeader title="การแจ้งเตือน" actions={unread.length > 0 && <MarkAllRead ids={unread} />} />
      {rows.length === 0 && <EmptyState title="ไม่มีการแจ้งเตือน" />}
      <ul className="space-y-2">
        {rows.map((n) => (
          <li key={n.id} className={`rounded-2xl border px-4 py-3 ${n.readAt ? "border-line bg-white/60 text-muted" : n.severity === "danger" ? "border-danger/50 bg-danger/5" : n.severity === "warning" ? "border-warn-bg/60 bg-warn-bg/10" : "border-line bg-white"}`}>
            <p className={n.readAt ? "" : "font-semibold"}>{n.message}</p>
            <p className="text-sm text-muted">{formatThaiDateTime(n.createdAt)}{n.link && <> · <Link href={n.link} className="underline">ไปที่หน้าที่เกี่ยวข้อง</Link></>}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
