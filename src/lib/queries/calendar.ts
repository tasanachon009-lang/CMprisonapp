import { and, asc, eq, gte, inArray, isNull, lte, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { cohortLabel } from "../services/cohorts";
import { findConflicts } from "../services/schedule";
import { locationConflicts, inmateOverlaps } from "../services/schedule-edit";

/** ปฏิทินรวม (สเปก 22B): ทุกหลักสูตรทุกรุ่นในช่วงวันที่ + ความทับซ้อน */
export type CalendarFilter = { courseId?: number | null; person?: { userId?: number | null; instructorId?: number | null } | null; location?: string | null };

export function calendarSessions(db: DB, from: string, to: string, f: CalendarFilter = {}) {
  const rows = db
    .select({ s: schema.cohortSessions, c: schema.cohorts, course: schema.courses })
    .from(schema.cohortSessions)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.cohortSessions.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId))
    .where(and(
      gte(schema.cohortSessions.date, from), lte(schema.cohortSessions.date, to), isNull(schema.cohortSessions.deletedAt), isNull(schema.cohorts.deletedAt),
      ne(schema.cohortSessions.status, "cancelled"),
      f.courseId ? eq(schema.cohorts.courseId, f.courseId) : undefined,
      f.location ? eq(schema.cohortSessions.location, f.location) : undefined,
    ))
    .orderBy(asc(schema.cohortSessions.date), asc(schema.cohortSessions.startTime))
    .all();
  const ids = rows.map((r) => r.s.id);
  const staff = ids.length
    ? db.select({ st: schema.sessionStaff, uf: schema.users.firstName, ul: schema.users.lastName, if: schema.instructors.firstName, il: schema.instructors.lastName })
      .from(schema.sessionStaff)
      .leftJoin(schema.users, eq(schema.users.id, schema.sessionStaff.userId))
      .leftJoin(schema.instructors, eq(schema.instructors.id, schema.sessionStaff.instructorId))
      .where(and(inArray(schema.sessionStaff.sessionId, ids), isNull(schema.sessionStaff.deletedAt))).all()
    : [];
  const out = rows.map(({ s, c, course }) => {
    const mine = staff.filter((x) => x.st.sessionId === s.id).map((x) => ({
      userId: x.st.userId, instructorId: x.st.instructorId, external: !x.st.userId,
      name: x.uf ? `${x.uf} ${x.ul}` : x.if ? `${x.if} ${x.il ?? ""}`.trim() : x.st.externalName ?? "-",
    }));
    return { ...s, cohortLabel: `${course.shortName} ${cohortLabel(c)}`, courseCode: course.code, color: course.color ?? "#3D5590", staff: mine };
  });
  const p = f.person;
  return p && (p.userId || p.instructorId) ? out.filter((s) => s.staff.some((x) => (p.userId ? x.userId === p.userId : x.instructorId === p.instructorId))) : out;
}

/** รายการความทับซ้อนทั้งหมดในช่วงวันที่ (ใช้ก่อนพิมพ์ตารางแจก) */
export function overlapReport(db: DB, from: string, to: string) {
  const sessions = calendarSessions(db, from, to);
  const items: Array<{ kind: "staff" | "location" | "inmate"; date: string; text: string }> = [];
  const seen = new Set<string>();
  for (const s of sessions) {
    for (const st of s.staff) {
      for (const c of findConflicts(db, s, { userId: st.userId, instructorId: st.instructorId })) {
        const key = `st:${[s.id, c.sessionId].sort().join("-")}:${st.userId ?? `i${st.instructorId}`}`;
        if (seen.has(key)) continue;
        seen.add(key);
        items.push({ kind: "staff", date: s.date, text: `${st.name} สอน 2 ที่: ${s.startTime}–${s.endTime} "${s.title}" (${s.cohortLabel}) กับ ${c.startTime}–${c.endTime} "${c.title}" (${c.label})` });
      }
    }
    for (const c of locationConflicts(db, s)) {
      const key = `loc:${[s.id, c.sessionId].sort().join("-")}`;
      if (seen.has(key)) continue;
      seen.add(key);
      items.push({ kind: "location", date: s.date, text: `สถานที่ "${s.location}" ใช้ซ้อน: "${s.title}" (${s.cohortLabel}) กับ "${c.title}" (${c.label}) ${c.startTime}–${c.endTime}` });
    }
  }
  for (const o of inmateOverlaps(db, from, to)) {
    const inc = db.select({ no: schema.incarcerations.inmateNo }).from(schema.incarcerations).where(eq(schema.incarcerations.id, o.incarcerationId)).get();
    items.push({ kind: "inmate", date: o.a.date, text: `ผู้ต้องขังเลข ${inc?.no ?? "-"} มีกิจกรรมซ้อน: ${o.a.startTime}–${o.a.endTime} "${o.a.title}" กับ ${o.b.startTime}–${o.b.endTime} "${o.b.title}" (อยู่ 2 หลักสูตร)` });
  }
  return items.sort((a, b) => a.date.localeCompare(b.date));
}
