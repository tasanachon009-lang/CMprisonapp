import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { personTimeline } from "@/lib/queries/persons";
import { resultsOf } from "@/lib/services/assessments";
import { medicalNotesOf, behaviorNotesOf } from "@/lib/queries/enrollment";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { lookupLabel } from "@/lib/bootstrap";
import { ageOn, formatThaiDate, todayISO } from "@/lib/thai-date";
import { maskNationalId } from "@/lib/thai-id";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/** รายงานรายบุคคล (สเปก 18.1) — ข้อมูลสุขภาพพิมพ์ได้เฉพาะผู้มีสิทธิ์ ไม่มีสิทธิ์พิมพ์เป็น "ข้อมูลจำกัดสิทธิ์" */
export default async function PersonReport({ params }: PageProps<"/print/person/[id]">) {
  const auth = await requirePage("reports.view");
  const { id } = await params;
  const db = getDb();
  const t = personTimeline(db, Number(id));
  if (!t) notFound();
  const { person: p, incarcerations } = t;
  const footer = await logPrint(auth, "person_report", p.id, p.id);
  const canHealth = auth.can("health.view");
  const enrIds = incarcerations.flatMap((x) => x.enrollments.map((e) => e.e.id));
  const results = resultsOf(db, enrIds, (perm) => perm === "assessment.view" || (canHealth && perm === "health.view"));
  const restricted = !canHealth;
  const current = incarcerations[0];
  return (
    <div className="sheet">
      <DocHeader title="รายงานรายบุคคล" />
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {current?.inc.photoPath ? <img src={`/api/files/photo/${current.inc.id}`} alt="" style={{ width: "30mm", height: "38mm", objectFit: "cover" }} /> : <div className="thumb-empty" style={{ width: "30mm", height: "38mm" }}>ไม่มีรูป</div>}
        <div>
          <p><b>{p.prefix}{p.firstName} {p.lastName}</b></p>
          <p>เลขบัตรประชาชน {maskNationalId(p.nationalId)} · เกิด {p.birthDate ? `${formatThaiDate(p.birthDate)} (${ageOn(p.birthDate, todayISO())} ปี)` : "-"}</p>
          <p>การศึกษา {p.education ?? "-"} · อาชีพก่อนต้องโทษ {p.occupation ?? "-"} · ต้องโทษ {incarcerations.length} ครั้ง</p>
        </div>
      </div>
      {incarcerations.map((x) => (
        <section key={x.inc.id} style={{ marginTop: 12, breakInside: "avoid" }}>
          <h2>{x.isCurrent ? "การต้องโทษปัจจุบัน" : "ข้อมูลการต้องโทษรอบก่อน"} — เลขประจำตัว {x.inc.inmateNo}</h2>
          <p>ฐานความผิด {x.inc.offense ?? "-"} · แดน {x.inc.zone ?? "-"} · ชั้น {lookupLabel(db, "prisoner_class", x.inc.prisonerClass)}{x.inc.releasedDate ? ` · ออกจากเรือนจำ ${formatThaiDate(x.inc.releasedDate)} (${lookupLabel(db, "release_reason", x.inc.releaseReason)})` : ""}</p>
          {x.enrollments.map((e) => {
            const rs = results.filter((r) => r.r.enrollmentId === e.e.id);
            const sensitiveHidden = restricted;
            const notes = canHealth ? medicalNotesOf(db, e.e.id) : [];
            return (
              <div key={e.e.id} style={{ marginTop: 6 }}>
                <p><b>{e.course.name} {e.label}</b> ({formatThaiDate(e.c.startDate)} – {formatThaiDate(e.c.endDate)}) · {ENROLLMENT_STATUS_LABEL[e.e.status]} · เข้าร่วม {e.pct ?? "-"}% ({e.present}/{e.counted} คาบ){e.corrections ? ` · เหตุราชทัณฑ์ ${e.corrections}` : ""}</p>
                {rs.length > 0 && (
                  <table style={{ marginTop: 4 }}>
                    <thead><tr><th>แบบประเมิน</th><th>รอบ</th><th>วันที่</th><th>คะแนน</th><th>ผล</th></tr></thead>
                    <tbody>{rs.map((r) => <tr key={r.r.id}><td>{r.f.shortName}</td><td>{ROUND_LABEL[r.r.round]}</td><td>{formatThaiDate(r.r.assessedDate)}</td><td className="center">{r.r.total ?? "-"}</td><td>{r.r.level ?? "-"}</td></tr>)}</tbody>
                  </table>
                )}
                {sensitiveHidden && <p className="muted">ผลประเมินสุขภาพและความเห็นแพทย์: ข้อมูลจำกัดสิทธิ์</p>}
                {notes.length > 0 && <p style={{ marginTop: 4 }}><b>ความเห็นสถานพยาบาล:</b> {notes.map((n) => `${formatThaiDate(n.noteDate)} ${n.opinion ?? n.screeningResult ?? ""}`).join(" · ")}</p>}
              </div>
            );
          })}
          {x.isCurrent && (() => {
            const b = behaviorNotesOf(db, x.inc.id);
            return b.length ? <p style={{ marginTop: 6 }}><b>บันทึกพฤติกรรม:</b> เชิงบวก {b.filter((n) => n.tone === "positive").length} · เชิงลบ {b.filter((n) => n.tone === "negative").length} · สังเกต {b.filter((n) => n.tone === "observe").length}</p> : null;
          })()}
        </section>
      ))}
      <DocFooter text={footer} />
    </div>
  );
}
