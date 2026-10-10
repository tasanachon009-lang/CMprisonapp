import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { lookupLabel } from "@/lib/bootstrap";
import { enrollmentContext } from "@/lib/queries/enrollment";
import { userNameMap } from "@/lib/queries/names";
import { listForms, resultsOf, formAccess } from "@/lib/services/assessments";
import { generalInfo, bookMonths, monthHelper, helperSummary, listNotes, individualSummary } from "@/lib/services/member-book";
import { phaseRecordsOf } from "@/lib/services/fast-phase";
import { phaseStatus, phaseLabel } from "@/lib/fast/phases";
import { periodLabel, helperLines, FREQUENCY_LABEL, GENDER_LABEL, ymd } from "@/lib/fast/book-view";
import { ROUND_LABEL } from "@/lib/assessments/compute";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { GeneralForm, MonthlyNote, Opinions } from "./book-client";

export const dynamic = "force-dynamic";

const TONE: Record<string, string> = { ok: "tag-ok", warn: "tag-warn", danger: "tag-danger" };

/** สมุดบันทึกความก้าวหน้าของสมาชิก (สเปก 16A) — ฉบับดิจิทัลตามสมุดจริง ส่วนที่ 1–4 */
export default async function MemberBook({ params }: PageProps<"/enrollments/[id]/book">) {
  const auth = await requirePage("tc.view");
  const { id } = await params;
  const db = getDb();
  const ctx = enrollmentContext(db, Number(id));
  if (!ctx || ctx.course.code !== "FAST") notFound();
  const today = todayISO();
  const canEdit = auth.can("tc.edit") && ctx.c.status !== "closed";
  const g = generalInfo(db, ctx.e.id, today)!;
  const names = userNameMap(db);
  const phase = phaseStatus(ctx.c.startDate, today, phaseRecordsOf(db, [ctx.e.id]).map((p) => p.phase));

  // ส่วนที่ 2: แบบประเมิน — แสดงเฉพาะที่ผู้ใช้มีสิทธิ์ (ข้อมูลสุขภาพเห็นเฉพาะสถานพยาบาล/ผู้ดูแล)
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes("FAST"));
  const results = resultsOf(db, [ctx.e.id], auth.can);
  const sum = individualSummary(db, ctx.e.id);
  const canAssess = auth.can("assessment.view");

  const monthly = listNotes(db, ctx.e.id, "monthly");
  const months = bookMonths(ctx.e, ctx.c, today).map((period) => {
    const n = monthly.find((x) => x.period === period);
    const h = monthHelper(db, ctx.e.id, period);
    return { period, label: periodLabel(period), text: n?.text ?? "", noteDate: n?.noteDate ?? "", version: n?.version ?? null, author: n ? names.get(n.authorId) ?? null : null, helper: helperLines(h), summary: helperSummary(h) };
  }).reverse();
  const opinions = listNotes(db, ctx.e.id, "counselor").map((o) => ({ id: o.id, text: o.text, noteDate: o.noteDate, dateLabel: formatThaiDate(o.noteDate), author: names.get(o.authorId) ?? "-", mine: o.authorId === auth.user.id }));

  const cell = (c: { date: string; total: number | null; level: string | null } | null) => (c ? `${formatThaiDate(c.date)} · ${c.total ?? "-"}${c.level ? ` · ${c.level}` : ""}` : "-");
  const parts: Array<[string, string]> = [["p1", "ส่วนที่ 1 ข้อมูลทั่วไป"], ["p2", "ส่วนที่ 2 แบบประเมิน"], ["p3", "ส่วนที่ 3 ความก้าวหน้ารายเดือน"], ["p4", "ส่วนที่ 4 ความเห็นที่ปรึกษา"]];

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: `/cohorts/${ctx.c.id}/tc`, label: `${ctx.course.shortName} ${ctx.label}` }, { href: `/enrollments/${ctx.e.id}`, label: ctx.name }, { label: "สมุดของสมาชิก" }]} />
      <PageHeader en="Member Progress Book" title="สมุดบันทึกความก้าวหน้าของสมาชิก"
        help="ส่วนที่ 1 ดึงข้อมูลจากทะเบียน ไม่ต้องกรอกซ้ำ ส่วนที่ 3 บันทึกเดือนละ 1 ครั้ง กดปุ่มแทรกสรุปเพื่อใส่ข้อมูลของเดือนนั้นแล้วแก้ต่อได้ ส่วนที่ 4 ที่ปรึกษาเขียนได้หลายครั้ง แก้ไขได้เฉพาะความเห็นของตน"
        actions={<Link href={`/print/member-book/${ctx.e.id}`} target="_blank" className="btn-ghost"><Printer size={20} aria-hidden /> พิมพ์สมุด</Link>} />

      <section className="card flex flex-wrap items-center gap-4">
        <Avatar first={ctx.p.firstName} last={ctx.p.lastName} src={ctx.inc.photoPath ? `/api/files/photo/${ctx.inc.id}` : null} size={96} />
        <div>
          <h2 className="text-2xl">{ctx.name}</h2>
          <p className="text-muted">เลขประจำตัว {ctx.inc.inmateNo} · วันที่เข้าโปรแกรม {formatThaiDate(g.enteredDate, "long")}</p>
          <p className="mt-1"><span className="tag-navy">{phaseLabel(phase.current.code)}</span>{phase.due && <span className="tag-warn ml-1">ถึงกำหนดเลื่อนระยะ</span>}</p>
        </div>
        <nav aria-label="ส่วนของสมุด" className="ml-auto flex flex-wrap gap-2">
          {parts.map(([a, l]) => <a key={a} href={`#${a}`} className="inline-flex min-h-11 items-center rounded-full border border-line bg-white px-4 font-semibold hover:bg-lime-soft">{l}</a>)}
        </nav>
      </section>

      <section id="p1" className="card space-y-4">
        <h2 className="text-xl">ส่วนที่ 1 ข้อมูลทั่วไป</h2>
        <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
          {([["เพศ", g.gender ? GENDER_LABEL[g.gender] ?? g.gender : "-"], ["อายุ", g.age != null ? `${g.age} ปี` : "-"], ["สถานภาพสมรส", g.maritalStatus ?? "-"], ["ระดับการศึกษา", g.education ?? "-"], ["อาชีพก่อนต้องโทษ", g.occupation ?? "-"], ["จำนวนสมาชิกในครอบครัว", g.familySize != null ? `${g.familySize} คน` : "-"],
            ["ฐานความผิด", g.offense ?? "-"], ["กำหนดโทษ", ymd(g.sentence)], ["โทษที่เหลือ (โดยประมาณ)", ymd(g.remaining)]] as const).map(([k, v]) => (
            <div key={k}><dt className="text-sm text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>
          ))}
        </dl>
        <div>
          <p className="text-sm text-muted">ยาเสพติดที่ใช้</p>
          {g.drugs.length ? <ul className="mt-1 flex flex-wrap gap-2">{g.drugs.map((d, i) => <li key={i} className="tag-muted">{lookupLabel(db, "substance", d.substance)}{d.ageStarted ? ` · เริ่มอายุ ${d.ageStarted}` : ""}{d.frequency ? ` · ${FREQUENCY_LABEL[d.frequency] ?? d.frequency}` : ""}{d.durationYears ? ` · ${d.durationYears} ปี` : ""}</li>)}</ul> : <p>-</p>}
        </div>
        <p className="text-sm"><Link className="underline" href={`/persons/${ctx.p.id}`}>แก้ข้อมูลทะเบียนที่หน้าบุคคล</Link></p>
        <GeneralForm enrollmentId={ctx.e.id} initial={{ housingBefore: g.housingBefore, familyBond: g.familyBond }} version={g.bookVersion} canEdit={canEdit} />
      </section>

      <section id="p2" className="card space-y-4">
        <h2 className="text-xl">ส่วนที่ 2 แบบประเมิน</h2>
        <div className="overflow-x-auto">
          <table className="table-plain">
            <thead><tr><th>แบบประเมิน</th><th>ผลที่บันทึก</th><th /></tr></thead>
            <tbody>
              {forms.map((f) => {
                const access = formAccess(auth.can, f);
                const mine = results.filter((r) => r.f.id === f.id).sort((a, b) => a.r.assessedDate.localeCompare(b.r.assessedDate));
                return (
                  <tr key={f.id}>
                    <td className="font-medium">{f.shortName}{f.sensitive && <span className="tag-orange ml-1">สุขภาพ</span>}</td>
                    <td>
                      {!access.view ? <span className="text-muted">ข้อมูลจำกัดสิทธิ์</span> : mine.length === 0 ? <span className="text-muted">ยังไม่ทำ</span> : (
                        <span className="flex flex-wrap gap-2">
                          {mine.map((r) => <span key={r.r.id} className={TONE[r.r.tone ?? ""] ?? "tag-muted"}>{ROUND_LABEL[r.r.round] ?? r.r.round}{r.r.period ? ` ${periodLabel(r.r.period)}` : ""}: {r.r.total ?? ""} {r.r.level ?? ""}</span>)}
                        </span>
                      )}
                    </td>
                    <td className="text-right">{access.view && <Link className="btn-ghost btn-sm" href={`/enrollments/${ctx.e.id}#assessments`}>เปิดแฟ้ม</Link>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {canAssess && (
          <div>
            <h3 className="text-lg font-semibold">สรุปผลรายบุคคล (ก่อน / หลัง)</h3>
            <div className="mt-2 overflow-x-auto">
              <table className="table-plain">
                <thead><tr><th>รายการ</th><th>ก่อนเข้ารับการบำบัด</th><th>หลังเข้ารับการบำบัด</th></tr></thead>
                <tbody>
                  <tr><td>ความรู้ความเข้าใจเกี่ยวกับยาเสพติด</td><td>{cell(sum.knowledge.pre)}</td><td>{cell(sum.knowledge.post)}</td></tr>
                  <tr><td>ทัศนคติต่อการใช้ยาเสพติด</td><td>{cell(sum.attitude.pre)}</td><td>{cell(sum.attitude.post)}</td></tr>
                  <tr><td>ขั้นบันไดของแรงจูงใจ</td><td>{cell(sum.motivation.pre)}</td><td>{cell(sum.motivation.post)}</td></tr>
                  <tr><td>ความก้าวหน้าสมาชิก</td><td colSpan={2}>{sum.progress.length ? sum.progress.map((p) => `${formatThaiDate(p.date)} · ${p.total ?? "-"}${p.level ? ` · ${p.level}` : ""}`).join(" | ") : "-"}</td></tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section id="p3" className="card space-y-4">
        <h2 className="text-xl">ส่วนที่ 3 ความก้าวหน้าของพฤติกรรมและการให้ความช่วยเหลือในแต่ละเดือน</h2>
        {months.length === 0 ? <p className="text-muted">ยังไม่ถึงเดือนแรกของโปรแกรม</p> : months.map((m) => <MonthlyNote key={m.period} enrollmentId={ctx.e.id} m={m} today={today} canEdit={canEdit} />)}
      </section>

      <section id="p4" className="card space-y-4">
        <h2 className="text-xl">ส่วนที่ 4 ความเห็นของที่ปรึกษา</h2>
        <Opinions enrollmentId={ctx.e.id} list={opinions} today={today} canEdit={canEdit} isAdmin={auth.isAdmin} />
      </section>
    </div>
  );
}
