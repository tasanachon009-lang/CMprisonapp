import type { WeeklyData } from "@/lib/services/weekly-report";
import { formatThaiDate } from "@/lib/thai-date";

const b = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROUND: Record<string, string> = { pre: "ก่อน", post: "หลัง", monthly: "รายเดือน", followup: "ติดตาม" };
const TONE: Record<string, string> = { positive: "เชิงบวก", negative: "เชิงลบ", observe: "สังเกต" };

/** เนื้อรายงานประจำสัปดาห์ 6 ส่วน (สเปก 18.2) — ใช้ทั้งหน้าจอและหน้าพิมพ์ · ไม่มีชื่อผู้ต้องขัง */
export function WeeklyBody({ d, issues, nextPlan, note, compact = false }: { d: WeeklyData; issues: string | null; nextPlan: string | null; note: string | null; compact?: boolean }) {
  const cls = compact ? "" : "w-full text-sm";
  const th = compact ? undefined : "py-1 text-left text-muted";
  const done = d.activities.filter((a) => a.done);
  const notDone = d.activities.filter((a) => !a.done && a.result !== "ยังไม่ถึงวัน");
  return (
    <div className={compact ? "" : "space-y-5"}>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>1. ภาพรวม</h3>
        <p>รุ่นที่ดำเนินการ {d.overview.cohorts.length} รุ่น · ผู้เข้ารับการฟื้นฟู {d.overview.people} คน · รับใหม่ {d.overview.newThisWeek} · จบหลักสูตร {d.overview.completed} · ออกก่อนกำหนด {d.overview.left} · เข้าร่วมกิจกรรม {d.overview.attendancePct ?? "-"}%</p>
        {d.overview.cohorts.length > 0 && <ul style={{ paddingLeft: 20 }}>{d.overview.cohorts.map((c) => <li key={c.label}>{c.label}: {c.enrolled} คน (กำลังอบรม {c.active})</li>)}</ul>}
      </section>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>2. กิจกรรมที่ทำตามตาราง ({done.length} คาบ)</h3>
        {done.length === 0 ? <p>-</p> : (
          <table className={cls}>
            <thead><tr><th className={th}>วันที่</th><th className={th}>หัวข้อ</th><th className={th}>รุ่น</th><th className={th}>ผู้รับผิดชอบ</th><th className={th}>ผู้เข้าร่วม</th><th className={th}>ผล / สรุป</th></tr></thead>
            <tbody>{done.map((a, i) => <tr key={i} className={compact ? undefined : "border-t border-line align-top"}><td>{formatThaiDate(a.date)}</td><td>{a.title}</td><td>{a.cohort}</td><td>{a.staff || "-"}</td><td>{a.participants ?? "-"}</td><td>{a.result}{a.summary ? ` — ${a.summary}` : ""}</td></tr>)}</tbody>
          </table>
        )}
        {notDone.length > 0 && (
          <>
            <p style={{ marginTop: 6 }}><b>ไม่ได้ทำ / ยกเลิก / ยังไม่บันทึกผล ({notDone.length} คาบ)</b></p>
            <ul style={{ paddingLeft: 20 }}>{notDone.map((a, i) => <li key={i}>{formatThaiDate(a.date)} {a.title} ({a.cohort}) — {a.result}{a.reason ? `: ${a.reason}` : ""}</li>)}</ul>
          </>
        )}
      </section>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>3. ผลประเมิน / พฤติกรรม (ตัวเลขรวม)</h3>
        <p>แบบประเมินที่บันทึก: {d.assessments.length ? d.assessments.map((a) => `${a.form} (${ROUND[a.round] ?? a.round}) ${a.count}`).join(" · ") : "-"}</p>
        <p>บันทึกพฤติกรรม: {d.behavior.length ? d.behavior.map((x) => `${TONE[x.tone] ?? x.tone} ${x.count}`).join(" · ") : "-"}</p>
      </section>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>4. บสต. · ค่าตอบแทน · งบประมาณ</h3>
        <p>บสต. ลงแล้วสัปดาห์นี้ {d.bst.done.find((x) => x.system === "bst")?.count ?? 0} รายการ (ค้างถึงกำหนด {d.bst.overdue.find((x) => x.system === "bst")?.count ?? 0}) · รท.101 ลงแล้ว {d.bst.done.find((x) => x.system === "rt101")?.count ?? 0} (ค้าง {d.bst.overdue.find((x) => x.system === "rt101")?.count ?? 0})</p>
        <p>ค่าตอบแทนอนุมัติสัปดาห์นี้ {b(d.money.approvedPaySatang)} บาท · รอบเบิกรออนุมัติ {d.money.draftBatches} รอบ</p>
        <p>งบประมาณปีงบ {d.money.budgetFiscalYear}: จัดสรร {b(d.money.budgetAllocatedSatang)} · ใช้แล้ว {b(d.money.budgetSpentSatang)} · คงเหลือ {b(d.money.budgetRemainingSatang)} บาท</p>
      </section>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>5. ปัญหา อุปสรรค ข้อเสนอแนะ</h3>
        <p style={{ whiteSpace: "pre-line" }}>{issues?.trim() || "-"}</p>
      </section>
      <section>
        <h3 className={compact ? undefined : "text-lg font-semibold"}>6. แผนสัปดาห์หน้า</h3>
        <p style={{ whiteSpace: "pre-line" }}>{nextPlan?.trim() || "-"}</p>
      </section>
      {note?.trim() && <section><h3 className={compact ? undefined : "text-lg font-semibold"}>หมายเหตุ</h3><p style={{ whiteSpace: "pre-line" }}>{note}</p></section>}
    </div>
  );
}
