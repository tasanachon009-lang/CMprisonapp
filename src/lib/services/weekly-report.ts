import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { addDays, fiscalYearOf, formatThaiDate, isValidISODate, toISODateInTZ, weekdayOf } from "../thai-date";
import { cohortLabel } from "./cohorts";
import { activeStaff } from "./schedule";
import { OUTCOME_LABEL } from "../session-report-text";
import { fiscalSummary } from "./budget";

/**
 * รายงานประจำสัปดาห์ (สเปก 18.2) — ร่างอัตโนมัติศุกร์ 15.00 · ผู้ดูแลแก้ข้อความ → อนุมัติ (ตัวเลข ณ วันอนุมัติคงที่)
 * ไม่มีชื่อผู้ต้องขังในรายงาน (ตัวเลขรวมเท่านั้น) · มีชื่อเจ้าหน้าที่/วิทยากรได้
 */
/** ผู้รับผิดชอบที่แสดงในรายงาน: 1–2 คนหลัก ชื่อเต็มไม่ตัดคำ · คาบที่ทุกคนร่วม = "ทีมสหวิชาชีพ" */
export function leadText(names: string[], team: boolean): string {
  const list = Array.from(new Set(names.map((n) => n.trim()).filter((n) => n && n !== "-")));
  if (team || list.length > 2) return "ทีมสหวิชาชีพ";
  return list.length ? list.join(" และ ") : "-";
}

export const mondayOf = (d: string) => addDays(d, weekdayOf(d) === 0 ? -6 : 1 - weekdayOf(d));

export type ReportKind = "weekly" | "monthly";
export type WeeklyData = ReturnType<typeof collectPeriod>;

export function collectWeekly(db: DB, monday: string) {
  if (!isValidISODate(monday) || weekdayOf(monday) !== 1) throw new RuleError("สัปดาห์ต้องเริ่มวันจันทร์");
  return collectPeriod(db, monday, addDays(monday, 6), "weekly");
}

/** วันแรก–วันสุดท้ายของเดือน จาก "YYYY-MM" */
export function monthRange(month: string): [string, string] {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new RuleError("กรุณาเลือกเดือนให้ถูกต้อง");
  const [y, m] = month.split("-").map(Number);
  return [`${month}-01`, `${month}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`];
}
export function collectMonthly(db: DB, month: string) {
  const [from, to] = monthRange(month);
  return collectPeriod(db, from, to, "monthly");
}

/** รวบรวมตัวเลขของช่วงวันที่ (สัปดาห์หรือเดือน) — ชื่อช่อง monday/sunday คงไว้ให้รายงานเดิมที่เก็บแล้วอ่านได้ */
export function collectPeriod(db: DB, monday: string, sunday: string, kind: ReportKind = "weekly") {
  if (!isValidISODate(monday) || !isValidISODate(sunday) || sunday < monday) throw new RuleError("ช่วงวันที่ของรายงานไม่ถูกต้อง");
  const users = new Map(db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).all().map((u) => [u.id, `${u.f} ${u.l}`]));
  const ins = new Map(db.select({ id: schema.instructors.id, f: schema.instructors.firstName, l: schema.instructors.lastName }).from(schema.instructors).all().map((i) => [i.id, `${i.f ?? ""} ${i.l ?? ""}`.trim()]));

  // 1) ภาพรวม: รุ่นที่ดำเนินการในสัปดาห์นี้
  const cohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(isNull(schema.cohorts.deletedAt), lte(schema.cohorts.startDate, sunday), gte(schema.cohorts.endDate, monday))).orderBy(asc(schema.cohorts.startDate)).all();
  const cohortIds = cohorts.map((r) => r.c.id);
  const enr = cohortIds.length ? db.select().from(schema.enrollments).where(and(inArray(schema.enrollments.cohortId, cohortIds), ne(schema.enrollments.status, "draft"))).all() : [];
  const inWeek = (d: string | null) => !!d && d >= monday && d <= sunday;
  const sessions = cohortIds.length ? db.select().from(schema.cohortSessions).where(and(inArray(schema.cohortSessions.cohortId, cohortIds), gte(schema.cohortSessions.date, monday), lte(schema.cohortSessions.date, sunday), isNull(schema.cohortSessions.deletedAt))).orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime)).all() : [];
  const sIds = sessions.map((s) => s.id);
  const attRows = sIds.length ? db.select({ cohortId: schema.cohortSessions.cohortId, status: schema.attendance.status, n: sql<number>`count(*)` }).from(schema.attendance)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.attendance.sessionId)).where(inArray(schema.attendance.sessionId, sIds)).groupBy(schema.cohortSessions.cohortId, schema.attendance.status).all() : [];
  const att = Array.from(new Set(attRows.map((a) => a.status))).map((status) => ({ status, n: attRows.filter((a) => a.status === status).reduce((t, a) => t + a.n, 0) }));
  const cohortPct = (cohortId: number) => {
    const rows = attRows.filter((a) => a.cohortId === cohortId && a.status !== "corrections");
    const total = rows.reduce((t, a) => t + a.n, 0);
    return total ? Math.round(((rows.find((a) => a.status === "present")?.n ?? 0) / total) * 1000) / 10 : null;
  };
  const present = att.find((a) => a.status === "present")?.n ?? 0;
  // ไม่นับเหตุราชทัณฑ์เป็นขาด (สเปก 9)
  const counted = att.filter((a) => a.status !== "corrections").reduce((s, a) => s + a.n, 0);
  const label = new Map(cohorts.map((r) => [r.c.id, `${r.course.shortName} ${cohortLabel(r.c)}`]));
  const overview = {
    cohorts: cohorts.map((r) => ({ id: r.c.id, attendancePct: cohortPct(r.c.id), label: label.get(r.c.id)!, enrolled: enr.filter((e) => e.cohortId === r.c.id).length, active: enr.filter((e) => e.cohortId === r.c.id && e.status === "active").length })),
    people: enr.length,
    newThisWeek: enr.filter((e) => inWeek(e.enrolledDate)).length,
    completed: enr.filter((e) => e.status === "completed" && inWeek(e.leftDate)).length,
    left: enr.filter((e) => (e.status === "dropped" || e.status === "withdrawn") && inWeek(e.leftDate)).length,
    attendancePct: counted ? Math.round((present / counted) * 1000) / 10 : null,
  };

  // 2) กิจกรรมที่ทำตามตาราง + ที่ไม่ได้ทำพร้อมเหตุผล
  const reports = new Map(sIds.length ? db.select().from(schema.sessionReports).where(and(inArray(schema.sessionReports.sessionId, sIds), isNull(schema.sessionReports.deletedAt))).all().map((r) => [r.sessionId, r]) : []);
  const staff = activeStaff(db, sIds);
  const teamTopics = new Set(db.select({ id: schema.activityTopics.id }).from(schema.activityTopics).where(eq(schema.activityTopics.staffingType, "team")).all().map((t) => t.id));
  const nameOf = (x: (typeof staff)[number]) => (x.userId ? users.get(x.userId) : x.instructorId ? ins.get(x.instructorId) : x.externalName) ?? "-";
  const activities = sessions.map((s) => {
    const r = reports.get(s.id);
    const st = staff.filter((x) => x.sessionId === s.id);
    const leads = st.filter((x) => x.role === "lead");
    return {
      sessionId: s.id, cohortId: s.cohortId, outcome: s.status === "cancelled" ? "cancelled" : r?.outcome ?? null, issues: r?.issues ?? null,
      /** ผู้รับผิดชอบหลัก 1–2 คน (ชื่อเต็ม) · คาบที่ทุกคนร่วม = "ทีมสหวิชาชีพ" (สเปก 18.2B) */
      lead: leadText(leads.length ? leads.map(nameOf) : st.map(nameOf), !leads.length && (st.length > 2 || (s.topicId != null && teamTopics.has(s.topicId)))),
      date: s.date, time: `${s.startTime}–${s.endTime}`, title: s.title, cohort: label.get(s.cohortId) ?? "",
      staff: staff.filter((x) => x.sessionId === s.id).map((x) => (x.userId ? users.get(x.userId) : x.instructorId ? ins.get(x.instructorId) : x.externalName) ?? "-").join(", "),
      participants: r?.participants ?? null,
      result: s.status === "cancelled" ? "ยกเลิก" : r ? OUTCOME_LABEL[r.outcome] : s.date <= toISODateInTZ(new Date()) ? "ยังไม่บันทึกผล" : "ยังไม่ถึงวัน",
      summary: r?.summary ?? null, reason: r?.reason ?? null, done: r?.outcome === "planned" || r?.outcome === "partial",
    };
  });

  // 3) ผลประเมิน/พฤติกรรม (ตัวเลขรวม ไม่ระบุชื่อ · ไม่รวมแบบประเมินสุขภาพ)
  const forms = new Map(db.select().from(schema.assessmentForms).all().map((f) => [f.id, f]));
  const results = db.select({ formId: schema.assessmentResults.formId, round: schema.assessmentResults.round, n: sql<number>`count(*)` }).from(schema.assessmentResults)
    .where(and(gte(schema.assessmentResults.assessedDate, monday), lte(schema.assessmentResults.assessedDate, sunday))).groupBy(schema.assessmentResults.formId, schema.assessmentResults.round).all()
    .filter((r) => !forms.get(r.formId)?.sensitive)
    .map((r) => ({ form: forms.get(r.formId)?.shortName ?? String(r.formId), round: r.round, count: r.n }));
  const behavior = db.select({ tone: schema.behaviorNotes.tone, n: sql<number>`count(*)` }).from(schema.behaviorNotes)
    .where(and(gte(schema.behaviorNotes.noteDate, monday), lte(schema.behaviorNotes.noteDate, sunday), isNull(schema.behaviorNotes.deletedAt))).groupBy(schema.behaviorNotes.tone).all();

  // 4) บสต. / รท.101 · ค่าตอบแทน · งบคงเหลือ
  const bstDone = db.select({ system: schema.bstTasks.system, n: sql<number>`count(*)` }).from(schema.bstTasks).where(and(eq(schema.bstTasks.status, "done"), gte(schema.bstTasks.doneDate, monday), lte(schema.bstTasks.doneDate, sunday))).groupBy(schema.bstTasks.system).all();
  const bstOverdue = db.select({ system: schema.bstTasks.system, n: sql<number>`count(*)` }).from(schema.bstTasks).where(and(eq(schema.bstTasks.status, "pending"), lte(schema.bstTasks.dueDate, sunday))).groupBy(schema.bstTasks.system).all();
  const approvedPay = db.select({ n: sql<number>`COALESCE(SUM(${schema.payBatches.totalSatang}), 0)` }).from(schema.payBatches)
    .where(and(eq(schema.payBatches.status, "approved"), gte(schema.payBatches.approvedAt, new Date(`${monday}T00:00:00+07:00`)), lte(schema.payBatches.approvedAt, new Date(`${sunday}T23:59:59+07:00`)))).get()?.n ?? 0;
  const draftBatches = db.select({ n: sql<number>`count(*)` }).from(schema.payBatches).where(and(eq(schema.payBatches.status, "draft"), isNull(schema.payBatches.deletedAt))).get()?.n ?? 0;
  const fy = fiscalSummary(db, fiscalYearOf(monday)).perAllocation;
  const money = {
    approvedPaySatang: approvedPay, draftBatches,
    budgetFiscalYear: fiscalYearOf(monday), budgetAllocatedSatang: fy.reduce((s, a) => s + a.amountSatang, 0), budgetSpentSatang: fy.reduce((s, a) => s + a.spent, 0), budgetRemainingSatang: fy.reduce((s, a) => s + a.remaining, 0),
  };

  // 5) ปัญหา/ข้อเสนอแนะ (รวบรวมจากผลกิจกรรม) · 6) แผนสัปดาห์หน้า
  const issues = Array.from(new Set(sessions.map((s) => ({ s, r: reports.get(s.id) })).filter((x) => x.r?.issues?.trim()).map((x) => `${label.get(x.s.cohortId)} ${x.s.title}: ${x.r!.issues!.trim()}`)));
  // ช่วงถัดไป: สัปดาห์ถัดไป หรือเดือนถัดไป
  const nextMon = addDays(sunday, 1);
  const nextEnd = kind === "monthly" ? monthRange(nextMon.slice(0, 7))[1] : addDays(nextMon, 6);
  const next = db.select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses }).from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(gte(schema.cohortSessions.date, nextMon), lte(schema.cohortSessions.date, nextEnd), ne(schema.cohortSessions.status, "cancelled"), isNull(schema.cohortSessions.deletedAt))).all();
  const planByCohort = new Map<string, number>();
  for (const r of next) { const k = `${r.course.shortName} ${cohortLabel(r.c)}`; planByCohort.set(k, (planByCohort.get(k) ?? 0) + 1); }
  const plan = [...planByCohort].map(([k, n]) => `${k} จัดกิจกรรมตามตาราง ${n} คาบ`);
  const newCohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(gte(schema.cohorts.startDate, nextMon), lte(schema.cohorts.startDate, nextEnd), isNull(schema.cohorts.deletedAt))).all();
  for (const r of newCohorts) plan.unshift(`เปิด ${r.course.shortName} ${cohortLabel(r.c)} วันที่ ${formatThaiDate(r.c.startDate, "long")}`);

  return {
    kind, monday, sunday, overview, activities,
    assessments: results, behavior: behavior.map((b) => ({ tone: b.tone, count: b.n })),
    bst: { done: bstDone.map((x) => ({ system: x.system, count: x.n })), overdue: bstOverdue.map((x) => ({ system: x.system, count: x.n })) },
    money, issuesPrefill: issues.join("\n"), planPrefill: plan.join("\n"),
  };
}

export function getWeekly(db: DB, monday: string, kind: ReportKind = "weekly") {
  return db.select().from(schema.weeklyReports).where(and(eq(schema.weeklyReports.kind, kind), eq(schema.weeklyReports.weekStart, monday), isNull(schema.weeklyReports.deletedAt))).get() ?? null;
}
/** วันสุดท้ายของช่วงรายงาน (รายงานสัปดาห์รุ่นเดิมไม่มี periodEnd) */
export const periodEndOf = (r: { weekStart: string; periodEnd: string | null }) => r.periodEnd ?? addDays(r.weekStart, 6);
const recollect = (db: DB, r: { kind: string; weekStart: string; periodEnd: string | null }) => collectPeriod(db, r.weekStart, periodEndOf(r), r.kind === "monthly" ? "monthly" : "weekly");

/** สร้าง/อัปเดตร่างรายงานประจำเดือน ("YYYY-MM") */
export function upsertMonthlyDraft(db: DB, month: string, actorId: number | null = null) {
  const [from, to] = monthRange(month);
  const data = collectPeriod(db, from, to, "monthly");
  const prev = getWeekly(db, from, "monthly");
  if (prev?.status === "approved") return prev;
  if (prev) {
    db.update(schema.weeklyReports).set({ data, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.weeklyReports.id, prev.id)).run();
    return { ...prev, data };
  }
  return db.insert(schema.weeklyReports).values({ kind: "monthly", weekStart: from, periodEnd: to, data, issues: data.issuesPrefill || null, nextPlan: data.planPrefill || null, createdBy: actorId, updatedBy: actorId }).returning().get();
}

/** สร้าง/อัปเดตร่าง (ข้อความที่ผู้ดูแลแก้แล้วไม่ถูกทับ) — รายงานที่อนุมัติแล้วไม่เปลี่ยน */
export function upsertDraft(db: DB, monday: string, actorId: number | null = null) {
  const data = collectWeekly(db, monday);
  const prev = getWeekly(db, monday, "weekly");
  if (prev?.status === "approved") return prev;
  if (prev) {
    db.update(schema.weeklyReports).set({ data, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.weeklyReports.id, prev.id)).run();
    return { ...prev, data };
  }
  return db.insert(schema.weeklyReports).values({ kind: "weekly", weekStart: monday, periodEnd: data.sunday, data, issues: data.issuesPrefill || null, nextPlan: data.planPrefill || null, createdBy: actorId, updatedBy: actorId }).returning().get();
}

export function saveWeeklyTexts(db: DB, id: number, t: { issues?: string | null; nextPlan?: string | null; note?: string | null }, actor: { userId: number; ip?: string | null }) {
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, id)).get();
  if (!r || r.deletedAt) throw new RuleError("ไม่พบรายงาน");
  if (r.status === "approved") throw new RuleError("รายงานนี้อนุมัติแล้ว — ยกเลิกการอนุมัติก่อนจึงแก้ได้");
  const next = { issues: t.issues?.slice(0, 5000) ?? null, nextPlan: t.nextPlan?.slice(0, 5000) ?? null, note: t.note?.slice(0, 2000) ?? null };
  db.update(schema.weeklyReports).set({ ...next, updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.weeklyReports.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "weekly_report", entityId: id, ip: actor.ip });
}

/**
 * อนุมัติ: เก็บตัวเลข ณ ขณะนี้เป็นฉบับคงที่
 * สเปก 18.2B: มีคาบที่ยังไม่บันทึกผล → ต้องยืนยัน (acknowledgeUnrecorded) จึงอนุมัติได้ และบันทึกจำนวนไว้ในประวัติ
 */
export function approveWeekly(db: DB, id: number, actor: { userId: number; ip?: string | null }, opts: { acknowledgeUnrecorded?: boolean } = {}) {
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, id)).get();
  if (!r || r.deletedAt) throw new RuleError("ไม่พบรายงาน");
  if (r.status === "approved") throw new RuleError("รายงานนี้อนุมัติแล้ว");
  const data = recollect(db, r);
  const unrecorded = data.activities.filter((a) => a.result === "ยังไม่บันทึกผล").length;
  if (unrecorded > 0 && !opts.acknowledgeUnrecorded) throw new RuleError(`ยังมีคาบที่ไม่ได้บันทึกผล ${unrecorded} คาบ — บันทึกผลให้ครบ หรือยืนยันการเสนอทั้งที่ยังไม่ครบ`);
  db.update(schema.weeklyReports).set({ data, status: "approved", approvedBy: actor.userId, approvedAt: new Date(), updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.weeklyReports.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "approve", entity: "weekly_report", entityId: id, note: unrecorded ? `เสนอทั้งที่ยังไม่บันทึกผล ${unrecorded} คาบ` : undefined, ip: actor.ip });
  return { ...r, data, status: "approved" };
}

export function unapproveWeekly(db: DB, id: number, reason: string, actor: { userId: number; ip?: string | null }) {
  if (!reason?.trim()) throw new RuleError("กรุณาระบุเหตุผลที่ยกเลิกการอนุมัติ");
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, id)).get();
  if (!r || r.status !== "approved") throw new RuleError("รายงานนี้ยังไม่ได้อนุมัติ");
  db.update(schema.weeklyReports).set({ status: "draft", approvedBy: null, approvedAt: null, updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.weeklyReports.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "weekly_report", entityId: id, note: `ยกเลิกการอนุมัติ: ${reason.trim()}`, ip: actor.ip });
}

export function listWeekly(db: DB) {
  return db.select().from(schema.weeklyReports).where(isNull(schema.weeklyReports.deletedAt)).orderBy(sql`${schema.weeklyReports.weekStart} DESC`).all();
}

/** ข้อความ LINE "สรุปตัวเลข" ถึงผู้บริหาร (ไม่มีชื่อผู้ต้องขัง ไม่มีชื่อบุคคล) */
export function weeklyLineSummary(d: WeeklyData) {
  const b = (s: number) => (s / 100).toLocaleString("th-TH", { maximumFractionDigits: 0 });
  const done = d.activities.filter((a) => a.done).length;
  const notDone = d.activities.filter((a) => a.result === "ไม่ได้ทำ" || a.result === "ยกเลิก").length;
  return [
    `📊 สรุปรายงานประจำสัปดาห์ ${formatThaiDate(d.monday)} – ${formatThaiDate(d.sunday)}`,
    `• รุ่นที่ดำเนินการ ${d.overview.cohorts.length} รุ่น · ผู้เข้ารับการฟื้นฟู ${d.overview.people} คน (รับใหม่ ${d.overview.newThisWeek} · จบ ${d.overview.completed} · ออก ${d.overview.left})`,
    `• เข้าร่วมกิจกรรม ${d.overview.attendancePct ?? "-"}% · กิจกรรมตามแผน ${done} คาบ · ไม่ได้ทำ/ยกเลิก ${notDone} คาบ`,
    `• บสต. ลงแล้วสัปดาห์นี้ ${d.bst.done.find((x) => x.system === "bst")?.count ?? 0} รายการ · รท.101 ${d.bst.done.find((x) => x.system === "rt101")?.count ?? 0} รายการ`,
    `• ค่าตอบแทนอนุมัติสัปดาห์นี้ ${b(d.money.approvedPaySatang)} บาท · งบปีงบ ${d.money.budgetFiscalYear} คงเหลือ ${b(d.money.budgetRemainingSatang)} บาท`,
  ].join("\n");
}
