import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { lookupLabel } from "@/lib/bootstrap";
import { enrollmentContext } from "@/lib/queries/enrollment";
import { userNameMap } from "@/lib/queries/names";
import { listForms, resultsOf, formAccess } from "@/lib/services/assessments";
import { generalInfo, listNotes, individualSummary } from "@/lib/services/member-book";
import { periodLabel, FREQUENCY_LABEL, GENDER_LABEL, ymd } from "@/lib/fast/book-view";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/**
 * พิมพ์สมุดบันทึกความก้าวหน้าของสมาชิก (สเปก 16A) — ทั้งเล่ม หรือเลือกส่วนด้วย ?parts=1,3
 * ข้อมูลสุขภาพพิมพ์เฉพาะผู้มีสิทธิ์ ไม่มีสิทธิ์ = "ข้อมูลจำกัดสิทธิ์" · บันทึกการพิมพ์ทุกครั้ง
 */
export default async function MemberBookPrint({ params, searchParams }: PageProps<"/print/member-book/[id]">) {
  const auth = await requirePage("tc.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  if (!ctx || ctx.course.code !== "FAST") notFound();
  const want = typeof sp.parts === "string" ? new Set(sp.parts.split(",")) : new Set(["1", "2", "3", "4"]);
  const today = todayISO();
  const g = generalInfo(db, ctx.e.id, today)!;
  const names = userNameMap(db);
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes("FAST"));
  const results = resultsOf(db, [ctx.e.id], auth.can);
  const sum = individualSummary(db, ctx.e.id);
  const monthly = listNotes(db, ctx.e.id, "monthly");
  const opinions = listNotes(db, ctx.e.id, "counselor");
  const footer = await logPrint(auth, "member_book", ctx.e.id, ctx.p.id);
  const cell = (c: { date: string; total: number | null; level: string | null } | null) => (c ? `${formatThaiDate(c.date)} / ${c.total ?? "-"}${c.level ? ` / ${c.level}` : ""}` : "");
  const line = (k: string, v: React.ReactNode) => <p><b>{k}</b> {v}</p>;

  return (
    <>
      <div className="sheet center" style={{ paddingTop: "40mm" }}>
        <h1 style={{ fontSize: "1.8em" }}>สมุดบันทึกความก้าวหน้าของสมาชิก</h1>
        <p style={{ marginTop: 8 }}>{ctx.course.name} {ctx.label}</p>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {ctx.inc.photoPath ? <img src={`/api/files/photo/${ctx.inc.id}`} alt="" style={{ width: "45mm", height: "55mm", objectFit: "cover", margin: "16mm auto 0", border: "1px solid #000" }} /> : <div style={{ width: "45mm", height: "55mm", margin: "16mm auto 0", border: "1px solid #000" }} />}
        <p style={{ fontSize: "1.5em", fontWeight: 700, marginTop: "10mm" }}>{ctx.name}</p>
        <p>เลขประจำตัว {ctx.inc.inmateNo}</p>
        <p style={{ marginTop: 8 }}>วันที่เข้าโปรแกรม {formatThaiDate(g.enteredDate, "long")}</p>
        <DocFooter text={footer} />
      </div>

      {want.has("1") && (
        <div className="sheet">
          <h1>ส่วนที่ 1 ข้อมูลทั่วไป</h1>
          <h2>1. ข้อมูลทั่วไป</h2>
          {line("เพศ", g.gender ? GENDER_LABEL[g.gender] ?? g.gender : "-")}{line("อายุ", g.age != null ? `${g.age} ปี` : "-")}{line("สถานภาพสมรส", g.maritalStatus ?? "-")}
          {line("ระดับการศึกษา", g.education ?? "-")}{line("อาชีพก่อนต้องโทษ", g.occupation ?? "-")}{line("จำนวนสมาชิกในครอบครัว", g.familySize != null ? `${g.familySize} คน` : "-")}
          {line("ยาเสพติดที่ใช้", g.drugs.length ? g.drugs.map((d) => `${lookupLabel(db, "substance", d.substance)}${d.ageStarted ? ` (เริ่มอายุ ${d.ageStarted} ปี)` : ""}${d.frequency ? ` ${FREQUENCY_LABEL[d.frequency] ?? d.frequency}` : ""}${d.durationYears ? ` ระยะเวลา ${d.durationYears} ปี` : ""}`).join(" · ") : "-")}
          <h2>2. คดี</h2>
          {line("ฐานความผิด", g.offense ?? "-")}{line("กำหนดโทษ", ymd(g.sentence))}{line("โทษที่เหลือ (โดยประมาณ)", ymd(g.remaining))}
          <h2>3. ข้อมูลเกี่ยวข้อง</h2>
          <p><b>สภาพที่อยู่อาศัยก่อนต้องโทษ</b></p><p style={{ whiteSpace: "pre-wrap", minHeight: "20mm" }}>{g.housingBefore || "…………………………………………………………………………"}</p>
          <p><b>ความผูกพันในครอบครัว</b></p><p style={{ whiteSpace: "pre-wrap", minHeight: "20mm" }}>{g.familyBond || "…………………………………………………………………………"}</p>
        </div>
      )}

      {want.has("2") && (
        <div className="sheet">
          <h1>ส่วนที่ 2 แบบประเมิน</h1>
          <table>
            <thead><tr><th>แบบประเมิน</th><th>รอบ</th><th>วันที่ประเมิน</th><th>คะแนน</th><th>ผล</th></tr></thead>
            <tbody>
              {forms.flatMap((f) => {
                if (!formAccess(auth.can, f).view) return [<tr key={f.id}><td>{f.shortName}</td><td colSpan={4} className="center">ข้อมูลจำกัดสิทธิ์</td></tr>];
                const mine = results.filter((r) => r.f.id === f.id).sort((a, b) => a.r.assessedDate.localeCompare(b.r.assessedDate));
                if (!mine.length) return [<tr key={f.id}><td>{f.shortName}</td><td colSpan={4} className="center muted">ยังไม่ได้ทำ</td></tr>];
                return mine.map((r) => <tr key={r.r.id}><td>{f.shortName}</td><td className="center">{ROUND_LABEL[r.r.round] ?? r.r.round}{r.r.period ? ` ${periodLabel(r.r.period)}` : ""}</td><td className="center">{formatThaiDate(r.r.assessedDate)}</td><td className="center">{r.r.total ?? "-"}</td><td>{r.r.level ?? "-"}</td></tr>);
              })}
            </tbody>
          </table>
          {auth.can("assessment.view") && (
            <>
              <h2 style={{ marginTop: 12 }}>ผลการประเมินความรู้ ทัศนคติ แรงจูงใจ และพฤติกรรม (รายบุคคล)</h2>
              <table>
                <thead><tr><th>รายการ</th><th>ก่อนเข้ารับการบำบัด (ว/ด/ป / คะแนน / ระดับ)</th><th>หลังเข้ารับการบำบัด (ว/ด/ป / คะแนน / ระดับ)</th></tr></thead>
                <tbody>
                  <tr><td>ความรู้ความเข้าใจเกี่ยวกับยาเสพติด</td><td>{cell(sum.knowledge.pre)}</td><td>{cell(sum.knowledge.post)}</td></tr>
                  <tr><td>ทัศนคติต่อการใช้ยาเสพติด</td><td>{cell(sum.attitude.pre)}</td><td>{cell(sum.attitude.post)}</td></tr>
                  <tr><td>แบบสอบถามขั้นบันไดของแรงจูงใจ</td><td>{cell(sum.motivation.pre)}</td><td>{cell(sum.motivation.post)}</td></tr>
                  <tr><td>ความก้าวหน้าสมาชิก</td><td colSpan={2}>{sum.progress.map((p) => `${formatThaiDate(p.date)} / ${p.total ?? "-"} / ${p.level ?? "-"}`).join("  |  ")}</td></tr>
                </tbody>
              </table>
              <p style={{ marginTop: "12mm", textAlign: "right" }}>(ลงชื่อ) ...................................................... เจ้าหน้าที่ผู้บันทึกข้อมูล</p>
            </>
          )}
        </div>
      )}

      {want.has("3") && (
        <div className="sheet">
          <h1>ส่วนที่ 3 ความก้าวหน้าของพฤติกรรมและการให้ความช่วยเหลือในแต่ละเดือน</h1>
          {monthly.length === 0 ? <p className="center muted" style={{ marginTop: 20 }}>ยังไม่มีบันทึก</p> : monthly.map((n) => (
            <div key={n.id} style={{ marginBottom: "6mm", breakInside: "avoid" }}>
              <h2>{periodLabel(n.period)}</h2>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
              <p style={{ textAlign: "right" }}>ผู้บันทึก {names.get(n.authorId) ?? "-"} · {formatThaiDate(n.noteDate, "long")}</p>
            </div>
          ))}
        </div>
      )}

      {want.has("4") && (
        <div className="sheet">
          <h1>ส่วนที่ 4 ความเห็นของที่ปรึกษา</h1>
          {opinions.length === 0 ? <p className="center muted" style={{ marginTop: 20 }}>ยังไม่มีความเห็น</p> : [...opinions].reverse().map((n) => (
            <div key={n.id} style={{ marginBottom: "6mm", breakInside: "avoid" }}>
              <p style={{ whiteSpace: "pre-wrap" }}>{n.text}</p>
              <p style={{ textAlign: "right" }}>ที่ปรึกษา {names.get(n.authorId) ?? "-"} · {formatThaiDate(n.noteDate, "long")}</p>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
