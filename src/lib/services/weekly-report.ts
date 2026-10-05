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
export const mondayOf = (d: string) => addDays(d, weekdayOf(d) === 0 ? -6 : 1 - weekdayOf(d));

export type WeeklyData = ReturnType<typeof collectWeekly>;

export function collectWeekly(db: DB, monday: string) {
  if (!isValidISODate(monday) || weekdayOf(monday) !== 1) throw new RuleError("สัปดาห์ต้องเริ่มวันจันทร์");
  const sunday = addDays(monday, 6);
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
  const att = sIds.length ? db.select({ status: schema.attendance.status, n: sql<number>`count(*)` }).from(schema.attendance).where(inArray(schema.attendance.sessionId, sIds)).groupBy(schema.attendance.status).all() : [];
  const present = att.find((a) => a.status === "present")?.n ?? 0;
  // ไม่นับเหตุราชทัณฑ์เป็นขาด (สเปก 9)
  const counted = att.filter((a) => a.status !== "corrections").reduce((s, a) => s + a.n, 0);
  const label = new Map(cohorts.map((r) => [r.c.id, `${r.course.shortName} ${cohortLabel(r.c)}`]));
  const overview = {
    cohorts: cohorts.map((r) => ({ label: label.get(r.c.id)!, enrolled: enr.filter((e) => e.cohortId === r.c.id).length, active: enr.filter((e) => e.cohortId === r.c.id && e.status === "active").length })),
    people: enr.length,
    newThisWeek: enr.filter((e) => inWeek(e.enrolledDate)).length,
    completed: enr.filter((e) => e.status === "completed" && inWeek(e.leftDate)).length,
    left: enr.filter((e) => (e.status === "dropped" || e.status === "withdrawn") && inWeek(e.leftDate)).length,
    attendancePct: counted ? Math.round((present / counted) * 1000) / 10 : null,
  };

  // 2) กิจกรรมที่ทำตามตาราง + ที่ไม่ได้ทำพร้อมเหตุผล
  const reports = new Map(sIds.length ? db.select().from(schema.sessionReports).where(and(inArray(schema.sessionReports.sessionId, sIds), isNull(schema.sessionReports.deletedAt))).all().map((r) => [r.sessionId, r]) : []);
  const staff = activeStaff(db, sIds);
  const activities = sessions.map((s) => {
    const r = reports.get(s.id);
    return {
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
  const issues = sessions.map((s) => ({ s, r: reports.get(s.id) })).filter((x) => x.r?.issues).map((x) => `• ${formatThaiDate(x.s.date)} ${x.s.title} (${label.get(x.s.cohortId)}): ${x.r!.issues}`);
  const nextMon = addDays(monday, 7);
  const next = db.select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses }).from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(gte(schema.cohortSessions.date, nextMon), lte(schema.cohortSessions.date, addDays(nextMon, 6)), ne(schema.cohortSessions.status, "cancelled"), isNull(schema.cohortSessions.deletedAt))).all();
  const planByCohort = new Map<string, string[]>();
  for (const r of next) {
    const k = `${r.course.shortName} ${cohortLabel(r.c)}`;
    planByCohort.set(k, [...(planByCohort.get(k) ?? []), r.s.title]);
  }
  const plan = [...planByCohort].map(([k, titles]) => `• ${k}: ${titles.length} คาบ — ${Array.from(new Set(titles)).slice(0, 6).join(", ")}${new Set(titles).size > 6 ? " ฯลฯ" : ""}`);
  const newCohorts = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(gte(schema.cohorts.startDate, nextMon), lte(schema.cohorts.startDate, addDays(nextMon, 6)), isNull(schema.cohorts.deletedAt))).all();
  for (const r of newCohorts) plan.unshift(`• เปิด ${r.course.shortName} ${cohortLabel(r.c)} วันที่ ${formatThaiDate(r.c.startDate)}`);

  return {
    monday, sunday, overview, activities,
    assessments: results, behavior: behavior.map((b) => ({ tone: b.tone, count: b.n })),
    bst: { done: bstDone.map((x) => ({ system: x.system, count: x.n })), overdue: bstOverdue.map((x) => ({ system: x.system, count: x.n })) },
    money, issuesPrefill: issues.join("\n"), planPrefill: plan.join("\n"),
  };
}

export function getWeekly(db: DB, monday: string) {
  return db.select().from(schema.weeklyReports).where(and(eq(schema.weeklyReports.weekStart, monday), isNull(schema.weeklyReports.deletedAt))).get() ?? null;
}

/** สร้าง/อัปเดตร่าง (ข้อความที่ผู้ดูแลแก้แล้วไม่ถูกทับ) — รายงานที่อนุมัติแล้วไม่เปลี่ยน */
export function upsertDraft(db: DB, monday: string, actorId: number | null = null) {
  const data = collectWeekly(db, monday);
  const prev = getWeekly(db, monday);
  if (prev?.status === "approved") return prev;
  if (prev) {
    db.update(schema.weeklyReports).set({ data, updatedBy: actorId, updatedAt: new Date() }).where(eq(schema.weeklyReports.id, prev.id)).run();
    return { ...prev, data };
  }
  return db.insert(schema.weeklyReports).values({ weekStart: monday, data, issues: data.issuesPrefill || null, nextPlan: data.planPrefill || null, createdBy: actorId, updatedBy: actorId }).returning().get();
}

export function saveWeeklyTexts(db: DB, id: number, t: { issues?: string | null; nextPlan?: string | null; note?: string | null }, actor: { userId: number; ip?: string | null }) {
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, id)).get();
  if (!r || r.deletedAt) throw new RuleError("ไม่พบรายงาน");
  if (r.status === "approved") throw new RuleError("รายงานนี้อนุมัติแล้ว — ยกเลิกการอนุมัติก่อนจึงแก้ได้");
  const next = { issues: t.issues?.slice(0, 5000) ?? null, nextPlan: t.nextPlan?.slice(0, 5000) ?? null, note: t.note?.slice(0, 2000) ?? null };
  db.update(schema.weeklyReports).set({ ...next, updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.weeklyReports.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "weekly_report", entityId: id, ip: actor.ip });
}

/** อนุมัติ: เก็บตัวเลข ณ ขณะนี้เป็นฉบับคงที่ */
export function approveWeekly(db: DB, id: number, actor: { userId: number; ip?: string | null }) {
  const r = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, id)).get();
  if (!r || r.deletedAt) throw new RuleError("ไม่พบรายงาน");
  if (r.status === "approved") throw new RuleError("รายงานนี้อนุมัติแล้ว");
  const data = collectWeekly(db, r.weekStart);
  db.update(schema.weeklyReports).set({ data, status: "approved", approvedBy: actor.userId, approvedAt: new Date(), updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.weeklyReports.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "approve", entity: "weekly_report", entityId: id, ip: actor.ip });
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
