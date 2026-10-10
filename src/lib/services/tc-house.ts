import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { addDays, isValidISODate, todayISO } from "../thai-date";
import { weekStartOf } from "./cohorts";

/**
 * โครงสร้างบ้านของชุมชนบำบัด (สเปก 16): ตำแหน่ง ทีมงาน ที่ปรึกษา พี่เลี้ยง + ประวัติเลื่อน/ลดตำแหน่ง · ผังบ้าน · หมุนทีม · ประเมินทีมรายสัปดาห์
 * ผู้เรียกตรวจสิทธิ์ tc.view / tc.edit ก่อน
 */
type Actor = { userId: number; ip?: string | null };
export type AssignKind = "position" | "team" | "counselor" | "mentor";
export const ASSIGN_KIND_LABEL: Record<AssignKind, string> = { position: "ตำแหน่ง", team: "ทีมงาน", counselor: "ที่ปรึกษา", mentor: "พี่เลี้ยง (อส.รจ.)" };
export const CHANGE_LABEL: Record<string, string> = { promote: "เลื่อนตำแหน่ง", demote: "ลดตำแหน่ง", assign: "กำหนด", rotate: "หมุนทีม" };
/** สมาชิกที่ยังไม่ได้กำหนดตำแหน่ง ถือเป็นตำแหน่งนี้ */
export const DEFAULT_POSITION = "newcomer";
/** ทีมงานควรหมุนทุก 1–2 เดือน — เตือนเมื่ออยู่ทีมเดิมเกินกี่วัน (สเปก 16: "เตือนเกิน 2 เดือน") */
export const TEAM_ROTATE_DAYS = 61;
export const RATING_LABEL: Record<string, string> = { excellent: "ดีมาก", good: "ดี", fair: "พอใช้", needs_improvement: "ควรปรับปรุง" };

export function tcLookups(db: DB, category: "tc_position" | "tc_team") {
  return db.select().from(schema.lookups).where(eq(schema.lookups.category, category)).orderBy(asc(schema.lookups.sortOrder), asc(schema.lookups.id)).all()
    .map((l, i) => ({ code: l.code, label: l.label, active: l.active, rank: i }));
}

function fastMembers(db: DB, cohortId: number) {
  return db.select({ e: schema.enrollments, inc: schema.incarcerations, p: schema.persons }).from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), eq(schema.enrollments.status, "active"), isNull(schema.enrollments.deletedAt)))
    .orderBy(asc(schema.persons.firstName), asc(schema.persons.lastName)).all();
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

export type MemberHouse = {
  enrollmentId: number; incarcerationId: number; name: string; inmateNo: string; zone: string | null; thumbPath: string | null;
  position: string; positionSince: string | null; team: string | null; teamSince: string | null; teamDays: number | null;
  counselorId: number | null; mentor: string | null;
};

/** ตำแหน่ง/ทีม/ที่ปรึกษา/พี่เลี้ยง ปัจจุบันของสมาชิกที่กำลังอบรม (ผู้ที่ออกจากเรือนจำ/ออกก่อนกำหนดไม่อยู่ในผัง — สเปก 8) */
export function houseMembers(db: DB, cohortId: number, today = todayISO()): MemberHouse[] {
  const members = fastMembers(db, cohortId);
  if (!members.length) return [];
  const cur = db.select().from(schema.tcAssignments).where(and(inArray(schema.tcAssignments.enrollmentId, members.map((m) => m.e.id)), isNull(schema.tcAssignments.endDate), isNull(schema.tcAssignments.deletedAt))).all();
  const of = (id: number, kind: AssignKind) => cur.find((c) => c.enrollmentId === id && c.kind === kind) ?? null;
  return members.map((m) => {
    const pos = of(m.e.id, "position"), team = of(m.e.id, "team"), co = of(m.e.id, "counselor"), me = of(m.e.id, "mentor");
    return {
      enrollmentId: m.e.id, incarcerationId: m.inc.id, name: `${m.p.prefix ?? ""}${m.p.firstName} ${m.p.lastName}`, inmateNo: m.inc.inmateNo, zone: m.inc.zone, thumbPath: m.inc.thumbPath,
      position: pos?.value ?? DEFAULT_POSITION, positionSince: pos?.startDate ?? m.e.enrolledDate,
      team: team?.value ?? null, teamSince: team?.startDate ?? null, teamDays: team ? daysBetween(team.startDate, today) : null,
      counselorId: co ? Number(co.value) : null, mentor: me?.value ?? null,
    };
  });
}

/** ผังบ้าน: จัดกลุ่มตามตำแหน่ง (สูง → ต่ำ) + คำเตือนอัตราส่วนและการหมุนทีม */
export function houseChart(db: DB, cohortId: number, today = todayISO()) {
  const members = houseMembers(db, cohortId, today);
  const positions = tcLookups(db, "tc_position"), teams = tcLookups(db, "tc_team");
  const known = new Set(positions.map((p) => p.code));
  const tiers = positions.filter((p) => p.active || members.some((m) => m.position === p.code)).map((p) => ({ ...p, members: members.filter((m) => m.position === p.code || (p.code === DEFAULT_POSITION && !known.has(m.position))) }));
  const course = db.select({ crit: schema.courses.intakeCriteria }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  const crit = (course?.crit ?? {}) as { membersPerStaff?: number; membersPerMentor?: number };
  const perStaff = crit.membersPerStaff ?? 15, perMentor = crit.membersPerMentor ?? 10;
  const counselors = new Map<number, number>(), mentors = new Map<string, number>();
  for (const m of members) {
    if (m.counselorId) counselors.set(m.counselorId, (counselors.get(m.counselorId) ?? 0) + 1);
    if (m.mentor) mentors.set(m.mentor, (mentors.get(m.mentor) ?? 0) + 1);
  }
  const warnings: string[] = [];
  const noCounselor = members.filter((m) => !m.counselorId).length, noMentor = members.filter((m) => !m.mentor).length, noTeam = members.filter((m) => !m.team).length;
  if (noCounselor) warnings.push(`ยังไม่ได้กำหนดที่ปรึกษา ${noCounselor} คน`);
  if (noMentor) warnings.push(`ยังไม่ได้กำหนดพี่เลี้ยง ${noMentor} คน`);
  if (noTeam) warnings.push(`ยังไม่ได้กำหนดทีมงาน ${noTeam} คน`);
  const overStaff = Array.from(counselors.entries()).filter(([, n]) => n > perStaff);
  if (overStaff.length) warnings.push(`ที่ปรึกษาดูแลสมาชิกเกิน 1:${perStaff} จำนวน ${overStaff.length} คน`);
  if (members.length && counselors.size && members.length / counselors.size > perStaff) warnings.push(`อัตราส่วนเจ้าหน้าที่ต่อสมาชิก 1:${Math.ceil(members.length / counselors.size)} เกินเกณฑ์ 1:${perStaff}`);
  const overMentor = Array.from(mentors.entries()).filter(([, n]) => n > perMentor);
  if (overMentor.length) warnings.push(`พี่เลี้ยงดูแลสมาชิกเกิน 1:${perMentor} จำนวน ${overMentor.length} คน`);
  const overdue = members.filter((m) => m.teamDays != null && m.teamDays > TEAM_ROTATE_DAYS);
  if (overdue.length) warnings.push(`อยู่ทีมงานเดิมเกิน 2 เดือน ${overdue.length} คน ควรหมุนทีม`);
  return {
    members, tiers, warnings,
    teams: teams.filter((t) => t.active || members.some((m) => m.team === t.code)).map((t) => ({ ...t, members: members.filter((m) => m.team === t.code) })),
    noTeam: members.filter((m) => !m.team),
    counselors: Array.from(counselors, ([userId, n]) => ({ userId, n })),
    mentors: Array.from(mentors, ([name, n]) => ({ name, n })),
    ratio: { perStaff, perMentor },
  };
}

/** สรุปไม่ระบุชื่อ (ผู้บริหาร): จำนวนต่อตำแหน่ง/ทีม + คำเตือน */
export function houseSummary(db: DB, cohortId: number, today = todayISO()) {
  const c = houseChart(db, cohortId, today);
  return { total: c.members.length, positions: c.tiers.map((t) => ({ label: t.label, n: t.members.length })), teams: c.teams.map((t) => ({ label: t.label, n: t.members.length })), warnings: c.warnings };
}

/**
 * กำหนด/เปลี่ยน ตำแหน่ง ทีม ที่ปรึกษา หรือพี่เลี้ยง (หลายคนพร้อมกัน)
 * - ปิดช่วงเดิม (วันสิ้นสุด = วันก่อนวันเริ่มใหม่) แล้วเปิดช่วงใหม่ → ได้ประวัติครบ
 * - เปลี่ยนตำแหน่งต้องระบุเหตุผล · ระบบตัดสินเลื่อน/ลดจากลำดับตำแหน่ง
 */
export function assign(db: DB, input: { enrollmentIds: number[]; kind: AssignKind; value: string; date: string; reason?: string | null }, actor: Actor) {
  const kind = input.kind;
  if (!(kind in ASSIGN_KIND_LABEL)) throw new RuleError("ประเภทรายการไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  if (!isValidISODate(input.date)) throw new RuleError("กรุณาเลือกวันที่เริ่ม");
  if (input.date > todayISO()) throw new RuleError("วันที่เริ่มต้องไม่เป็นวันในอนาคต");
  if (!input.enrollmentIds.length) throw new RuleError("กรุณาเลือกสมาชิกอย่างน้อย 1 คน");
  const reason = (input.reason ?? "").trim().slice(0, 500);
  let value = String(input.value ?? "").trim();
  const positions = tcLookups(db, "tc_position");
  if (kind === "position") {
    if (!positions.some((p) => p.code === value && p.active)) throw new RuleError("ไม่พบตำแหน่งนี้ กรุณาโหลดหน้าใหม่");
    if (reason.length < 3) throw new RuleError("กรุณาระบุเหตุผลการเปลี่ยนตำแหน่ง");
  } else if (kind === "team") {
    if (!tcLookups(db, "tc_team").some((t) => t.code === value && t.active)) throw new RuleError("ไม่พบทีมงานนี้ กรุณาโหลดหน้าใหม่");
  } else if (kind === "counselor") {
    const u = db.select().from(schema.users).where(eq(schema.users.id, Number(value))).get();
    const isStaff = u ? db.select().from(schema.userRoles).where(and(eq(schema.userRoles.userId, u.id), inArray(schema.userRoles.role, ["rehab", "admin"]))).get() : null;
    if (!u || u.status !== "active" || u.deletedAt || !isStaff) throw new RuleError("ที่ปรึกษาต้องเป็นเจ้าหน้าที่หลักที่ยังใช้งานอยู่");
    value = String(u.id);
  } else {
    if (value.length < 2 || value.length > 100) throw new RuleError("กรุณาพิมพ์ชื่อพี่เลี้ยง");
  }
  const rank = (code: string) => positions.find((p) => p.code === code)?.rank ?? positions.length;

  return db.transaction((tx) => {
    const done: number[] = [], errors: Array<{ enrollmentId: number; error: string }> = [];
    for (const id of Array.from(new Set(input.enrollmentIds))) {
      const row = tx.select({ e: schema.enrollments, code: schema.courses.code, cohortStart: schema.cohorts.startDate }).from(schema.enrollments)
        .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId)).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
        .where(and(eq(schema.enrollments.id, id), isNull(schema.enrollments.deletedAt))).get();
      if (!row || row.code !== "FAST") { errors.push({ enrollmentId: id, error: "ไม่ใช่สมาชิกชุมชนบำบัด" }); continue; }
      if (row.e.status !== "active") { errors.push({ enrollmentId: id, error: "สมาชิกไม่ได้อยู่ในสถานะกำลังอบรม" }); continue; }
      if (input.date < row.e.enrolledDate) { errors.push({ enrollmentId: id, error: "วันที่เริ่มอยู่ก่อนวันเข้าโปรแกรม" }); continue; }
      const prev = tx.select().from(schema.tcAssignments).where(and(eq(schema.tcAssignments.enrollmentId, id), eq(schema.tcAssignments.kind, kind), isNull(schema.tcAssignments.endDate), isNull(schema.tcAssignments.deletedAt))).get();
      const prevValue = prev?.value ?? (kind === "position" ? DEFAULT_POSITION : null);
      if (prevValue === value) { errors.push({ enrollmentId: id, error: `${ASSIGN_KIND_LABEL[kind]}เดิมอยู่แล้ว` }); continue; }
      if (prev && input.date <= prev.startDate) { errors.push({ enrollmentId: id, error: "วันที่เริ่มต้องหลังวันเริ่มของรายการปัจจุบัน" }); continue; }
      const changeType = kind === "position" ? (rank(value) < rank(prevValue!) ? "promote" : "demote") : kind === "team" ? (prev ? "rotate" : "assign") : "assign";
      if (prev) tx.update(schema.tcAssignments).set({ endDate: addDays(input.date, -1), updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.tcAssignments.id, prev.id)).run();
      const rec = tx.insert(schema.tcAssignments).values({ enrollmentId: id, kind, value, startDate: input.date, changeType, reason: reason || null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
      writeAudit(tx, { userId: actor.userId, action: "create", entity: "tc_assignment", entityId: rec.id, before: { [kind]: prevValue }, after: { [kind]: value, date: input.date, changeType }, note: reason || null, ip: actor.ip ?? null });
      done.push(id);
    }
    return { done, errors };
  });
}

/** ประวัติตำแหน่ง/ทีม/ที่ปรึกษา/พี่เลี้ยง ของสมาชิก (ใหม่สุดก่อน) */
export function assignmentHistory(db: DB, enrollmentId: number) {
  return db.select().from(schema.tcAssignments).where(and(eq(schema.tcAssignments.enrollmentId, enrollmentId), isNull(schema.tcAssignments.deletedAt))).orderBy(desc(schema.tcAssignments.startDate), desc(schema.tcAssignments.id)).all();
}

/** การเปลี่ยนตำแหน่ง/ทีมในช่วงวันที่ (ใช้ในข้อมูลช่วยเขียนสมุดส่วนที่ 3) */
export function assignmentChanges(db: DB, enrollmentId: number, from: string, to: string) {
  return assignmentHistory(db, enrollmentId).filter((a) => (a.kind === "position" || a.kind === "team") && a.startDate >= from && a.startDate <= to).reverse();
}

// ───────── ประเมินทีมรายสัปดาห์ ─────────

export function saveTeamReview(db: DB, cohortId: number, input: { team: string; weekStart: string; rating: string; note?: string | null }, actor: Actor) {
  const row = db.select({ code: schema.courses.code, c: schema.cohorts }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, cohortId)).get();
  if (!row || row.code !== "FAST") throw new RuleError("รุ่นนี้ไม่ใช่หลักสูตรชุมชนบำบัด");
  if (!tcLookups(db, "tc_team").some((t) => t.code === input.team)) throw new RuleError("ไม่พบทีมงานนี้ กรุณาโหลดหน้าใหม่");
  if (!(input.rating in RATING_LABEL)) throw new RuleError("กรุณาเลือกผลการประเมิน");
  if (!isValidISODate(input.weekStart)) throw new RuleError("กรุณาเลือกสัปดาห์ที่ประเมิน");
  const week = weekStartOf(input.weekStart);
  if (week > todayISO()) throw new RuleError("สัปดาห์ที่ประเมินต้องไม่เป็นสัปดาห์ในอนาคต");
  if (week < weekStartOf(row.c.startDate) || week > row.c.endDate) throw new RuleError("สัปดาห์ที่ประเมินอยู่นอกช่วงของรุ่น");
  const note = (input.note ?? "").trim().slice(0, 1000) || null;
  const prev = db.select().from(schema.tcTeamReviews).where(and(eq(schema.tcTeamReviews.cohortId, cohortId), eq(schema.tcTeamReviews.team, input.team), eq(schema.tcTeamReviews.weekStart, week), isNull(schema.tcTeamReviews.deletedAt))).get();
  if (prev) db.update(schema.tcTeamReviews).set({ rating: input.rating, note, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.tcTeamReviews.id, prev.id)).run();
  else db.insert(schema.tcTeamReviews).values({ cohortId, team: input.team, weekStart: week, rating: input.rating, note, createdBy: actor.userId, updatedBy: actor.userId }).run();
  writeAudit(db, { userId: actor.userId, action: prev ? "update" : "create", entity: "tc_team_review", entityId: `${cohortId}:${input.team}:${week}`, after: { rating: input.rating }, ip: actor.ip ?? null });
  return week;
}

export function teamReviews(db: DB, cohortId: number, limit = 40) {
  return db.select().from(schema.tcTeamReviews).where(and(eq(schema.tcTeamReviews.cohortId, cohortId), isNull(schema.tcTeamReviews.deletedAt))).orderBy(desc(schema.tcTeamReviews.weekStart), asc(schema.tcTeamReviews.team)).limit(limit).all();
}

/** ทีมที่ยังไม่ได้ประเมินของสัปดาห์ที่แล้ว (เตือนในหน้าทีมงาน) */
export function teamsWithoutReview(db: DB, cohortId: number, today = todayISO()) {
  const lastWeek = addDays(weekStartOf(today), -7);
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort || lastWeek < weekStartOf(cohort.startDate) || lastWeek > cohort.endDate) return { weekStart: lastWeek, teams: [] as string[] };
  const chart = houseChart(db, cohortId, today);
  const have = new Set(teamReviews(db, cohortId, 200).filter((r) => r.weekStart === lastWeek).map((r) => r.team));
  return { weekStart: lastWeek, teams: chart.teams.filter((t) => t.members.length > 0 && !have.has(t.code)).map((t) => t.code) };
}
