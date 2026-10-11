import type { WeeklyData, ReportKind } from "./weekly-report";
import { leadText } from "./weekly-report";
import type { DocInput, Annex, AnnexBlock, Endorsement } from "../docs/view";
import { thaiDateRange } from "../docs/view";
import { formatThaiDate, THAI_MONTHS } from "../thai-date";

/**
 * รายงานประจำสัปดาห์/เดือน แบบ 2 ชั้น (สเปก 18.2B)
 * ชั้น 1 บันทึกข้อความ 1 หน้า (สรุปสั้น) · ชั้น 2 สิ่งที่ส่งมาด้วย (ตารางรายละเอียด เฉพาะคาบที่ต่างจากแผน)
 * ฟังก์ชันล้วน — ใช้ร่วมกันทั้งหน้าจอ หน้าพิมพ์ (PDF) และไฟล์ Word · ไม่มีชื่อผู้ต้องขัง
 */
type Act = WeeklyData["activities"][number];
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ROUND: Record<string, string> = { pre: "ก่อนเรียน", post: "หลังเรียน", monthly: "รายเดือน", followup: "ติดตาม" };
const TONE: Record<string, string> = { positive: "เชิงบวก", negative: "เชิงลบ", observe: "ต้องสังเกต" };
const SYSTEM_SUMMARY = /^ดำเนินกิจกรรมตามแผน(\s|$)/;

/** ข้อความที่ผู้ดูแลพิมพ์ (หลายบรรทัด) → รายการ ตัดเครื่องหมายนำหน้า และรวมบรรทัดที่ซ้ำกัน */
export function textLines(s: string | null | undefined): string[] {
  return Array.from(new Set((s ?? "").split(/\r?\n/).map((x) => x.replace(/^[\s•\-–*]+/, "").trim()).filter(Boolean)));
}

export type CohortLine = { label: string; enrolled: number; planned: number; done: number; notDone: number; unrecorded: number; upcoming: number; attendancePct: number | null; events: number };
export type ExceptionRow = { sessionId: number | null; date: string; title: string; cohort: string; lead: string; result: string; detail: string };

export function reportModel(d: WeeklyData) {
  const kind: ReportKind = d.kind === "monthly" ? "monthly" : "weekly";
  // รายงานที่เก็บไว้ก่อนปรับรูปแบบไม่มีช่อง lead/outcome/issues → คำนวณจากช่องเดิม
  const acts = d.activities.map((a: Act) => ({
    ...a,
    sessionId: a.sessionId ?? null,
    lead: a.lead ?? leadText((a.staff ?? "").split(",").map((x) => x.trim()), false),
    issues: a.issues ?? null,
    partial: a.outcome ? a.outcome === "partial" : a.result === "บางส่วน",
    notDone: a.result === "ไม่ได้ทำ" || a.result === "ยกเลิก",
    unrecorded: a.result === "ยังไม่บันทึกผล",
    upcoming: a.result === "ยังไม่ถึงวัน",
  }));
  const due = acts.filter((a) => !a.upcoming);
  const isException = (a: (typeof acts)[number]) => a.notDone || a.partial || !!a.issues?.trim();
  const cohorts: CohortLine[] = d.overview.cohorts.map((c) => {
    const mine = acts.filter((a) => a.cohort === c.label);
    return {
      label: c.label, enrolled: c.enrolled,
      planned: mine.filter((a) => !a.upcoming).length, done: mine.filter((a) => a.done).length, notDone: mine.filter((a) => a.notDone).length,
      unrecorded: mine.filter((a) => a.unrecorded).length, upcoming: mine.filter((a) => a.upcoming).length,
      attendancePct: c.attendancePct ?? null, events: mine.filter((a) => !!a.issues?.trim()).length,
    };
  });
  const exceptions: ExceptionRow[] = acts.filter(isException).map((a) => ({
    sessionId: a.sessionId, date: a.date, title: a.title, cohort: a.cohort, lead: a.lead,
    result: a.result,
    detail: Array.from(new Set([a.reason, a.partial ? a.summary : null, a.issues].map((x) => x?.trim()).filter((x): x is string => !!x))).join(" · ") || "-",
  }));
  // คาบปกติ: สรุปเป็นตัวเลข + รวมข้อความสรุปที่ซ้ำกันเป็นบรรทัดเดียว
  const normal = acts.filter((a) => a.done && !isException(a));
  const normalByCohort = cohorts.map((c) => {
    const mine = normal.filter((a) => a.cohort === c.label);
    const withP = mine.filter((a) => a.participants != null);
    const counts = new Map<string, number>();
    for (const a of mine) { const t = a.summary?.trim(); if (t && !SYSTEM_SUMMARY.test(t)) counts.set(t, (counts.get(t) ?? 0) + 1); }
    return {
      label: c.label, sessions: mine.length,
      avgParticipants: withP.length ? Math.round(withP.reduce((t, a) => t + (a.participants ?? 0), 0) / withP.length) : null,
      summaries: [...counts].sort((x, y) => y[1] - x[1]).slice(0, 3).map(([text, n]) => ({ text, n })),
    };
  }).filter((x) => x.sessions > 0);
  const bst = (list: Array<{ system: string; count: number }>, sys: string) => list.find((x) => x.system === sys)?.count ?? 0;
  return {
    kind, from: d.monday, to: d.sunday,
    totals: {
      cohorts: cohorts.length, people: d.overview.people, newcomers: d.overview.newThisWeek, completed: d.overview.completed, left: d.overview.left,
      planned: due.length, done: due.filter((a) => a.done).length, notDone: due.filter((a) => a.notDone).length, unrecorded: due.filter((a) => a.unrecorded).length,
      attendancePct: d.overview.attendancePct, events: acts.filter((a) => !!a.issues?.trim()).length,
    },
    cohorts, exceptions, normalByCohort,
    /** ใช้เตือนก่อนอนุมัติเท่านั้น — ไม่ลงในรายงานที่เสนอ */
    unrecordedList: acts.filter((a) => a.unrecorded).map((a) => ({ sessionId: a.sessionId, date: a.date, time: a.time, title: a.title, cohort: a.cohort })),
    assessments: d.assessments.map((a) => `${a.form} (${ROUND[a.round] ?? a.round}) ${a.count} ฉบับ`),
    behavior: d.behavior.map((b) => `${TONE[b.tone] ?? b.tone} ${b.count} รายการ`),
    records: { bstDone: bst(d.bst.done, "bst"), bstOverdue: bst(d.bst.overdue, "bst"), rtDone: bst(d.bst.done, "rt101"), rtOverdue: bst(d.bst.overdue, "rt101") },
    money: d.money,
  };
}
export type ReportModel = ReturnType<typeof reportModel>;

export const periodWord = (kind: ReportKind) => (kind === "monthly" ? "เดือน" : "สัปดาห์");
export function periodTitle(kind: ReportKind, from: string, to: string) {
  if (kind === "monthly") { const [y, m] = from.split("-").map(Number); return `ประจำเดือน${THAI_MONTHS[m - 1]} ${y + 543}`; }
  return `ประจำสัปดาห์ ระหว่างวันที่ ${thaiDateRange(from, to)}`;
}
const pct = (p: number | null) => (p == null ? "ยังไม่มีข้อมูลการเข้าร่วม" : `เข้าร่วมกิจกรรมเฉลี่ยร้อยละ ${p}`);

export type MemoSettings = { unitName: string; toLine: string; signerName: string | null; signerTitle: string | null; docNo?: string | null; docDate: string | null; endorsements: Endorsement[] };
/** จำนวนรายการปัญหา/แผนที่ลงในตัวบันทึก (ที่เหลือไปอยู่สิ่งที่ส่งมาด้วย) เพื่อให้บันทึกอยู่ใน 1 หน้า */
export const MEMO_MAX_LINES = 3;

export function reportMemo(m: ReportModel, texts: { issues: string | null; nextPlan: string | null; note: string | null }, st: MemoSettings): { doc: DocInput; annex: Annex } {
  const word = periodWord(m.kind), t = m.totals;
  const subject = `รายงานผลการดำเนินงาน${periodTitle(m.kind, m.from, m.to)}`;
  const issues = textLines(texts.issues), plan = textLines(texts.nextPlan), note = textLines(texts.note);
  const cut = (list: string[]) => (list.length > MEMO_MAX_LINES ? [...list.slice(0, MEMO_MAX_LINES).map((x) => `- ${x}`), `- รายการอื่นอีก ${list.length - MEMO_MAX_LINES} รายการ ตามสิ่งที่ส่งมาด้วย`] : list.map((x) => `- ${x}`));
  const body = [
    `ด้วย${st.unitName || "สถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด"}ได้ดำเนินงานตามแผน${m.kind === "monthly" ? periodTitle(m.kind, m.from, m.to) : `ประจำสัปดาห์ ระหว่างวันที่ ${thaiDateRange(m.from, m.to)}`} จึงขอรายงานผลโดยสรุป รายละเอียดตามสิ่งที่ส่งมาด้วย ดังนี้`,
    "# สรุปผลการดำเนินงาน",
    `ดำเนินการ ${t.cohorts} รุ่น ผู้เข้ารับการฟื้นฟู ${t.people} คน (รับใหม่ ${t.newcomers} จบหลักสูตร ${t.completed} ออกก่อนกำหนด ${t.left}) จัดกิจกรรมแล้ว ${t.done} จาก ${t.planned} คาบ ไม่ได้จัด ${t.notDone} คาบ ${pct(t.attendancePct)}`,
    ...m.cohorts.map((c) => `- ${c.label} ${c.enrolled} คน จัดกิจกรรม ${c.done}/${c.planned} คาบ ${c.attendancePct == null ? "ยังไม่มีข้อมูลการเข้าร่วม" : `เข้าร่วมร้อยละ ${c.attendancePct}`}${c.events ? ` มีเหตุการณ์ ${c.events} เรื่อง` : ""}${c.unrecorded ? ` ยังไม่บันทึกผล ${c.unrecorded} คาบ` : ""}`),
    "# ปัญหา อุปสรรค และข้อเสนอแนะ",
    ...(issues.length ? cut(issues) : ["- ไม่มี"]),
    `# แผนการดำเนินงาน${word}ถัดไป`,
    ...(plan.length ? cut(plan) : ["- ดำเนินกิจกรรมตามตารางของแต่ละรุ่น"]),
    "จึงเรียนมาเพื่อโปรดทราบ",
  ];
  const blocks: AnnexBlock[] = [
    {
      heading: "1. สรุปรายรุ่น",
      table: {
        head: ["หลักสูตร / รุ่น", "ผู้เข้ารับการฟื้นฟู (คน)", "คาบตามแผน", "จัดแล้ว", "ไม่ได้จัด", "ยังไม่บันทึกผล", "เข้าร่วมเฉลี่ย (ร้อยละ)"],
        widths: [28, 14, 11, 10, 10, 12, 15],
        rows: m.cohorts.map((c) => [c.label, String(c.enrolled), String(c.planned), String(c.done), String(c.notDone), String(c.unrecorded), c.attendancePct == null ? "-" : String(c.attendancePct)]),
      },
    },
    m.exceptions.length
      ? {
        heading: `2. กิจกรรมที่ต่างจากแผน ไม่ได้จัด หรือมีเหตุการณ์ (${m.exceptions.length} คาบ)`,
        table: { head: ["วันที่", "หัวข้อ", "รุ่น", "ผู้รับผิดชอบ", "ผล", "รายละเอียด"], widths: [11, 22, 14, 18, 9, 26], rows: m.exceptions.map((e) => [formatThaiDate(e.date), e.title, e.cohort, e.lead, e.result, e.detail]) },
      }
      : { heading: "2. กิจกรรมที่ต่างจากแผน ไม่ได้จัด หรือมีเหตุการณ์", lines: ["ไม่มี"] },
    {
      heading: "3. กิจกรรมที่จัดตามแผน",
      lines: m.normalByCohort.length
        ? m.normalByCohort.flatMap((c) => [
          `${c.label}: จัดตามแผน ${c.sessions} คาบ${c.avgParticipants != null ? ` ผู้เข้าร่วมเฉลี่ย ${c.avgParticipants} คนต่อคาบ` : ""}`,
          ...c.summaries.map((x) => `   ผลที่บันทึก: ${x.text}${x.n > 1 ? ` (${x.n} คาบ)` : ""}`),
        ])
        : ["ไม่มีคาบที่บันทึกผลว่าจัดตามแผน"],
    },
    { heading: "4. ผลการประเมินและพฤติกรรม (ตัวเลขรวม ไม่ระบุชื่อ)", lines: [`แบบประเมินที่บันทึก: ${m.assessments.join(" · ") || "ไม่มี"}`, `บันทึกพฤติกรรม: ${m.behavior.join(" · ") || "ไม่มี"}`] },
    {
      heading: "5. บสต. รท.101 ค่าตอบแทน และงบประมาณ",
      lines: [
        `บสต. บันทึกแล้ว ${m.records.bstDone} รายการ ค้างเกินกำหนด ${m.records.bstOverdue} รายการ · รท.101 บันทึกแล้ว ${m.records.rtDone} รายการ ค้างเกินกำหนด ${m.records.rtOverdue} รายการ`,
        `ค่าตอบแทนวิทยากรที่อนุมัติ ${baht(m.money.approvedPaySatang)} บาท · รอบเบิกที่รออนุมัติ ${m.money.draftBatches} รอบ`,
        `งบประมาณปีงบประมาณ ${m.money.budgetFiscalYear}: ได้รับจัดสรร ${baht(m.money.budgetAllocatedSatang)} บาท ใช้แล้ว ${baht(m.money.budgetSpentSatang)} บาท คงเหลือ ${baht(m.money.budgetRemainingSatang)} บาท`,
      ],
    },
    ...(issues.length > MEMO_MAX_LINES ? [{ heading: "6. ปัญหา อุปสรรค และข้อเสนอแนะ (ทั้งหมด)", lines: issues.map((x, i) => `${i + 1}) ${x}`) }] : []),
    ...(plan.length > MEMO_MAX_LINES ? [{ heading: `${issues.length > MEMO_MAX_LINES ? 7 : 6}. แผนการดำเนินงาน${word}ถัดไป (ทั้งหมด)`, lines: plan.map((x, i) => `${i + 1}) ${x}`) }] : []),
    ...(note.length ? [{ heading: "หมายเหตุ", lines: note }] : []),
  ];
  return {
    doc: { kind: "memo", docNo: st.docNo ?? null, docDate: st.docDate, subject, toLine: st.toLine, refs: null, attachments: null, body: body.join("\n"), signerName: st.signerName, signerTitle: st.signerTitle, endorsements: st.endorsements },
    annex: { title: "สิ่งที่ส่งมาด้วย", subject, blocks },
  };
}
