import { asc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { calendarSessions, overlapReport } from "@/lib/queries/calendar";
import { formatThaiDate, todayISO, addDays } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/** ตารางกิจกรรมแจก (ทุกหลักสูตรในช่วงวันที่) — แสดงรายการความทับซ้อนก่อนพิมพ์ (สเปก 22B) · ไม่มีข้อมูลผู้ต้องขัง */
export default async function PrintCalendar({ searchParams }: PageProps<"/print/calendar">) {
  const auth = await requirePage("schedule.view");
  const sp = await searchParams;
  const db = getDb();
  const from = typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from) ? sp.from : todayISO();
  const to = typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) && sp.to >= from && sp.to <= addDays(from, 62) ? sp.to : addDays(from, 6);
  const course = db.select().from(schema.courses).orderBy(asc(schema.courses.sortOrder)).all().find((c) => c.code === sp.course);
  const sessions = calendarSessions(db, from, to, { courseId: course?.id ?? null });
  const overlaps = overlapReport(db, from, to).filter((o) => o.kind !== "inmate");
  const footer = await logPrint(auth, "calendar", `${from}..${to}`);
  const dates = Array.from(new Set(sessions.map((s) => s.date)));
  return (
    <>
      {overlaps.length > 0 && (
        <div className="no-print mx-auto my-3 max-w-[210mm] rounded-xl border-2 border-red-600 bg-white p-3 font-sans text-sm">
          <b>มีความทับซ้อน {overlaps.length} รายการ — ตรวจก่อนพิมพ์แจก:</b>
          <ul style={{ paddingLeft: 20 }}>{overlaps.map((o, i) => <li key={i}>{formatThaiDate(o.date)} — {o.text}</li>)}</ul>
        </div>
      )}
      <div className="sheet">
        <DocHeader title="ตารางกิจกรรม" subtitle={`${course ? `${course.name} · ` : ""}${formatThaiDate(from, "long")} – ${formatThaiDate(to, "long")}`} />
        <table>
          <thead><tr><th style={{ width: "14%" }}>วันที่</th><th style={{ width: "12%" }}>เวลา</th><th>กิจกรรม</th><th style={{ width: "16%" }}>หลักสูตร/รุ่น</th><th style={{ width: "22%" }}>ผู้สอน</th><th style={{ width: "12%" }}>สถานที่</th></tr></thead>
          <tbody>
            {dates.flatMap((d) => sessions.filter((s) => s.date === d).map((s, i) => (
              <tr key={s.id}>
                <td>{i === 0 ? formatThaiDate(d) : ""}</td>
                <td className="center">{s.startTime}–{s.endTime}</td>
                <td>{s.title}</td>
                <td>{s.cohortLabel}</td>
                <td>{s.staff.map((p) => `${p.name}${p.external ? " (นอก)" : ""}`).join(", ") || "-"}</td>
                <td>{s.location ?? "-"}</td>
              </tr>
            )))}
            {sessions.length === 0 && <tr><td colSpan={6} className="center">ไม่มีกิจกรรมในช่วงนี้</td></tr>}
          </tbody>
        </table>
        <DocFooter text={footer} />
      </div>
    </>
  );
}
