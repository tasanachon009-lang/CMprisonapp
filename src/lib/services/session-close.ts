import { and, asc, desc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { addDays, nowInTZ, todayISO, isValidISODate } from "../thai-date";
import { cohortLabel } from "./cohorts";
import { activeStaff, getSession } from "./schedule";

/**
 * บันทึกการสอนจริงและผลกิจกรรม (สเปก 11.5) · หน้า "คาบของฉัน" ปุ่ม "บันทึกและปิดคาบ" (สเปก 22B)
 * บันทึกแทนวิทยากรภายนอก (ผู้สอน ≠ ผู้บันทึก) · คาบชดเชย (สเปก 9) · สถานะเชิญวิทยากรภายนอก (สเปก 11.5A)
 */
export const OUTCOME_LABEL: Record<string, string> = { planned: "ตามแผน", partial: "บางส่วน", not_done: "ไม่ได้ทำ" };
export const PARTICIPATION_LABEL: Record<string, string> = { excellent: "ดีมาก", good: "ดี", fair: "พอใช้", needs_improvement: "ควรปรับปรุง" };
export const INVITE_LABEL: Record<string, string> = { none: "ยังไม่เชิญ", sent: "ส่งหนังสือแล้ว", accepted: "ตอบรับ", declined: "ปฏิเสธ", confirmed: "ยืนยันวันสอน" };

export type ReportInput = {
  outcome: "planned" | "partial" | "not_done"; reason?: string | null; participation?: string | null; summary?: string | null; issues?: string | null;
  /** สอนจริงรายคน: ไม่ส่ง = สอนตามตาราง */
  staff?: Array<{ staffId: number; didTeach: boolean; actualHours?: number | null }>;
};

/** คาบนี้จบแล้วหรือยัง (บันทึกผลได้ตั้งแต่เวลาเริ่มของวันสอน) */
export function sessionStarted(s: { date: string; startTime: string }, now = new Date()) {
  const t = nowInTZ(now);
  const hm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  return s.date < t.date || (s.date === t.date && hm >= s.startTime);
}

export function reportOf(db: DB, sessionId: number) {
  return db.select().from(schema.sessionReports).where(and(eq(schema.sessionReports.sessionId, sessionId), isNull(schema.sessionReports.deletedAt))).get() ?? null;
}

export function saveSessionReport(db: DB, sessionId: number, input: ReportInput, actor: { userId: number; isAdmin: boolean; ip?: string | null }) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const s = getSession(t, sessionId);
    const cohort = tx.select().from(schema.cohorts).where(eq(schema.cohorts.id, s.cohortId)).get()!;
    if (cohort.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว แก้ไม่ได้");
    if (s.status === "cancelled") throw new RuleError("คาบนี้ถูกยกเลิก — ไม่ต้องบันทึกผล");
    if (s.lockedAt && !actor.isAdmin) throw new RuleError("คาบนี้ล็อกแล้ว (อนุมัติค่าตอบแทนแล้ว) — ติดต่อหัวหน้า/รองเพื่อปลดล็อก");
    if (!sessionStarted(s)) throw new RuleError("ยังไม่ถึงเวลาเริ่มคาบ — บันทึกผลได้ตั้งแต่เวลาเริ่มของวันสอน");
    if (s.takesAttendance && !s.attendanceCheckedAt && input.outcome !== "not_done") throw new RuleError("กรุณาเช็คชื่อให้เสร็จก่อนปิดคาบ (ถ้าไม่ได้ทำกิจกรรม เลือก \"ไม่ได้ทำ\" พร้อมเหตุผล)");
    if (!["planned", "partial", "not_done"].includes(input.outcome)) throw new RuleError("กรุณาเลือกผลการทำกิจกรรม");
    const reason = input.reason?.trim() || null;
    if (input.outcome !== "planned" && !reason) throw new RuleError(input.outcome === "not_done" ? "ไม่ได้ทำกิจกรรม — กรุณาระบุเหตุผล" : "ทำได้บางส่วน — กรุณาระบุเหตุผล");
    if (input.participation && !PARTICIPATION_LABEL[input.participation]) throw new RuleError("ระดับการมีส่วนร่วมไม่ถูกต้อง");
    const summary = input.summary?.trim().slice(0, 500) || null;
    const issues = input.issues?.trim().slice(0, 1000) || null;

    const staff = activeStaff(t, [sessionId]);
    for (const x of input.staff ?? []) {
      const st = staff.find((y) => y.id === x.staffId);
      if (!st) throw new RuleError("รายชื่อวิทยากรเปลี่ยนไปแล้ว — กรุณาโหลดหน้าใหม่");
      const hours = x.didTeach ? (x.actualHours == null || x.actualHours === s.hours ? null : x.actualHours) : null;
      if (hours != null && !(hours > 0 && hours <= s.hours)) throw new RuleError(`ชั่วโมงสอนจริงต้องมากกว่า 0 และไม่เกิน ${s.hours} ชม.`);
      tx.update(schema.sessionStaff).set({ didTeach: x.didTeach, actualHours: hours, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.sessionStaff.id, st.id)).run();
    }
    if (input.outcome === "not_done") {
      // ไม่ได้ทำกิจกรรม = ไม่มีใครสอนจริง (ไม่คิดค่าตอบแทน)
      tx.update(schema.sessionStaff).set({ didTeach: false, actualHours: null, updatedBy: actor.userId }).where(and(eq(schema.sessionStaff.sessionId, sessionId), isNull(schema.sessionStaff.deletedAt))).run();
    }
    const participants = tx.select({ n: sql<number>`count(*)` }).from(schema.attendance).where(and(eq(schema.attendance.sessionId, sessionId), eq(schema.attendance.status, "present"))).get()?.n ?? 0;
    // บันทึกแทน: ผู้บันทึกไม่ได้อยู่ในรายชื่อผู้สอน (เช่น บันทึกแทนวิทยากรภายนอก)
    const proxyEntry = !staff.some((x) => x.userId === actor.userId);
    const values = { outcome: input.outcome, reason, participation: input.participation || null, summary, issues, participants, proxyEntry };
    const prev = reportOf(t, sessionId);
    if (prev) {
      tx.update(schema.sessionReports).set({ ...values, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.sessionReports.id, prev.id)).run();
    } else {
      tx.insert(schema.sessionReports).values({ sessionId, ...values, createdBy: actor.userId, updatedBy: actor.userId }).run();
    }
    tx.update(schema.cohortSessions).set({ taughtAt: new Date(), taughtBy: actor.userId, status: input.outcome === "not_done" ? "scheduled" : "done", updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.cohortSessions.id, sessionId)).run();
    writeAudit(tx, {
      userId: actor.userId, action: prev ? "update" : "create", entity: "session_report", entityId: sessionId,
      before: prev ? { outcome: prev.outcome, participation: prev.participation } : null, after: { ...values, staff: input.staff ?? null },
      note: proxyEntry ? "บันทึกแทนผู้สอน" : null, ip: actor.ip,
    });
    return { participants, proxyEntry };
  });
}

/** คาบที่จบแล้วแต่ยังไม่บันทึกผล (14 วันล่าสุด) — ของฉัน (เป็นผู้สอน) + ถ้าเป็นเจ้าหน้าที่หลัก: คาบที่มีแต่วิทยากรภายนอก/ยังไม่มีผู้รับผิดชอบ */
export function pendingReports(db: DB, userId: number, opts: { includeProxy: boolean; today?: string }) {
  const today = opts.today ?? todayISO();
  const rows = db
    .select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses })
    .from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(isNull(schema.cohortSessions.taughtAt), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled"), lte(schema.cohortSessions.date, today), gte(schema.cohortSessions.date, addDays(today, -14)), ne(schema.cohorts.status, "closed")))
    .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime))
    .all()
    .filter((x) => sessionStarted(x.s));
  if (!rows.length) return [];
  const staff = activeStaff(db, rows.map((r) => r.s.id));
  return rows
    .filter(({ s }) => {
      const mine = staff.filter((x) => x.sessionId === s.id);
      if (mine.some((x) => x.userId === userId)) return true;
      return opts.includeProxy && mine.every((x) => !x.userId);
    })
    .map(({ s, c, course }) => ({ ...s, cohortLabel: `${course.shortName} ${cohortLabel(c)}`, overdue: s.date < today, proxy: !staff.some((x) => x.sessionId === s.id && x.userId === userId) }));
}

// ───────── คาบชดเชย (สเปก 9) ─────────

/** คาบที่มีผู้ติดเหตุราชทัณฑ์ และยังไม่มีคาบชดเชย → ป้าย "ควรจัดสอนชดเชย" */
export function makeupNeeded(db: DB, cohortId: number) {
  const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt))).all();
  const ids = sessions.map((s) => s.id);
  if (!ids.length) return new Map<number, { count: number; makeupId: number | null }>();
  const corr = db.select({ sessionId: schema.attendance.sessionId, n: sql<number>`count(*)` }).from(schema.attendance).where(and(inArray(schema.attendance.sessionId, ids), eq(schema.attendance.status, "corrections"))).groupBy(schema.attendance.sessionId).all();
  const out = new Map<number, { count: number; makeupId: number | null }>();
  for (const r of corr) {
    const mk = sessions.find((s) => s.makeupOfId === r.sessionId && s.status !== "cancelled");
    out.set(r.sessionId, { count: r.n, makeupId: mk?.id ?? null });
  }
  return out;
}

/** สร้างคาบชดเชยผูกกับคาบเดิม — ผู้เข้าร่วม = คนที่ติดเหตุราชทัณฑ์ในคาบเดิม · วิทยากรเดิม */
export function createMakeupSession(db: DB, originalId: number, input: { date: string; startTime: string; endTime: string; hours: number; location?: string | null }, actor: { userId: number; ip?: string | null }) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const o = getSession(t, originalId);
    const cohort = tx.select().from(schema.cohorts).where(eq(schema.cohorts.id, o.cohortId)).get()!;
    if (cohort.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว");
    if (o.makeupOfId) throw new RuleError("คาบนี้เป็นคาบชดเชยอยู่แล้ว — สร้างชดเชยจากคาบเดิม");
    if (!isValidISODate(input.date) || input.date < o.date) throw new RuleError("วันชดเชยต้องไม่ก่อนวันของคาบเดิม");
    if (!/^\d{2}:\d{2}$/.test(input.startTime) || !/^\d{2}:\d{2}$/.test(input.endTime) || input.startTime >= input.endTime) throw new RuleError("เวลาไม่ถูกต้อง — เวลาเริ่มต้องก่อนเวลาสิ้นสุด");
    if (!(input.hours > 0 && input.hours <= o.hours)) throw new RuleError(`ชั่วโมงชดเชยต้องมากกว่า 0 และไม่เกิน ${o.hours} ชม. ของคาบเดิม`);
    const need = tx.select({ n: sql<number>`count(*)` }).from(schema.attendance).where(and(eq(schema.attendance.sessionId, originalId), eq(schema.attendance.status, "corrections"))).get()?.n ?? 0;
    if (!need) throw new RuleError("คาบนี้ไม่มีผู้ติดเหตุราชทัณฑ์ — ไม่ต้องจัดสอนชดเชย");
    const row = tx.insert(schema.cohortSessions).values({
      cohortId: o.cohortId, date: input.date, startTime: input.startTime, endTime: input.endTime, hours: input.hours, title: `ชดเชย: ${o.title}`, category: o.category,
      topicId: o.topicId, location: input.location?.trim() || o.location, takesAttendance: true, makeupOfId: o.id, createdBy: actor.userId, updatedBy: actor.userId,
    }).returning().get();
    for (const st of activeStaff(t, [o.id])) {
      tx.insert(schema.sessionStaff).values({ sessionId: row.id, userId: st.userId, instructorId: st.instructorId, externalName: st.externalName, role: st.role, createdBy: actor.userId, updatedBy: actor.userId }).onConflictDoNothing().run();
    }
    writeAudit(tx, { userId: actor.userId, action: "create", entity: "cohort_session", entityId: row.id, after: { makeupOf: o.id, date: input.date, people: need }, note: "คาบชดเชย", ip: actor.ip });
    return row;
  });
}

// ───────── สถานะการเชิญวิทยากรภายนอก (สเปก 11.5A) ─────────

export function setInviteStatus(db: DB, staffId: number, status: string, actor: { userId: number; ip?: string | null }) {
  if (!INVITE_LABEL[status]) throw new RuleError("สถานะการเชิญไม่ถูกต้อง");
  const st = db.select().from(schema.sessionStaff).where(and(eq(schema.sessionStaff.id, staffId), isNull(schema.sessionStaff.deletedAt))).get();
  if (!st) throw new RuleError("ไม่พบรายชื่อนี้ในคาบ");
  if (st.userId) throw new RuleError("สถานะการเชิญใช้กับวิทยากรภายนอกเท่านั้น");
  db.update(schema.sessionStaff).set({ inviteStatus: status, inviteUpdatedAt: new Date(), updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.sessionStaff.id, staffId)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "session_staff", entityId: staffId, before: { inviteStatus: st.inviteStatus }, after: { inviteStatus: status }, ip: actor.ip });
}

/** วิทยากรภายนอกที่อีก ≤ 14 วันจะถึงคาบ แต่ยังไม่ตอบรับ/ยืนยัน */
export function invitesDue(db: DB, today = todayISO()) {
  return db
    .select({ st: schema.sessionStaff, s: schema.cohortSessions, c: schema.cohorts, course: schema.courses, f: schema.instructors.firstName, l: schema.instructors.lastName })
    .from(schema.sessionStaff)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.sessionStaff.sessionId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .leftJoin(schema.instructors, eq(schema.instructors.id, schema.sessionStaff.instructorId))
    .where(and(isNull(schema.sessionStaff.userId), isNull(schema.sessionStaff.deletedAt), isNull(schema.cohortSessions.deletedAt), ne(schema.cohortSessions.status, "cancelled"), gte(schema.cohortSessions.date, today), lte(schema.cohortSessions.date, addDays(today, 14))))
    .orderBy(asc(schema.cohortSessions.date), desc(schema.cohortSessions.startTime))
    .all()
    .filter((x) => !["accepted", "confirmed"].includes(x.st.inviteStatus ?? "none"))
    .map((x) => ({ staffId: x.st.id, name: x.f ? `${x.f} ${x.l ?? ""}`.trim() : x.st.externalName ?? "-", status: x.st.inviteStatus ?? "none", session: x.s, cohortLabel: `${x.course.shortName} ${cohortLabel(x.c)}` }));
}

/** ข้อความแจ้งกำหนดสอนสำหรับคัดลอกส่งวิทยากรภายนอก — ไม่มีข้อมูลผู้ต้องขัง */
export function invitationText(p: { name: string; title: string; date: string; startTime: string; endTime: string; location: string | null; cohortLabel: string; org: string }, formatDate: (d: string) => string) {
  return [
    `เรียน ${p.name}`,
    `${p.org} ขอแจ้งกำหนดการสอน`,
    `หัวข้อ: ${p.title}`,
    `วันที่: ${formatDate(p.date)} เวลา ${p.startTime}–${p.endTime} น.`,
    `หลักสูตร: ${p.cohortLabel}`,
    p.location ? `สถานที่: ${p.location}` : null,
    "ขอบพระคุณครับ/ค่ะ",
  ].filter(Boolean).join("\n");
}
