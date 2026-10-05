import Link from "next/link";
import { asc } from "drizzle-orm";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { calendarSessions, overlapReport } from "@/lib/queries/calendar";
import { lookupsOf } from "@/lib/queries/lookups";
import { listInstructors } from "@/lib/services/instructors";
import { addDays, formatThaiDate, todayISO, weekdayOf } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

const WD = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** ปฏิทินรวมทุกหลักสูตรทุกรุ่น (สเปก 22B) — วัน/สัปดาห์/เดือน · กรองหลักสูตร/วิทยากร/สถานที่ · ตรวจความทับซ้อน */
export default async function CalendarPage({ searchParams }: PageProps<"/calendar">) {
  const auth = await requirePage("schedule.view");
  const sp = await searchParams;
  const db = getDb();
  const today = todayISO();
  const view = sp.view === "day" || sp.view === "month" ? sp.view : "week";
  const anchor = typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : today;
  const courses = db.select().from(schema.courses).orderBy(asc(schema.courses.sortOrder)).all();
  const courseId = courses.find((c) => c.code === sp.course)?.id ?? null;
  const location = typeof sp.loc === "string" && sp.loc ? sp.loc : null;
  const personKey = typeof sp.who === "string" ? sp.who : "";
  const person = personKey.startsWith("u") ? { userId: Number(personKey.slice(1)) } : personKey.startsWith("i") ? { instructorId: Number(personKey.slice(1)) } : null;

  let from = anchor, to = anchor;
  if (view === "week") { const wd = weekdayOf(anchor); from = addDays(anchor, wd === 0 ? -6 : 1 - wd); to = addDays(from, 6); }
  if (view === "month") { from = `${anchor.slice(0, 8)}01`; const [y, m] = anchor.split("-").map(Number); to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); }
  const sessions = calendarSessions(db, from, to, { courseId, location, person });
  const overlaps = overlapReport(db, from, to).filter((o) => o.kind !== "inmate" || auth.can("registry.view"));
  const people = [
    ...db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).all().map((u) => ({ key: `u${u.id}`, label: `${u.f} ${u.l} (ใน)` })),
    ...listInstructors(db).filter((i) => i.kind === "external").map((i) => ({ key: `i${i.id}`, label: `${i.displayName} (นอก)` })),
  ];
  const locations = lookupsOf(db, "location").map((l) => l.label);
  const qs = (o: Record<string, string | null>) => {
    const base: Record<string, string> = { view, date: anchor, ...(sp.course ? { course: String(sp.course) } : {}), ...(location ? { loc: location } : {}), ...(personKey ? { who: personKey } : {}) };
    for (const [k, v] of Object.entries(o)) { if (v == null || v === "") delete base[k]; else base[k] = v; }
    return `?${new URLSearchParams(base).toString()}`;
  };
  const step = view === "day" ? 1 : view === "week" ? 7 : 31;
  const shift = (n: number) => (view === "month" ? (() => { const [y, m] = anchor.split("-").map(Number); return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10); })() : addDays(anchor, n * step));
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) dates.push(d);

  const sessionChip = (s: (typeof sessions)[number], compact: boolean) => (
    <Link key={s.id} href={`/cohorts/${s.cohortId}/schedule?view=week&week=${s.date}`} className="block rounded-lg border-l-4 bg-white px-2 py-1 text-xs hover:shadow" style={{ borderLeftColor: s.color }}>
      <span className="font-semibold">{s.startTime}{compact ? "" : `–${s.endTime}`}</span> {s.title}
      {!compact && <span className="block text-muted">{s.cohortLabel}{s.location ? ` · ${s.location}` : ""}</span>}
      {!compact && s.staff.length > 0 && (
        <span className="mt-0.5 flex flex-wrap gap-1">{s.staff.map((p, i) => <span key={i} className={p.external ? "tag-orange px-1.5 py-0 text-[11px]" : "tag-navy px-1.5 py-0 text-[11px]"}>{p.name}</span>)}</span>
      )}
    </Link>
  );

  return (
    <div className="space-y-4">
      <Breadcrumb items={[{ label: "ปฏิทินรวม" }]} />
      <PageHeader en="Calendar" title="ปฏิทินรวมทุกหลักสูตร" subtitle="สีตามหลักสูตร · ป้ายน้ำเงิน = วิทยากรภายใน ส้ม = ภายนอก · กดคาบเพื่อไปตารางของรุ่น"
        actions={<Link href={`/print/calendar?from=${from}&to=${to}${sp.course ? `&course=${sp.course}` : ""}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์ตารางแจก</Link>} />
      <section className="card space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {([["day", "วัน"], ["week", "สัปดาห์"], ["month", "เดือน"]] as const).map(([v, l]) => (
            <Link key={v} href={qs({ view: v })} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${view === v ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{l}</Link>
          ))}
          <Link href={qs({ date: shift(-1) })} className="btn-ghost btn-sm">← ก่อนหน้า</Link>
          <Link href={qs({ date: today })} className="btn-ghost btn-sm">วันนี้</Link>
          <Link href={qs({ date: shift(1) })} className="btn-ghost btn-sm">ถัดไป →</Link>
          <span className="font-semibold">{from === to ? formatThaiDate(from, "full") : `${formatThaiDate(from)} – ${formatThaiDate(to)}`}</span>
        </div>
        <form className="flex flex-wrap items-end gap-2" action="">
          <input type="hidden" name="view" value={view} /><input type="hidden" name="date" value={anchor} />
          <label><span className="label">หลักสูตร</span><select name="course" className="input w-auto" defaultValue={String(sp.course ?? "")}><option value="">ทุกหลักสูตร</option>{courses.map((c) => <option key={c.id} value={c.code}>{c.shortName}</option>)}</select></label>
          <label><span className="label">วิทยากร</span><select name="who" className="input w-auto" defaultValue={personKey}><option value="">ทุกคน</option>{people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
          <label><span className="label">สถานที่</span><select name="loc" className="input w-auto" defaultValue={location ?? ""}><option value="">ทุกสถานที่</option>{locations.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
          <button className="btn-secondary">กรอง</button>
        </form>
        <div className="flex flex-wrap gap-3 text-sm">{courses.map((c) => <span key={c.id} className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: c.color ?? "#3D5590" }} aria-hidden />{c.shortName}</span>)}</div>
      </section>

      {overlaps.length > 0 ? (
        <Alert tone="warn">
          <p className="font-semibold">ความทับซ้อนในช่วงนี้ {overlaps.length} รายการ (ตรวจก่อนพิมพ์ตารางแจก)</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{overlaps.slice(0, 15).map((o, i) => <li key={i}>{formatThaiDate(o.date)} — {o.text}</li>)}</ul>
          {overlaps.length > 15 && <p className="text-sm">และอีก {overlaps.length - 15} รายการ</p>}
        </Alert>
      ) : <Alert tone="ok">ไม่พบความทับซ้อน (วิทยากร/สถานที่{auth.can("registry.view") ? "/ผู้ต้องขัง" : ""}) ในช่วงนี้</Alert>}

      {sessions.length === 0 && <EmptyState title="ไม่มีกิจกรรมในช่วงนี้" />}
      {sessions.length > 0 && view === "month" ? (
        <div className="grid grid-cols-7 gap-1">
          {WD.slice(1).concat(WD[0]).map((d) => <div key={d} className="text-center text-sm font-semibold text-muted">{d}</div>)}
          {Array.from({ length: (weekdayOf(from) + 6) % 7 }, (_, i) => <div key={`pad${i}`} />)}
          {dates.map((d) => {
            const list = sessions.filter((s) => s.date === d);
            return (
              <div key={d} className={`min-h-24 rounded-xl border p-1 ${d === today ? "border-navy ring-1 ring-navy" : "border-line"} bg-cream/60`}>
                <Link href={qs({ view: "day", date: d })} className="text-xs font-semibold hover:underline">{Number(d.slice(8))}</Link>
                <div className="mt-1 space-y-0.5">{list.slice(0, 4).map((s) => sessionChip(s, true))}{list.length > 4 && <Link href={qs({ view: "day", date: d })} className="text-[11px] text-navy underline">+{list.length - 4} คาบ</Link>}</div>
              </div>
            );
          })}
        </div>
      ) : sessions.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${view === "day" ? 1 : dates.length}, minmax(160px, 1fr))`, overflowX: "auto" }}>
          {dates.map((d) => (
            <section key={d} className={`rounded-2xl border p-2 ${d === today ? "border-navy ring-1 ring-navy" : "border-line"} bg-cream/60`}>
              <h2 className="mb-2 text-sm font-semibold">{WD[weekdayOf(d)]} {formatThaiDate(d)}</h2>
              <div className="space-y-1">{sessions.filter((s) => s.date === d).map((s) => sessionChip(s, false))}</div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
