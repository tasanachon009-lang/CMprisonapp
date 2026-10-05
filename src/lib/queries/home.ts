import { and, asc, eq, inArray, isNull, lte, gte, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { cohortLabel } from "../services/cohorts";

export type SessionCard = {
  id: number;
  cohortId: number;
  cohortLabel: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  location: string | null;
  checked: boolean;
  takesAttendance: boolean;
  /** วิทยากร/ผู้รับผิดชอบทุกคนในคาบ (สเปก 11.4) */
  staff: string[];
};

function sessionsQuery(db: DB) {
  return db
    .select({
      id: schema.cohortSessions.id,
      cohortId: schema.cohortSessions.cohortId,
      number: schema.cohorts.number,
      fiscalYear: schema.cohorts.fiscalYear,
      courseName: schema.courses.shortName,
      date: schema.cohortSessions.date,
      startTime: schema.cohortSessions.startTime,
      endTime: schema.cohortSessions.endTime,
      title: schema.cohortSessions.title,
      location: schema.cohortSessions.location,
      checkedAt: schema.cohortSessions.attendanceCheckedAt,
      takesAttendance: schema.cohortSessions.takesAttendance,
    })
    .from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId));
}

const toCard = (r: Awaited<ReturnType<ReturnType<typeof sessionsQuery>["all"]>>[number]): SessionCard => ({
  id: r.id, cohortId: r.cohortId, cohortLabel: cohortLabel(r), courseName: r.courseName, date: r.date,
  startTime: r.startTime, endTime: r.endTime, title: r.title, location: r.location, checked: !!r.checkedAt, takesAttendance: r.takesAttendance, staff: [],
});

/** รายชื่อวิทยากรทุกคนต่อคาบ (วิทยากรหลักขึ้นก่อน) */
export function staffNamesBySession(db: DB, sessionIds: number[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  if (!sessionIds.length) return out;
  const rows = db
    .select({ sessionId: schema.sessionStaff.sessionId, role: schema.sessionStaff.role, ext: schema.sessionStaff.externalName, f: schema.users.firstName, l: schema.users.lastName, if: schema.instructors.firstName, il: schema.instructors.lastName })
    .from(schema.sessionStaff)
    .leftJoin(schema.users, eq(schema.users.id, schema.sessionStaff.userId))
    .leftJoin(schema.instructors, eq(schema.instructors.id, schema.sessionStaff.instructorId))
    .where(and(inArray(schema.sessionStaff.sessionId, sessionIds), isNull(schema.sessionStaff.deletedAt)))
    .orderBy(asc(schema.sessionStaff.id))
    .all()
    .sort((a, b) => (a.role === "lead" ? -1 : 0) - (b.role === "lead" ? -1 : 0));
  for (const r of rows) out.set(r.sessionId, [...(out.get(r.sessionId) ?? []), r.f ? `${r.f} ${r.l}` : `${r.if ? `${r.if} ${r.il ?? ""}`.trim() : r.ext} (ภายนอก)`]);
  return out;
}

/** เติมรายชื่อวิทยากรทุกคนให้การ์ดคาบ */
function withStaff(db: DB, cards: SessionCard[]): SessionCard[] {
  const m = staffNamesBySession(db, cards.map((c) => c.id));
  return cards.map((c) => ({ ...c, staff: m.get(c.id) ?? [] }));
}
/** คาบที่ยังไม่เช็คชื่อ (วันนี้และย้อนหลัง 14 วัน) ของรุ่นที่ยังไม่ปิด */
export function uncheckedSessions(db: DB, today: string, cohortIds?: number[]) {
  const from = new Date(today + "T00:00:00Z");
  from.setUTCDate(from.getUTCDate() - 14);
  const conds = [
    lte(schema.cohortSessions.date, today),
    gte(schema.cohortSessions.date, from.toISOString().slice(0, 10)),
    isNull(schema.cohortSessions.attendanceCheckedAt),
    eq(schema.cohortSessions.takesAttendance, true),
    isNull(schema.cohortSessions.deletedAt),
    sql`${schema.cohorts.status} != 'closed'`,
  ];
  if (cohortIds) conds.push(inArray(schema.cohortSessions.cohortId, cohortIds.length ? cohortIds : [-1]));
  return withStaff(db, sessionsQuery(db).where(and(...conds)).orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime)).all().map(toCard));
}

/** คาบที่ฉันรับผิดชอบ ในช่วงวันที่ */
export function mySessions(db: DB, userId: number, from: string, to: string) {
  const ids = db.select({ id: schema.sessionStaff.sessionId }).from(schema.sessionStaff).where(and(eq(schema.sessionStaff.userId, userId), isNull(schema.sessionStaff.deletedAt))).all().map((r) => r.id);
  if (!ids.length) return [];
  return withStaff(db, sessionsQuery(db)
    .where(and(inArray(schema.cohortSessions.id, ids), gte(schema.cohortSessions.date, from), lte(schema.cohortSessions.date, to), isNull(schema.cohortSessions.deletedAt)))
    .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime))
    .all()
    .map(toCard));
}

/** รุ่นที่ผู้ใช้กลุ่ม B มองเห็น: รุ่นที่ตนสอน + รุ่นที่ได้รับมอบหมาย */
export function assistantCohortIds(db: DB, userId: number, scoped: number[]) {
  const rows = db
    .selectDistinct({ id: schema.cohortSessions.cohortId })
    .from(schema.sessionStaff)
    .innerJoin(schema.cohortSessions, eq(schema.cohortSessions.id, schema.sessionStaff.sessionId))
    .where(and(eq(schema.sessionStaff.userId, userId), isNull(schema.sessionStaff.deletedAt)))
    .all();
  return Array.from(new Set([...rows.map((r) => r.id), ...scoped]));
}

/** ตัวเลือกรุ่น (ยังไม่ปิดรุ่น) — ids = จำกัดเฉพาะรุ่นที่ระบุ */
export function openCohortOptions(db: DB, ids?: number[]) {
  if (ids && !ids.length) return [];
  return db
    .select({ c: schema.cohorts, course: schema.courses })
    .from(schema.cohorts)
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(isNull(schema.cohorts.deletedAt), sql`${schema.cohorts.status} <> 'closed'`, ids ? inArray(schema.cohorts.id, ids) : undefined))
    .orderBy(asc(schema.cohorts.startDate))
    .all()
    .map((x) => ({ id: x.c.id, label: `${x.course.shortName} ${cohortLabel(x.c)}` }));
}

export function overviewNumbers(db: DB, fiscalYear: number) {
  const active = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.enrollments)
    .where(and(inArray(schema.enrollments.status, ["active"]), isNull(schema.enrollments.deletedAt)))
    .get()?.n ?? 0;
  const fy = db
    .select({ status: schema.enrollments.status, n: sql<number>`count(*)` })
    .from(schema.enrollments)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .where(and(eq(schema.cohorts.fiscalYear, fiscalYear), isNull(schema.enrollments.deletedAt)))
    .groupBy(schema.enrollments.status)
    .all();
  const by = Object.fromEntries(fy.map((r) => [r.status, r.n]));
  const runningCohorts = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.cohorts)
    .where(and(eq(schema.cohorts.status, "active"), isNull(schema.cohorts.deletedAt)))
    .get()?.n ?? 0;
  return {
    active,
    runningCohorts,
    fyTotal: fy.reduce((s, r) => s + r.n, 0),
    fyCompleted: by.completed ?? 0,
    fyDropped: by.dropped ?? 0,
  };
}
