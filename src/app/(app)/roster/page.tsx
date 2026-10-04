import Link from "next/link";
import { redirect } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dailyRoster } from "@/lib/queries/roster";
import { formatThaiDate, todayISO, isValidISODate } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { PersonThumb } from "@/components/person-thumb";

export const dynamic = "force-dynamic";

/** ตารางกิจกรรมวันนี้ + รายชื่อและรูป (ผู้ควบคุมดูอย่างเดียว) */
export default async function RosterPage({ searchParams }: PageProps<"/roster">) {
  const auth = await requirePage("roster.view", "registry.view");
  if (!auth.can("roster.view") && !auth.can("registry.view")) redirect("/forbidden");
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isValidISODate(sp.date) ? sp.date : todayISO();
  const groups = dailyRoster(getDb(), date);
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "ใบรายชื่อนับยอด" }]} />
      <PageHeader en="Daily Roster" title="ใบรายชื่อนับยอดประจำวัน" subtitle={formatThaiDate(date, "full")} actions={<Link href={`/print/roster?date=${date}`} target="_blank" className="btn-primary"><Printer size={20} aria-hidden /> พิมพ์ให้ผู้คุม</Link>} />
      {groups.length === 0 && <EmptyState title="วันนี้ไม่มีกิจกรรม" />}
      {groups.map((g) => (
        <section key={g.cohortId} className="card">
          <h2 className="text-xl">{g.label} · {g.people.length} คน</h2>
          <ul className="mt-2 flex flex-wrap gap-2">{g.sessions.map((s) => <li key={s.id} className="tag-muted">{s.time} {s.title}</li>)}</ul>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {g.people.map((p) => (
              <li key={p.incId} className="flex items-center gap-3 rounded-xl bg-cream px-3 py-2">
                <PersonThumb name={`${p.prefix ?? ""}${p.firstName} ${p.lastName}`} thumb={p.thumb ? `/api/files/photo/${p.incId}?s=thumb` : null} photo={p.thumb ? `/api/files/photo/${p.incId}` : null} inmateNo={p.inmateNo} zone={p.zone} size={40} />
                <div><p className="font-medium">{p.prefix}{p.firstName} {p.lastName}</p><p className="text-sm text-muted">{p.inmateNo} · {p.zone ?? "-"}</p></div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
