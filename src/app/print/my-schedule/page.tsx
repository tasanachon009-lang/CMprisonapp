import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { calendarSessions } from "@/lib/queries/calendar";
import { userNameMap } from "@/lib/queries/names";
import { logPrint } from "@/lib/print";
import { addDays, formatThaiDate, isValidISODate, THAI_WEEKDAYS, todayISO, weekdayOf } from "@/lib/thai-date";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/** ตารางสอนรายบุคคลรายสัปดาห์ (สเปก 12) — ของตัวเอง · ผู้จัดตารางพิมพ์ของคนอื่นได้ (?user=) · ไม่มีข้อมูลผู้ต้องขัง */
export default async function MySchedule({ searchParams }: PageProps<"/print/my-schedule">) {
  const auth = await requirePage("schedule.view");
  const sp = await searchParams;
  const db = getDb();
  const base = typeof sp.week === "string" && isValidISODate(sp.week) ? sp.week : todayISO();
  const monday = addDays(base, weekdayOf(base) === 0 ? -6 : 1 - weekdayOf(base));
  const wanted = Number(sp.user) || auth.user.id;
  const userId = wanted !== auth.user.id && auth.can("schedule.edit") ? wanted : auth.user.id;
  const name = userNameMap(db).get(userId) ?? "-";
  const sessions = calendarSessions(db, monday, addDays(monday, 6), { person: { userId } });
  const footer = await logPrint(auth, "my_schedule", `${userId}:${monday}`);
  return (
    <div className="sheet">
      <DocHeader title={`ตารางสอนของ ${name}`} subtitle={`สัปดาห์ ${formatThaiDate(monday, "long")} – ${formatThaiDate(addDays(monday, 6), "long")}`} />
      <table>
        <thead><tr><th style={{ width: "18%" }}>วัน</th><th style={{ width: "14%" }}>เวลา</th><th>หัวข้อ</th><th style={{ width: "22%" }}>หลักสูตร/รุ่น</th><th style={{ width: "16%" }}>สถานที่</th></tr></thead>
        <tbody>
          {sessions.map((s, i) => (
            <tr key={s.id}>
              <td>{i === 0 || sessions[i - 1].date !== s.date ? `${THAI_WEEKDAYS[weekdayOf(s.date)]} ${formatThaiDate(s.date)}` : ""}</td>
              <td className="center">{s.startTime}–{s.endTime}</td>
              <td>{s.title}{s.staff.length > 1 ? ` (ร่วมกับ ${s.staff.filter((x) => x.name !== name).map((x) => x.name).join(", ")})` : ""}</td>
              <td>{s.cohortLabel}</td>
              <td>{s.location ?? "-"}</td>
            </tr>
          ))}
          {sessions.length === 0 && <tr><td colSpan={5} className="center">ไม่มีคาบสอนในสัปดาห์นี้</td></tr>}
        </tbody>
      </table>
      <p style={{ marginTop: 8 }}>รวม {sessions.length} คาบ {sessions.reduce((a, s) => a + s.hours, 0)} ชั่วโมง</p>
      <DocFooter text={footer} />
    </div>
  );
}
