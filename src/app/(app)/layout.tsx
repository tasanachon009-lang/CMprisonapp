import Link from "next/link";
import { redirect } from "next/navigation";
import { and, eq, isNull, or, inArray, sql } from "drizzle-orm";
import { Bell, Repeat } from "lucide-react";
import { getAuth } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { NAV } from "@/components/nav";
import { NavLinks } from "@/components/nav-links";
import { QuickLock } from "@/components/quick-lock";
import { Avatar } from "@/components/avatar";
import { LogoMark } from "@/components/logo";
import { InboxGate } from "@/components/inbox-gate";
import { headers } from "next/headers";
import { unacked, shiftViewer } from "@/lib/services/shift";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDateTime } from "@/lib/thai-date";
import { switchUser } from "../(auth)/actions";
import { PROFESSIONS, assignedCohortIds } from "@/lib/auth/permissions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (auth.user.mustChangePassword) redirect("/change-password");
  if (auth.locked) redirect("/lock");
  const db = getDb();
  const demo = getSetting(db, "app.isDemoData", false);
  const unread = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.notifications)
    .where(and(isNull(schema.notifications.readAt), or(eq(schema.notifications.userId, auth.user.id), inArray(schema.notifications.role, auth.user.roles.length ? auth.user.roles : ["-"]))))
    .get()?.n ?? 0;
  const assignedCohorts = assignedCohortIds(auth);
  const items = NAV.filter((n) => (n.scoped ? assignedCohorts.length > 0 : !n.any || n.any.some((p) => auth.can(p)))).map(({ href, label, icon }) => ({ href, label, icon }));
  const u = auth.user;
  const path = (await headers()).get("x-pathname") ?? "";
  const names = userNameMap(db);
  const pendingMsgs = auth.can("shift.use") && !path.startsWith("/inbox") && auth.mfaOk
    ? unacked(db, shiftViewer(db, auth)).map((m) => ({ id: m.id, level: m.level, body: m.body, author: names.get(m.authorId) ?? "", when: formatThaiDateTime(m.createdAt), healthRelated: m.healthRelated }))
    : [];

  return (
    <div className="min-h-screen">
      {(demo || config.envLabel !== "production") && (
        <div className="no-print bg-warn-bg px-4 py-1 text-center text-sm font-semibold text-ink">
          {demo ? "ข้อมูลตัวอย่าง (ข้อมูลปลอม) — " : ""}
          {config.envLabel === "staging" ? "สภาพแวดล้อมทดสอบ — ไม่ใช่ระบบใช้จริง" : config.envLabel === "training" ? "โหมดฝึกหัด — ไม่กระทบข้อมูลจริง" : config.envLabel === "development" ? "เครื่องพัฒนา" : ""}
        </div>
      )}
      <header className="no-print sticky top-0 z-40 border-b border-line bg-cream/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 pt-2">
          <Link href="/" className="flex items-center gap-2 leading-tight">
            <LogoMark size={38} />
            <span>
              <span className="block font-display text-lg font-bold">สถานฟื้นฟูสมรรถภาพ</span>
              <span className="hidden text-sm text-muted sm:block">เรือนจำกลางเชียงใหม่</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/notifications" className="btn-ghost relative min-h-11 px-3" aria-label={`การแจ้งเตือน ${unread} รายการ`}>
              <Bell size={20} aria-hidden />
              {unread > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-danger px-1.5 text-xs font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
            </Link>
            <QuickLock idleMinutes={auth.idleMinutes} user={{ firstName: u.firstName, lastName: u.lastName, fullName: u.fullName, color: u.color }} />
            <div className="flex items-center gap-2 rounded-full bg-white py-1 pl-1 pr-2 shadow-sm">
              <Avatar first={u.firstName} last={u.lastName} color={u.color} src={u.photoPath ? `/api/files/user/${u.id}` : null} size={36} />
              <div className="hidden leading-tight md:block">
                <p className="text-sm font-semibold">{u.firstName} {u.lastName}</p>
                <p className="text-xs text-muted">{u.titleLabel ?? PROFESSIONS[u.profession]}</p>
              </div>
              <form action={switchUser}>
                <button className="ml-1 inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-sm hover:bg-lime-soft" title="สลับผู้ใช้">
                  <Repeat size={18} aria-hidden /> <span className="hidden sm:inline">สลับผู้ใช้</span>
                </button>
              </form>
            </div>
          </div>
        </div>
        <div className="mx-auto max-w-7xl overflow-x-auto px-4 py-2">
          <NavLinks items={items} />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
      {pendingMsgs.length > 0 && <InboxGate messages={pendingMsgs} />}
    </div>
  );
}
