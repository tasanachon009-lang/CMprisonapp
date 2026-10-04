import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dailyRoster } from "@/lib/queries/roster";
import { formatThaiDate, todayISO, isValidISODate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/** ใบรายชื่อนับยอดประจำวัน — เจ้าหน้าที่พิมพ์ให้ผู้คุมได้โดยผู้คุมไม่ต้องมีบัญชี */
export default async function RosterPrint({ searchParams }: PageProps<"/print/roster">) {
  const auth = await requirePage("roster.view", "registry.view");
  if (!auth.can("roster.view") && !auth.can("registry.view")) redirect("/forbidden");
  const sp = await searchParams;
  const date = typeof sp.date === "string" && isValidISODate(sp.date) ? sp.date : todayISO();
  const groups = dailyRoster(getDb(), date);
  const footer = await logPrint(auth, "daily_roster", date);
  return (
    <>
      {groups.length === 0 && <div className="sheet"><DocHeader title="ใบรายชื่อนับยอดประจำวัน" subtitle={formatThaiDate(date, "full")} /><p className="center">วันนี้ไม่มีกิจกรรม</p><DocFooter text={footer} /></div>}
      {groups.map((g) => (
        <div className="sheet" key={g.cohortId}>
          <DocHeader title="ใบรายชื่อนับยอดประจำวัน" subtitle={`${g.label} · ${formatThaiDate(date, "full")}`} />
          <p><b>กิจกรรม:</b> {g.sessions.map((s) => `${s.time} ${s.title}${s.location ? ` (${s.location})` : ""}`).join(" · ")}</p>
          <p><b>ยอดรวม {g.people.length} คน</b> · นับ ณ เวลา ............ น. ได้ ............ คน</p>
          <table style={{ marginTop: 6 }}>
            <thead><tr><th style={{ width: "6%" }}>ที่</th><th style={{ width: "16%" }}>รูป</th><th>ชื่อ-สกุล</th><th style={{ width: "16%" }}>เลขประจำตัว</th><th style={{ width: "12%" }}>แดน</th><th style={{ width: "10%" }}>นับ</th></tr></thead>
            <tbody>
              {g.people.map((p, i) => (
                <tr key={p.incId}>
                  <td className="center">{i + 1}</td>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <td>{p.thumb ? <img src={`/api/files/photo/${p.incId}?s=thumb`} alt="" className="thumb" /> : <span className="thumb-empty">ไม่มีรูป</span>}</td>
                  <td>{p.prefix}{p.firstName} {p.lastName}</td>
                  <td>{p.inmateNo}</td>
                  <td>{p.zone ?? "-"}</td>
                  <td className="center">☐</td>
                </tr>
              ))}
            </tbody>
          </table>
          <DocFooter text={footer} />
        </div>
      ))}
    </>
  );
}
