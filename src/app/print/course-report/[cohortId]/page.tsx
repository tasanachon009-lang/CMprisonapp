import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { courseReport } from "@/lib/services/course-report";
import { cohortLabel } from "@/lib/services/cohorts";
import { BUDGET_CATEGORIES } from "@/lib/budget/calc";
import { thaiDateRange } from "@/lib/docs/view";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";
import { SignatureBlock } from "../../pieces";

export const dynamic = "force-dynamic";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dash = (v: number | null | undefined) => (v == null ? "-" : String(v));

/**
 * แบบรายงานผลการดำเนินงานและการใช้จ่ายงบประมาณ (สเปก 18.4) — ตัวเลขรวม ไม่มีชื่อผู้ต้องขัง
 * ⚠️ โครงหัวข้อร่างตามสเปก (13.4, 14.3, 11.5A) ยังไม่ได้เทียบกับแบบของกรมฯ — ปรับเมื่อได้แบบจริง
 */
export default async function CourseReportPrint({ params }: PageProps<"/print/course-report/[cohortId]">) {
  const auth = await requirePage("reports.view", "dashboard.view");
  const { cohortId } = await params;
  const db = getDb();
  const r = courseReport(db, Number(cohortId));
  if (!r) notFound();
  const footer = await logPrint(auth, "course_report", r.cohort.id);
  const s = (k: string) => getSetting<string>(db, k, "") ?? "";
  const { people: p, activity: a } = r;
  let n = 0;
  return (
    <div className="sheet">
      <DocHeader title="แบบรายงานผลการดำเนินงานและการใช้จ่ายงบประมาณ" subtitle={`โครงการ${r.course.name} ${cohortLabel(r.cohort)} ประจำปีงบประมาณ พ.ศ. ${r.cohort.fiscalYear}`} />
      <p>หน่วยงาน: {s("org.unitName")} {s("org.name")}</p>
      <p>ระยะเวลาดำเนินการ: {thaiDateRange(r.cohort.startDate, r.cohort.endDate)} · สถานที่: {r.cohort.location || "…………"}</p>

      <h2>{++n}. ผู้เข้ารับการอบรม</h2>
      <table>
        <thead><tr><th>รายการ</th><th style={{ width: "22mm" }}>ชาย</th><th style={{ width: "22mm" }}>หญิง</th><th style={{ width: "22mm" }}>รวม (คน)</th></tr></thead>
        <tbody>
          <tr><td>เป้าหมาย</td><td className="center">-</td><td className="center">-</td><td className="center">{dash(p.target)}</td></tr>
          {([["เข้ารับการอบรม", p.entered], ["ครบหลักสูตร", p.completed], ["ไม่ครบหลักสูตร", p.notCompleted], ["คงเหลือ (กำลังอบรม)", p.remaining]] as const).map(([label, c]) => (
            <tr key={label}><td>{label}</td><td className="center">{c.male}</td><td className="center">{c.female}</td><td className="center">{c.total}</td></tr>
          ))}
        </tbody>
      </table>
      {p.reasons.length > 0 && <p>สาเหตุที่ไม่ครบหลักสูตร: {p.reasons.map((x) => `${x.label} ${x.n} คน`).join(" · ")}</p>}
      {!r.consistent && <p><b>ตัวเลขไม่สอดคล้อง:</b> เข้ารับการอบรม ≠ ครบ + ไม่ครบ + คงเหลือ — กรุณาตรวจสถานะรายชื่อของรุ่น</p>}
      {p.draft > 0 && <p className="muted">ยังมีผู้ลงทะเบียนเป็นร่าง {p.draft} คน (ไม่นับในตาราง)</p>}

      <h2>{++n}. การจัดกิจกรรมและวิทยากร</h2>
      <p>กิจกรรมตามแผน {a.planned} คาบ ดำเนินการแล้ว {a.done} คาบ{a.cancelled ? ` ยกเลิก ${a.cancelled} คาบ` : ""} · ชั่วโมงตามหลักสูตร {a.hoursTarget} ชั่วโมง ดำเนินการแล้ว {a.hoursDone} ชั่วโมง</p>
      <p>วิทยากรภายใน {a.internal} คน · วิทยากรภายนอกที่ให้การสนับสนุน {a.external.length} คน</p>
      {a.external.length > 0 && (
        <table>
          <thead><tr><th style={{ width: "10mm" }}>ที่</th><th>วิทยากรภายนอก</th><th>หน่วยงาน</th></tr></thead>
          <tbody>{a.external.map((x, i) => <tr key={i}><td className="center">{i + 1}</td><td>{x.name}</td><td>{x.organization || "-"}</td></tr>)}</tbody>
        </table>
      )}

      <h2>{++n}. ผลการประเมิน</h2>
      {r.assessments.length === 0 ? <p className="muted">ไม่มีแบบประเมินของหลักสูตรนี้</p> : (
        <table>
          <thead><tr><th>แบบประเมิน</th><th style={{ width: "30mm" }}>ก่อน (เฉลี่ย / คน)</th><th style={{ width: "30mm" }}>หลัง (เฉลี่ย / คน)</th><th>จำนวนคนตามระดับ</th></tr></thead>
          <tbody>
            {r.assessments.map((f) => (
              <tr key={f.code}>
                <td>{f.name}</td>
                <td className="center">{f.pre ? `${dash(f.pre.avg)} / ${f.pre.n}` : "-"}</td>
                <td className="center">{f.post ? `${dash(f.post.avg)} / ${f.post.n}` : "-"}</td>
                <td>{f.levels.length ? f.levels.map((l) => `${l.label} ${l.n}`).join(" · ") : "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {r.satisfaction && (
        <>
          <p style={{ marginTop: 6 }}>ความพึงพอใจต่อโครงการ (จำนวนคนต่อระดับคะแนน) — ผู้ตอบ {r.satisfaction.respondents} คน จากผู้เข้าอบรม {r.satisfaction.participants} คน</p>
          <table>
            <thead><tr><th>ข้อ</th>{r.satisfaction.options.map((o) => <th key={o.value} style={{ width: "18mm" }}>{o.value} {o.label}</th>)}<th style={{ width: "16mm" }}>รวม</th><th style={{ width: "16mm" }}>เฉลี่ย</th></tr></thead>
            <tbody>
              {r.satisfaction.rows.map((x) => (
                <tr key={x.no}><td>{x.group ? `${x.group} ข้อ ${x.label}` : `ข้อ ${x.label}`}</td>{r.satisfaction!.options.map((o) => <td key={o.value} className="center">{x.counts[String(o.value)]}</td>)}<td className="center">{x.n}</td><td className="center">{x.mean ?? "-"}</td></tr>
              ))}
            </tbody>
          </table>
          {(!r.satisfaction.consistent || r.satisfaction.respondents !== r.satisfaction.participants) && <p><b>ตรวจสอบ:</b> {!r.satisfaction.consistent ? `ผลรวมข้อ ${r.satisfaction.mismatched.join(", ")} ไม่เท่าจำนวนผู้ตอบ ` : ""}{r.satisfaction.respondents !== r.satisfaction.participants ? "จำนวนผู้ตอบไม่เท่าจำนวนผู้เข้าอบรม" : ""}</p>}
        </>
      )}
      {r.referral && <p>การส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ: บันทึกแล้ว {r.referral.recorded} จาก {r.referral.total} คน · ต้องส่งต่อ {r.referral.needs} คน</p>}

      <h2>{++n}. การนำเข้าข้อมูล บสต. และ รท.101</h2>
      <table>
        <thead><tr><th>ระบบ</th><th style={{ width: "30mm" }}>เป้าหมาย (คน)</th><th style={{ width: "36mm" }}>ดำเนินการจริง (คน)</th></tr></thead>
        <tbody>
          <tr><td>บสต.</td>{r.records.bst ? <><td className="center">{r.records.bst.target}</td><td className="center">{r.records.bst.done}</td></> : <td colSpan={2} className="center">หลักสูตรนี้ไม่ต้องลง บสต.</td>}</tr>
          <tr><td>รท.101</td>{r.records.rt101 ? <><td className="center">{r.records.rt101.target}</td><td className="center">{r.records.rt101.done}</td></> : <td colSpan={2} className="center">หลักสูตรนี้ไม่ต้องลง รท.101</td>}</tr>
        </tbody>
      </table>

      <h2>{++n}. การใช้จ่ายงบประมาณ</h2>
      {r.budget.length === 0 ? <p className="muted">ยังไม่ได้ตั้งงบของรุ่น</p> : r.budget.map((b) => (
        <div key={b.allocation.id} style={{ marginBottom: 6 }}>
          <p>แหล่งเงิน: {b.allocation.subject}{b.allocation.docNo ? ` (หนังสือที่ ${b.allocation.docNo})` : ""} · ได้รับจัดสรร {baht(b.received)} บาท</p>
          <table>
            <thead><tr><th>หมวด</th><th style={{ width: "30mm" }}>ได้รับ (งบของรุ่น)</th><th style={{ width: "28mm" }}>ใช้ครั้งนี้</th><th style={{ width: "28mm" }}>สะสม</th><th style={{ width: "28mm" }}>คงเหลือ</th></tr></thead>
            <tbody>
              {b.rows.map((x) => <tr key={x.category}><td>{BUDGET_CATEGORIES[x.category]}</td><td className="right">{baht(x.budget)}</td><td className="right">{baht(x.thisTime)}</td><td className="right">{baht(x.cumulative)}</td><td className="right">{baht(x.remaining)}</td></tr>)}
              <tr>
                <td><b>รวม</b></td>
                {(["budget", "thisTime", "cumulative", "remaining"] as const).map((k) => <td key={k} className="right"><b>{baht(b.rows.reduce((t, x) => t + x[k], 0))}</b></td>)}
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      <h2>{++n}. ปัญหา อุปสรรค และข้อเสนอแนะ</h2>
      {[0, 1, 2, 3].map((i) => <p key={i} style={{ borderBottom: "1px dotted #000", height: "8mm" }}>&nbsp;</p>)}

      <SignatureBlock lines={[{ role: "ผู้รายงาน" }, { role: s("docs.unitHeadTitle") || "หัวหน้าสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด", name: s("docs.unitHeadName") || null }, { role: s("org.headTitle") || "ผู้บัญชาการเรือนจำ", name: s("org.headName") || null }]} />
      <DocFooter text={footer} />
    </div>
  );
}
