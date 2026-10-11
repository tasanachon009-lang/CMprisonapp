import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { fastEndReport } from "@/lib/services/fast-report";
import { cohortLabel } from "@/lib/services/cohorts";
import { BUDGET_CATEGORIES } from "@/lib/budget/calc";
import { thaiDateRange } from "@/lib/docs/view";
import { periodLabel } from "@/lib/fast/book-view";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";
import { SignatureBlock } from "../../pieces";

export const dynamic = "force-dynamic";

const baht = (satang: number) => (satang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const v = (x: number | null | undefined) => (x == null ? "-" : String(x));
const Lines = ({ n = 3 }: { n?: number }) => <>{Array.from({ length: n }, (_, i) => <p key={i} style={{ borderBottom: "1px dotted #000", height: "8mm" }}>&nbsp;</p>)}</>;

/**
 * รายงานสิ้นสุดรุ่นของชุมชนบำบัด FAST (สเปก 16) — ตัวเลขรวม ไม่มีชื่อผู้ต้องขัง
 * ⚠️ โครงหัวข้อร่างตามสเปก ยังไม่ได้เทียบกับแบบรายงานในคู่มือเพิ่มประสิทธิภาพ กรมราชทัณฑ์ — ปรับเมื่อได้แบบจริง
 */
export default async function FastReportPrint({ params }: PageProps<"/print/fast-report/[cohortId]">) {
  const auth = await requirePage("reports.view", "dashboard.view");
  const { cohortId } = await params;
  const db = getDb();
  const r = fastEndReport(db, Number(cohortId));
  if (!r) notFound();
  const footer = await logPrint(auth, "fast_end_report", r.cohort.id);
  const s = (k: string) => getSetting<string>(db, k, "") ?? "";
  const m = r.members, a = r.areas;
  const pp = (x: { pre: number | null; preN: number; post: number | null; postN: number }) => <><td className="center">{v(x.pre)} / {x.preN}</td><td className="center">{v(x.post)} / {x.postN}</td></>;
  const list = (items: Array<{ label: string; n: number }>) => items.filter((x) => x.n > 0).map((x) => `${x.label} ${x.n}`).join(" · ") || "-";

  return (
    <div className="sheet">
      <DocHeader title="รายงานผลการดำเนินงานเมื่อสิ้นสุดรุ่น" subtitle={`โครงการ${r.course.name} ${cohortLabel(r.cohort)} ประจำปีงบประมาณ พ.ศ. ${r.cohort.fiscalYear}`} />
      <p>หน่วยงาน: {s("org.unitName")} {s("org.name")}</p>
      <p>ระยะเวลาดำเนินการ: {thaiDateRange(r.cohort.startDate, r.cohort.endDate)} (24 สัปดาห์) · สถานที่: {r.cohort.location || "…………"}</p>

      <h2>1. จำนวนสมาชิก</h2>
      <table>
        <thead><tr><th>รายการ</th><th style={{ width: "22mm" }}>ชาย</th><th style={{ width: "22mm" }}>หญิง</th><th style={{ width: "22mm" }}>รวม (คน)</th></tr></thead>
        <tbody>
          <tr><td>เป้าหมาย</td><td className="center">-</td><td className="center">-</td><td className="center">{v(m.target)}</td></tr>
          {([["เข้ารับการบำบัด", m.entered], ["ไม่จบโปรแกรม", m.notCompleted], ["จบโปรแกรม — ยังอยู่ในเรือนจำ", m.completedIn], ["จบโปรแกรม — ปล่อยตัวแล้ว", m.completedOut], ["คงเหลือ (กำลังบำบัด)", m.remaining]] as const).map(([label, c]) => (
            <tr key={label}><td>{label}</td><td className="center">{c.male}</td><td className="center">{c.female}</td><td className="center">{c.total}</td></tr>
          ))}
        </tbody>
      </table>
      {m.reasons.length > 0 && <p>สาเหตุที่ไม่จบโปรแกรม: {m.reasons.map((x) => `${x.label} ${x.total} คน (ชาย ${x.male} หญิง ${x.female})`).join(" · ")}</p>}
      {!r.consistent && <p><b>ตัวเลขไม่สอดคล้อง:</b> เข้า ≠ ไม่จบ + จบ (อยู่ในเรือนจำ) + จบ (ปล่อยตัว) + คงเหลือ — กรุณาตรวจสถานะรายชื่อของรุ่น</p>}

      <h2>2. ผู้เคยผ่านการบำบัดแล้วกลับมาต้องโทษซ้ำ</h2>
      <p>จำนวน {r.returnees.total} คน (ชาย {r.returnees.male} หญิง {r.returnees.female}){r.returnees.byCourse.length ? ` — เคยผ่าน: ${list(r.returnees.byCourse)}` : ""}</p>

      <h2>3. ผลการดำเนินงาน 5 ด้าน</h2>
      <p><b>3.1 ด้านระเบียบวินัย</b></p>
      <p>เครื่องมือบ้าน: {list(a.discipline.tools)}</p>
      <p>ละเมิดกฎ 5 ข้อใหญ่: {list(a.discipline.cardinal)} · ความผิดวินัยอื่น: {list(a.discipline.levels)} · รางวัล/สิทธิพิเศษ: {list(a.discipline.rewards)}</p>
      <Lines n={1} />

      <p><b>3.2 ด้านชุมชนบำบัด</b></p>
      <p>ระยะการบำบัดของสมาชิกปัจจุบัน: {list(a.community.phases)}</p>
      <p>กลุ่มประชุมเช้า ดำเนินการ {a.community.morning.done} จาก {a.community.morning.planned} ครั้ง · ทีมงาน {a.community.teamCount} ทีม ผลประเมินรายสัปดาห์: {list(a.community.teamReviews)}</p>
      {a.community.progress.length > 0 && (
        <table>
          <thead><tr><th>คะแนนพฤติกรรมสมาชิกรายเดือน (เต็ม 135)</th>{a.community.progress.map((p) => <th key={p.period}>{periodLabel(p.period)}</th>)}</tr></thead>
          <tbody>
            <tr><td>คะแนนเฉลี่ย / จำนวนคน</td>{a.community.progress.map((p) => <td key={p.period} className="center">{v(p.avg)} / {p.n}</td>)}</tr>
            <tr><td>ระดับต้องปรับปรุง (คน)</td>{a.community.progress.map((p) => <td key={p.period} className="center">{p.low}</td>)}</tr>
          </tbody>
        </table>
      )}
      <Lines n={1} />

      <p><b>3.3 ด้านจิตสังคมบำบัด</b></p>
      <p>การเรียนรู้แบบมีส่วนร่วม ดำเนินการ {a.psychosocial.learning.done} จาก {a.psychosocial.learning.planned} หัวข้อ · กิจกรรมครอบครัว {a.psychosocial.family.done} จาก {a.psychosocial.family.planned} ครั้ง · การเข้าร่วมกิจกรรมเฉลี่ย {a.psychosocial.attendancePct != null ? `${a.psychosocial.attendancePct}%` : "-"}</p>
      <table>
        <thead><tr><th>แบบประเมิน</th><th style={{ width: "40mm" }}>ก่อน (เฉลี่ย / คน)</th><th style={{ width: "40mm" }}>หลัง (เฉลี่ย / คน)</th></tr></thead>
        <tbody>
          <tr><td>ความรู้ความเข้าใจเกี่ยวกับยาเสพติด (เต็ม 15)</td>{pp(a.psychosocial.knowledge)}</tr>
          <tr><td>ทัศนคติต่อการใช้สารเสพติด (เต็ม 105)</td>{pp(a.psychosocial.attitude)}</tr>
          <tr><td>ขั้นบันไดแรงจูงใจ (ขั้น 1–5)</td>{pp(a.psychosocial.motivation)}</tr>
        </tbody>
      </table>
      <Lines n={1} />

      <p><b>3.4 ด้านคุณภาพชีวิต</b></p>
      <table>
        <thead><tr><th>แบบประเมิน</th><th style={{ width: "40mm" }}>ก่อน (เฉลี่ย / คน)</th><th style={{ width: "40mm" }}>หลัง (เฉลี่ย / คน)</th></tr></thead>
        <tbody>
          <tr><td>คุณภาพชีวิต WHOQOL-26 (26–130)</td>{pp(a.quality.whoqol)}</tr>
          {a.quality.domainsPre.map((d, i) => <tr key={d.code}><td>&nbsp;&nbsp;{d.name}</td><td className="center">{v(d.avg)}</td><td className="center">{v(a.quality.domainsPost[i].avg)}</td></tr>)}
          <tr><td>ความภาคภูมิใจในตนเอง Rosenberg (10–40)</td>{pp(a.quality.selfEsteem)}</tr>
        </tbody>
      </table>
      <Lines n={1} />

      <p><b>3.5 ด้านการฝึกวิชาชีพ</b></p>
      <p>กิจกรรมเตรียมกลับสู่สังคม/ฝึกวิชาชีพ/บ้านกึ่งวิถี ดำเนินการ {a.vocational.done} จาก {a.vocational.planned} ครั้ง ({a.vocational.hours} ชั่วโมง)</p>
      <Lines n={2} />

      <h2>4. การนำเข้าข้อมูล บสต. และ รท.101</h2>
      <table>
        <thead><tr><th>ระบบ</th><th style={{ width: "30mm" }}>เป้าหมาย (คน)</th><th style={{ width: "36mm" }}>ดำเนินการจริง (คน)</th></tr></thead>
        <tbody>
          <tr><td>บสต. (ลงทะเบียน)</td><td className="center">{v(r.records.bst?.target)}</td><td className="center">{v(r.records.bst?.done)}</td></tr>
          <tr><td>รท.101</td><td className="center">{v(r.records.rt101?.target)}</td><td className="center">{v(r.records.rt101?.done)}</td></tr>
        </tbody>
      </table>

      <h2>5. งบประมาณ</h2>
      {r.budget.length === 0 ? <p className="muted">ยังไม่ได้ตั้งงบของรุ่น</p> : r.budget.map((b) => (
        <div key={b.allocation.id} style={{ marginBottom: 6 }}>
          <p>แหล่งเงิน: {b.allocation.subject}{b.allocation.docNo ? ` (หนังสือที่ ${b.allocation.docNo})` : ""} · ได้รับจัดสรร {baht(b.received)} บาท</p>
          <table>
            <thead><tr><th>หมวด</th><th style={{ width: "30mm" }}>ได้รับ (งบของรุ่น)</th><th style={{ width: "28mm" }}>ใช้ครั้งนี้</th><th style={{ width: "28mm" }}>สะสม</th><th style={{ width: "28mm" }}>คงเหลือ</th></tr></thead>
            <tbody>
              {b.rows.map((x) => <tr key={x.category}><td>{BUDGET_CATEGORIES[x.category]}</td><td className="right">{baht(x.budget)}</td><td className="right">{baht(x.thisTime)}</td><td className="right">{baht(x.cumulative)}</td><td className="right">{baht(x.remaining)}</td></tr>)}
              <tr><td><b>รวม</b></td>{(["budget", "thisTime", "cumulative", "remaining"] as const).map((k) => <td key={k} className="right"><b>{baht(b.rows.reduce((t, x) => t + x[k], 0))}</b></td>)}</tr>
            </tbody>
          </table>
        </div>
      ))}

      <h2>6. ปัญหา อุปสรรค และข้อเสนอแนะ</h2>
      <Lines n={4} />

      <SignatureBlock lines={[{ role: "ผู้รายงาน" }, { role: s("docs.unitHeadTitle") || "หัวหน้าสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด", name: s("docs.unitHeadName") || null }, { role: s("org.headTitle") || "ผู้บัญชาการเรือนจำ", name: s("org.headName") || null }]} />
      <DocFooter text={footer} />
    </div>
  );
}
