import Link from "next/link";
import { and, desc, isNull, or, eq, inArray } from "drizzle-orm";
import { ClipboardCheck, CalendarDays, ShieldAlert, Users, HardDrive } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { todayISO, addDays, formatThaiDate, currentFiscalYear, formatThaiDateTime } from "@/lib/thai-date";
import { uncheckedSessions, mySessions, overviewNumbers } from "@/lib/queries/home";
import { SessionCardView } from "@/components/session-card";
import { Stat, EmptyState, Alert } from "@/components/ui";
import { backupHealth } from "@/lib/backup/status";
import { LastCohortLink } from "@/components/remember-cohort";

export const dynamic = "force-dynamic";

/** หน้าแรก "งานของฉันวันนี้" ตามบทบาท (สเปก 4.2) */
export default async function HomePage() {
  const auth = await requirePage();
  const db = getDb();
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const roles = auth.user.roles;
  const isMain = auth.can("attendance.edit");
  const isAssistantOnly = !isMain && auth.can("attendance.edit_own");
  const isExec = roles.includes("executive") && !isMain;
  const isWarden = auth.can("roster.view") && !auth.can("registry.view");

  const mine = mySessions(db, auth.user.id, today, tomorrow);
  const mineToday = mine.filter((s) => s.date === today);
  const mineTomorrow = mine.filter((s) => s.date === tomorrow);

  return (
    <div className="space-y-6">
      <div>
        <p lang="en" className="font-display text-sm font-medium uppercase tracking-[0.18em] text-navy">My Day</p>
        <p className="text-muted">{formatThaiDate(today, "full")}</p>
        <h1 className="text-3xl">สวัสดี คุณ{auth.user.firstName}</h1>
        {auth.can("course.view") && <div className="mt-3"><LastCohortLink /></div>}
      </div>

      {auth.isAdmin && <AdminAlerts />}

      {isWarden && (
        <section className="card">
          <h2 className="text-xl">ใบรายชื่อนับยอดประจำวัน</h2>
          <p className="mt-1 text-muted">ตารางกิจกรรมวันนี้ + รายชื่อและรูปสำหรับนับยอด</p>
          <Link href="/roster" className="btn-primary mt-4">เปิดใบรายชื่อนับยอด</Link>
        </section>
      )}

      {isAssistantOnly && (
        <section className="card">
          <h2 className="flex items-center gap-2 text-xl"><ClipboardCheck aria-hidden /> คาบของฉันวันนี้</h2>
          <div className="mt-4 space-y-2">
            {mineToday.length ? mineToday.map((s) => <SessionCardView key={s.id} s={s} today={today} />) : <EmptyState title="วันนี้ไม่มีคาบที่คุณรับผิดชอบ" />}
          </div>
          {mineTomorrow.length > 0 && (
            <>
              <h3 className="mt-6 text-lg">พรุ่งนี้</h3>
              <div className="mt-2 space-y-2">{mineTomorrow.map((s) => <SessionCardView key={s.id} s={s} today={today} />)}</div>
            </>
          )}
        </section>
      )}

      {isMain && <MainCards today={today} userId={auth.user.id} mineToday={mineToday} mineTomorrow={mineTomorrow} scopes={auth.cohortScopes} />}

      {auth.can("health.view") && (
        <section className="card">
          <h2 className="text-xl">งานสถานพยาบาล</h2>
          <p className="mt-1 text-muted">ผลคัดกรองเสี่ยง ความเห็นรอบันทึก และรายการส่งต่อสุขภาพ จะแสดงที่นี่เมื่อเปิดใช้แบบประเมิน (ขั้นที่ 2)</p>
        </section>
      )}

      {(isExec || auth.can("dashboard.view")) && <ExecSummary />}

      {!isMain && !isAssistantOnly && !isExec && !isWarden && !auth.can("health.view") && (
        <EmptyState title="ยังไม่มีงานที่ต้องทำในหน้านี้">ใช้เมนูด้านบนเพื่อไปยังส่วนที่ต้องการ</EmptyState>
      )}
    </div>
  );
}

function MainCards({ today, mineToday, mineTomorrow }: { today: string; userId: number; mineToday: ReturnType<typeof mySessions>; mineTomorrow: ReturnType<typeof mySessions>; scopes: number[] }) {
  const db = getDb();
  const pending = uncheckedSessions(db, today);
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card">
        <h2 className="flex items-center gap-2 text-xl"><ClipboardCheck aria-hidden /> เช็คชื่อที่ยังไม่ทำ</h2>
        <p className="text-sm text-muted">วันนี้และย้อนหลัง 14 วัน — เรียงจากเก่าสุด</p>
        <div className="mt-4 space-y-2">
          {pending.length ? pending.slice(0, 8).map((s) => <SessionCardView key={s.id} s={s} today={today} />) : <EmptyState title="เช็คชื่อครบแล้ว 👍" />}
          {pending.length > 8 && <p className="text-sm text-muted">และอีก {pending.length - 8} คาบ</p>}
        </div>
      </section>
      <section className="card">
        <h2 className="flex items-center gap-2 text-xl"><CalendarDays aria-hidden /> ตารางของฉัน</h2>
        <h3 className="mt-3 font-semibold">วันนี้</h3>
        <div className="mt-2 space-y-2">
          {mineToday.length ? mineToday.map((s) => <SessionCardView key={s.id} s={s} today={today} />) : <p className="text-muted">ไม่มีคาบที่คุณรับผิดชอบ</p>}
        </div>
        <h3 className="mt-4 font-semibold">พรุ่งนี้ ({formatThaiDate(addDays(today, 1))})</h3>
        <div className="mt-2 space-y-2">
          {mineTomorrow.length ? mineTomorrow.map((s) => <SessionCardView key={s.id} s={s} today={today} />) : <p className="text-muted">ไม่มีคาบที่คุณรับผิดชอบ</p>}
        </div>
      </section>
    </div>
  );
}

function ExecSummary() {
  const db = getDb();
  const fy = currentFiscalYear();
  const n = overviewNumbers(db, fy);
  return (
    <section className="card">
      <h2 className="flex items-center gap-2 text-xl"><Users aria-hidden /> ภาพรวม ปีงบประมาณ {fy}</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat value={n.runningCohorts} label="รุ่นที่กำลังดำเนินการ" />
        <Stat value={n.active} label="ผู้เข้ารับการฟื้นฟูขณะนี้ (คน)" />
        <Stat value={n.fyTotal} label={`ลงทะเบียนปีงบ ${fy} (รายการ)`} />
        <Stat value={n.fyCompleted} label="ครบหลักสูตรแล้ว" tone="ok" />
      </div>
      <p className="mt-2 text-xs text-muted">แดชบอร์ดผู้บริหารแบบเต็มจะเพิ่มในขั้นที่ 6</p>
    </section>
  );
}

function AdminAlerts() {
  const db = getDb();
  const health = backupHealth(db);
  const alerts = db
    .select()
    .from(schema.notifications)
    .where(and(isNull(schema.notifications.readAt), or(eq(schema.notifications.role, "admin")), inArray(schema.notifications.severity, ["warning", "danger"])))
    .orderBy(desc(schema.notifications.createdAt))
    .limit(5)
    .all();
  return (
    <div className="space-y-3">
      {health.problems.map((p, i) => (
        <Alert key={i} tone="danger">
          <p className="flex items-center gap-2 font-semibold"><HardDrive size={20} aria-hidden /> {p}</p>
          <Link href="/admin/backup" className="text-sm underline">ไปหน้าสำรองข้อมูล</Link>
        </Alert>
      ))}
      {alerts.map((a) => (
        <Alert key={a.id} tone={a.severity === "danger" ? "danger" : "warn"}>
          <p className="flex items-center gap-2"><ShieldAlert size={18} aria-hidden /> {a.message}</p>
          <p className="text-xs text-muted">{formatThaiDateTime(a.createdAt)} · <Link href="/notifications" className="underline">ดูทั้งหมด</Link></p>
        </Alert>
      ))}
    </div>
  );
}
