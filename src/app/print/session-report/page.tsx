import { notFound, redirect } from "next/navigation";
import { and, asc, eq, isNull, ne } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { getDb, schema } from "@/lib/db";
import { activeStaff } from "@/lib/services/schedule";
import { reportOf, OUTCOME_LABEL, PARTICIPATION_LABEL, SHIFT_CHIP } from "@/lib/services/session-close";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { userNameMap, instructorNameMap } from "@/lib/queries/names";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/**
 * ใบ "บันทึกผลการจัดกิจกรรม" ต่อคาบ (?session=) หรือต่อวัน (?cohort=&date=) — สเปก 22B
 * หลักฐานแนบเบิกค่าตอบแทนและรายงาน · ไม่มีรายชื่อผู้ต้องขัง (มีแค่จำนวนผู้เข้าร่วม)
 */
export default async function SessionReportPrint({ searchParams }: PageProps<"/print/session-report">) {
  const auth = await requirePage();
  const sp = await searchParams;
  const db = getDb();
  let sessions: Array<typeof schema.cohortSessions.$inferSelect> = [];
  if (typeof sp.session === "string") {
    const s = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.id, Number(sp.session))).get();
    if (s) sessions = [s];
  } else if (typeof sp.cohort === "string" && typeof sp.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.date)) {
    sessions = db.select().from(schema.cohortSessions)
      .where(and(eq(schema.cohortSessions.cohortId, Number(sp.cohort)), eq(schema.cohortSessions.date, sp.date), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled")))
      .orderBy(asc(schema.cohortSessions.startTime)).all();
  }
  if (!sessions.length) notFound();
  if (sessions.some((s) => !sessionAccess(auth, s.id, s.cohortId).canView)) redirect("/forbidden");
  const { cohort, course } = getCohort(db, sessions[0].cohortId)!;
  const names = userNameMap(db);
  const ins = instructorNameMap(db);
  const staff = activeStaff(db, sessions.map((s) => s.id));
  const footer = await logPrint(auth, "session_report", sessions.length === 1 ? sessions[0].id : `${cohort.id}:${sessions[0].date}`);
  return (
    <div className="sheet">
      <DocHeader title="บันทึกผลการจัดกิจกรรม" subtitle={`${course.name} ${cohortLabel(cohort)}${sessions.length > 1 ? ` · ${formatThaiDate(sessions[0].date, "full")}` : ""}`} />
      {sessions.map((s, i) => {
        const r = reportOf(db, s.id);
        const who = staff.filter((x) => x.sessionId === s.id);
        const teacherName = (x: (typeof who)[number]) => (x.userId ? names.get(x.userId) : (x.instructorId ? ins.get(x.instructorId) : x.externalName)) ?? "-";
        const chips = ((r?.chips as string[] | null) ?? []).filter((c) => c !== SHIFT_CHIP);
        return (
          <section key={s.id} style={{ breakInside: "avoid", marginTop: i ? 18 : 6, paddingTop: i ? 10 : 0, borderTop: i ? "1px solid #000" : undefined }}>
            <table>
              <tbody>
                <tr><th style={{ width: "22%" }}>วันที่ / เวลา</th><td>{formatThaiDate(s.date, "full")} {s.startTime}–{s.endTime} น. ({s.hours} ชม.)</td></tr>
                <tr><th>หัวข้อ</th><td>{s.title}</td></tr>
                <tr><th>วิทยากร</th><td>{who.length ? who.map((x) => `${teacherName(x)}${x.userId ? "" : " (ภายนอก)"}${x.didTeach ? (x.actualHours != null ? ` — สอนจริง ${x.actualHours} ชม.` : "") : " — ไม่ได้สอน"}`).join(", ") : "-"}</td></tr>
                <tr><th>ผู้เข้าร่วม</th><td>{r?.participants ?? "-"} คน</td></tr>
                <tr><th>ผลการดำเนินการ</th><td>{r ? `${OUTCOME_LABEL[r.outcome]}${r.reason ? ` (${r.reason})` : ""}${r.participation ? ` · การมีส่วนร่วม${PARTICIPATION_LABEL[r.participation]}` : ""}` : "ยังไม่บันทึกผล"}</td></tr>
                <tr><th>สรุป</th><td>{r?.summary || (chips.length ? chips.join(" · ") : "-")}</td></tr>
                {r?.issues && <tr><th>ปัญหา / ข้อเสนอแนะ</th><td>{r.issues}</td></tr>}
              </tbody>
            </table>
            {r?.source === "paper_copy" && <p style={{ fontSize: "0.9em" }}>คัดลอกจากใบบันทึกของวิทยากร (ต้นฉบับเก็บที่แฟ้ม)</p>}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 32px", marginTop: 18 }}>
              {who.map((x) => <p key={x.id}>ลงชื่อ ........................................ วิทยากร<br />({teacherName(x)})</p>)}
              <p>ลงชื่อ ........................................ ผู้บันทึก<br />({s.taughtBy ? names.get(s.taughtBy) : "...................................."})</p>
            </div>
          </section>
        );
      })}
      <DocFooter text={footer} />
    </div>
  );
}
