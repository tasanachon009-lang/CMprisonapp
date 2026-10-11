import type { ReportModel } from "@/lib/services/report-memo";
import { textLines, periodWord } from "@/lib/services/report-memo";
import { formatThaiDate } from "@/lib/thai-date";
import { Stat } from "@/components/ui";

const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (p: number | null) => (p == null ? "-" : `${p}%`);

/**
 * หน้าจอรายงานประจำสัปดาห์/เดือน (สเปก 18.2B, 4.4): บัตรสรุปตัวเลข → สรุปรายรุ่น → ปัญหา → แผน → รายละเอียด (พับเก็บได้)
 * ไม่มีชื่อผู้ต้องขัง · คาบที่ยังไม่บันทึกผลแสดงเป็นตัวเลขรวมต่อรุ่นเท่านั้น
 */
export function WeeklyBody({ m, issues, nextPlan, note }: { m: ReportModel; issues: string | null; nextPlan: string | null; note: string | null }) {
  const t = m.totals, word = periodWord(m.kind);
  const issueLines = textLines(issues), planLines = textLines(nextPlan);
  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6" aria-label="สรุปตัวเลขสำคัญ">
        <Stat value={t.cohorts} label="รุ่นที่ดำเนินการ" />
        <Stat value={t.people} label={`ผู้เข้ารับการฟื้นฟู (รับใหม่ ${t.newcomers} · จบ ${t.completed} · ออก ${t.left})`} />
        <Stat value={`${t.done}/${t.planned}`} label="คาบที่จัดแล้ว / ตามแผน" tone={t.planned > 0 && t.done === t.planned ? "ok" : undefined} />
        <Stat value={pct(t.attendancePct)} label="เข้าร่วมกิจกรรมเฉลี่ย" tone={t.attendancePct != null && t.attendancePct < 80 ? "warn" : undefined} />
        <Stat value={t.notDone} label="คาบที่ไม่ได้จัด / ยกเลิก" tone={t.notDone ? "warn" : "ok"} />
        <Stat value={t.unrecorded} label="คาบที่ยังไม่บันทึกผล" tone={t.unrecorded ? "danger" : "ok"} />
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl">สรุปรายรุ่น</h2>
        {m.cohorts.length === 0 ? <p className="text-muted">ไม่มีรุ่นที่ดำเนินการในช่วงนี้</p> : (
          <ul className="divide-y divide-line">
            {m.cohorts.map((c) => (
              <li key={c.label} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <b className="min-w-48 grow">{c.label}</b>
                <span>{c.enrolled} คน</span>
                <span>จัดแล้ว {c.done}/{c.planned} คาบ</span>
                <span>เข้าร่วมเฉลี่ย {pct(c.attendancePct)}</span>
                {c.notDone > 0 && <span className="tag-warn">ไม่ได้จัด {c.notDone}</span>}
                {c.events > 0 && <span className="tag-warn">มีเหตุการณ์ {c.events}</span>}
                {c.unrecorded > 0 && <span className="tag-danger">ยังไม่บันทึกผล {c.unrecorded}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="card space-y-2">
          <h2 className="text-xl">ปัญหา อุปสรรค และข้อเสนอแนะ</h2>
          {issueLines.length ? <ul className="list-disc space-y-1 pl-6">{issueLines.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-muted">ไม่มี</p>}
        </section>
        <section className="card space-y-2">
          <h2 className="text-xl">แผน{word}ถัดไป</h2>
          {planLines.length ? <ul className="list-disc space-y-1 pl-6">{planLines.map((x) => <li key={x}>{x}</li>)}</ul> : <p className="text-muted">ดำเนินกิจกรรมตามตารางของแต่ละรุ่น</p>}
        </section>
      </div>
      {note?.trim() && <section className="card"><h2 className="text-xl">หมายเหตุ</h2><p className="whitespace-pre-line">{note}</p></section>}

      <details className="card">
        <summary className="flex min-h-11 cursor-pointer items-center text-xl font-semibold">รายละเอียด</summary>
        <div className="mt-3 space-y-5">
          <div>
            <h3 className="text-lg font-semibold">กิจกรรมที่ต่างจากแผน ไม่ได้จัด หรือมีเหตุการณ์ ({m.exceptions.length} คาบ)</h3>
            {m.exceptions.length === 0 ? <p className="text-muted">ไม่มี</p> : (
              <div className="overflow-x-auto">
                <table className="table-plain">
                  <thead><tr><th>วันที่</th><th>หัวข้อ</th><th>รุ่น</th><th>ผู้รับผิดชอบ</th><th>ผล</th><th>รายละเอียด</th></tr></thead>
                  <tbody>{m.exceptions.map((e, i) => <tr key={i} className="align-top"><td className="whitespace-nowrap">{formatThaiDate(e.date)}</td><td>{e.title}</td><td>{e.cohort}</td><td>{e.lead}</td><td>{e.result}</td><td>{e.detail}</td></tr>)}</tbody>
                </table>
              </div>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">กิจกรรมที่จัดตามแผน</h3>
            {m.normalByCohort.length === 0 ? <p className="text-muted">ไม่มีคาบที่บันทึกผลว่าจัดตามแผน</p> : (
              <ul className="space-y-1">
                {m.normalByCohort.map((c) => (
                  <li key={c.label}>
                    <b>{c.label}</b>: จัดตามแผน {c.sessions} คาบ{c.avgParticipants != null ? ` · ผู้เข้าร่วมเฉลี่ย ${c.avgParticipants} คนต่อคาบ` : ""}
                    {c.summaries.map((x) => <span key={x.text} className="block pl-4 text-muted">ผลที่บันทึก: {x.text}{x.n > 1 ? ` (${x.n} คาบ)` : ""}</span>)}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3 className="text-lg font-semibold">ผลการประเมินและพฤติกรรม (ตัวเลขรวม)</h3>
            <p>แบบประเมินที่บันทึก: {m.assessments.join(" · ") || "ไม่มี"}</p>
            <p>บันทึกพฤติกรรม: {m.behavior.join(" · ") || "ไม่มี"}</p>
          </div>
          <div>
            <h3 className="text-lg font-semibold">บสต. รท.101 ค่าตอบแทน และงบประมาณ</h3>
            <p>บสต. บันทึกแล้ว {m.records.bstDone} รายการ (ค้างเกินกำหนด {m.records.bstOverdue}) · รท.101 บันทึกแล้ว {m.records.rtDone} รายการ (ค้างเกินกำหนด {m.records.rtOverdue})</p>
            <p>ค่าตอบแทนที่อนุมัติ {baht(m.money.approvedPaySatang)} บาท · รอบเบิกที่รออนุมัติ {m.money.draftBatches} รอบ</p>
            <p>งบประมาณปีงบประมาณ {m.money.budgetFiscalYear}: ได้รับจัดสรร {baht(m.money.budgetAllocatedSatang)} · ใช้แล้ว {baht(m.money.budgetSpentSatang)} · คงเหลือ {baht(m.money.budgetRemainingSatang)} บาท</p>
          </div>
        </div>
      </details>
    </div>
  );
}
