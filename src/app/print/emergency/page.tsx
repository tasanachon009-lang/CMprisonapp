import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { dailyRoster } from "@/lib/queries/roster";
import { sessionRoster } from "@/lib/services/attendance";
import { dueAssessments, getForm, versionFor } from "@/lib/services/assessments";
import { cohortRoster } from "@/lib/queries/cohorts";
import { addDays, formatThaiDate, todayISO } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import type { Item } from "@/lib/assessments/scoring";
import { DocHeader, DocFooter } from "../doc-header";
import { AttendanceSheetTable, BlankForm } from "../pieces";

export const dynamic = "force-dynamic";

/**
 * ชุดกระดาษสำรองฉุกเฉิน (สเปก 22B): กิจกรรม 1–3 วันข้างหน้า — ตาราง ใบรายชื่อ+รูป ใบเช็คชื่อเปล่าทุกคาบ
 * แบบประเมินเปล่าที่ถึงรอบ (มีชื่อพิมพ์ไว้) ใบส่งเวรเปล่า — ไม่มีข้อมูลสุขภาพ
 */
export default async function EmergencyKit({ searchParams }: PageProps<"/print/emergency">) {
  const auth = await requirePage("attendance.edit");
  const sp = await searchParams;
  const db = getDb();
  const days = Math.min(3, Math.max(1, Number(sp.days) || 3));
  const start = sp.today === "1" ? todayISO() : addDays(todayISO(), 1);
  const dates = Array.from({ length: days }, (_, i) => addDays(start, i));
  const footer = await logPrint(auth, "emergency_kit", `${dates[0]}..${dates[dates.length - 1]}`);
  const perDay = dates.map((d) => ({ date: d, groups: dailyRoster(db, d) }));
  const cohortIds = Array.from(new Set(perDay.flatMap((d) => d.groups.map((g) => g.cohortId))));
  // แบบประเมินที่ถึงรอบ (ไม่รวมแบบสุขภาพ)
  const due = cohortIds.flatMap((id) => dueAssessments(db, id, dates[dates.length - 1]).filter((x) => !x.sensitive && x.formCode !== "COND").map((x) => ({ ...x, cohortId: id })));
  const people = new Map(cohortIds.flatMap((id) => cohortRoster(db, id)).map((r) => [r.enrollment.id, r]));
  return (
    <>
      <div className="no-print mx-auto my-3 max-w-[210mm] rounded-xl bg-white p-3 font-sans text-sm">
        จำนวนวัน: {[1, 2, 3].map((n) => <a key={n} className={`mx-1 underline ${n === days ? "font-bold" : ""}`} href={`?days=${n}${sp.today === "1" ? "&today=1" : ""}`}>{n} วัน</a>)}
        · <a className="underline" href={`?days=${days}&today=${sp.today === "1" ? "0" : "1"}`}>{sp.today === "1" ? "เริ่มพรุ่งนี้" : "รวมวันนี้"}</a>
        · <span className="text-danger">ไม่มีข้อมูลสุขภาพในชุดนี้</span>
      </div>
      <div className="sheet">
        <DocHeader title="ชุดกระดาษสำรองฉุกเฉิน — ตารางกิจกรรม" subtitle={`${formatThaiDate(dates[0], "long")} – ${formatThaiDate(dates[dates.length - 1], "long")}`} />
        {perDay.map((d) => (
          <section key={d.date} style={{ marginTop: 8 }}>
            <h2>{formatThaiDate(d.date, "full")}</h2>
            {d.groups.length === 0 ? <p className="muted">ไม่มีกิจกรรม</p> : d.groups.map((g) => (
              <div key={g.cohortId}>
                <p><b>{g.label}</b> ({g.people.length} คน)</p>
                <table><tbody>{g.sessions.map((s) => <tr key={s.id}><td style={{ width: "22%" }}>{s.time}</td><td>{s.title}</td><td style={{ width: "25%" }}>{s.location ?? ""}</td></tr>)}</tbody></table>
              </div>
            ))}
          </section>
        ))}
        <p style={{ marginTop: 12 }} className="muted">เมื่อระบบกลับมา ให้กรอกย้อนหลังด้วย &quot;โหมดกรอกเร็ว&quot; และติ๊ก &quot;กรอกย้อนหลังจากชุดกระดาษฉุกเฉิน&quot;</p>
        <DocFooter text={footer} />
      </div>
      {perDay[0].groups.map((g) => (
        <div className="sheet" key={`roster-${g.cohortId}`}>
          <DocHeader title="ใบรายชื่อพร้อมรูป" subtitle={g.label} />
          <table>
            <thead><tr><th style={{ width: "6%" }}>ที่</th><th style={{ width: "16%" }}>รูป</th><th>ชื่อ-สกุล</th><th style={{ width: "18%" }}>เลขประจำตัว</th><th style={{ width: "12%" }}>แดน</th></tr></thead>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <tbody>{g.people.map((p, i) => <tr key={p.incId}><td className="center">{i + 1}</td><td>{p.thumb ? <img src={`/api/files/photo/${p.incId}?s=thumb`} alt="" className="thumb" /> : <span className="thumb-empty">ไม่มีรูป</span>}</td><td>{p.prefix}{p.firstName} {p.lastName}</td><td>{p.inmateNo}</td><td>{p.zone ?? "-"}</td></tr>)}</tbody>
          </table>
          <DocFooter text={footer} />
        </div>
      ))}
      {perDay.flatMap((d) => d.groups.flatMap((g) => g.sessions.map((s) => {
        const r = sessionRoster(db, s.id);
        if (!r.session.takesAttendance) return null;
        return (
          <div className="sheet" key={`att-${s.id}`}>
            <DocHeader title="ใบเช็คชื่อ (ชุดฉุกเฉิน)" subtitle={`${g.label} · ${formatThaiDate(d.date, "full")} · ${s.time} ${s.title}`} />
            <AttendanceSheetTable rows={r.rows.map((x) => ({ name: `${x.prefix ?? ""}${x.firstName} ${x.lastName}`, inmateNo: x.inmateNo, duplicate: x.duplicateName }))} />
            <p style={{ marginTop: 14 }}>ผู้เช็คชื่อ ...................................................... </p>
            <DocFooter text={footer} />
          </div>
        );
      })))}
      {due.map((x) => {
        const f = getForm(db, x.formId)!;
        const v = versionFor(db, f.id, todayISO());
        const p = people.get(x.enrollmentId);
        if (!p) return null;
        return (
          <div className="sheet" key={`form-${x.enrollmentId}-${x.formId}-${x.round}`}>
            <BlankForm title={`${f.name} (${x.round === "pre" ? "ก่อนเรียน" : "หลังเรียน"})`} person={`${p.person.prefix ?? ""}${p.person.firstName} ${p.person.lastName}`} inmateNo={p.inc.inmateNo} cohort="" kind={f.kind} items={v.items as Item[]} scoring={v.scoring as Record<string, unknown>} />
            <DocFooter text={footer} />
          </div>
        );
      })}
      <div className="sheet">
        <DocHeader title="ใบส่งเวร (เปล่า)" />
        <table>
          <thead><tr><th style={{ width: "14%" }}>วัน/เวลา</th><th style={{ width: "10%" }}>ระดับ</th><th>เรื่อง</th><th style={{ width: "18%" }}>ผู้ส่ง</th><th style={{ width: "18%" }}>ผู้รับทราบ</th></tr></thead>
          <tbody>{Array.from({ length: 14 }).map((_, i) => <tr key={i} style={{ height: "12mm" }}><td /><td>☐ปกติ ☐สำคัญ ☐แดง</td><td /><td /><td /></tr>)}</tbody>
        </table>
        <DocFooter text={footer} />
      </div>
    </>
  );
}
