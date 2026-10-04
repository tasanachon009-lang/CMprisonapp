import { and, desc, eq, inArray, isNull, like, or, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { normalizeSearch } from "../search";
import { normalizeNationalId } from "../thai-id";
import { cohortLabel } from "../services/cohorts";

/** ค้นได้ทั้งชื่อ นามสกุล เลขประจำตัว (ไม่สนช่องว่าง/คำนำหน้า) และเลขบัตร 13 หลักแบบตรงตัว */
export function searchPersons(db: DB, q: string, limit = 30) {
  const raw = q.trim();
  if (raw.length < 2) return [];
  const key = normalizeSearch(raw);
  const digits = normalizeNationalId(raw);
  const incMatch = db
    .select({ personId: schema.incarcerations.personId })
    .from(schema.incarcerations)
    .where(like(schema.incarcerations.inmateNo, `%${raw.replace(/\s+/g, "").toUpperCase()}%`))
    .limit(limit)
    .all()
    .map((r) => r.personId);
  const conds = [like(schema.persons.searchKey, `%${key}%`)];
  if (digits.length === 13) conds.push(eq(schema.persons.nationalId, digits));
  if (incMatch.length) conds.push(inArray(schema.persons.id, incMatch));
  const persons = db.select().from(schema.persons).where(and(isNull(schema.persons.deletedAt), or(...conds))).limit(limit).all();
  if (!persons.length) return [];
  const incs = db.select().from(schema.incarcerations).where(inArray(schema.incarcerations.personId, persons.map((p) => p.id))).orderBy(desc(schema.incarcerations.id)).all();
  return persons.map((p) => {
    const mine = incs.filter((i) => i.personId === p.id);
    return { person: p, current: mine[0] ?? null, incarcerationCount: mine.length };
  });
}

/** หน้าบุคคล: ทุกการต้องโทษ (ล่าสุดก่อน) + หลักสูตรในแต่ละครั้ง */
export function personTimeline(db: DB, personId: number) {
  const person = db.select().from(schema.persons).where(eq(schema.persons.id, personId)).get();
  if (!person) return null;
  const incs = db.select().from(schema.incarcerations).where(and(eq(schema.incarcerations.personId, personId), isNull(schema.incarcerations.deletedAt))).orderBy(desc(schema.incarcerations.id)).all();
  const enr = incs.length
    ? db
        .select({ e: schema.enrollments, c: schema.cohorts, course: schema.courses })
        .from(schema.enrollments)
        .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
        .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
        .where(and(inArray(schema.enrollments.incarcerationId, incs.map((i) => i.id)), isNull(schema.enrollments.deletedAt)))
        .orderBy(desc(schema.cohorts.startDate))
        .all()
    : [];
  const drugs = incs.length ? db.select().from(schema.drugUseHistory).where(inArray(schema.drugUseHistory.incarcerationId, incs.map((i) => i.id))).all() : [];
  const releases = incs.length ? db.select().from(schema.releaseEvents).where(inArray(schema.releaseEvents.incarcerationId, incs.map((i) => i.id))).orderBy(desc(schema.releaseEvents.id)).all() : [];
  const att = enr.length
    ? db
        .select({ enrollmentId: schema.attendance.enrollmentId, status: schema.attendance.status, n: sql<number>`count(*)` })
        .from(schema.attendance)
        .where(inArray(schema.attendance.enrollmentId, enr.map((x) => x.e.id)))
        .groupBy(schema.attendance.enrollmentId, schema.attendance.status)
        .all()
    : [];
  return {
    person,
    incarcerations: incs.map((i, idx) => ({
      inc: i,
      isCurrent: idx === 0,
      drugs: drugs.filter((d) => d.incarcerationId === i.id),
      releases: releases.filter((r) => r.incarcerationId === i.id),
      enrollments: enr
        .filter((x) => x.e.incarcerationId === i.id)
        .map((x) => {
          const a = att.filter((r) => r.enrollmentId === x.e.id);
          const get = (s: string) => a.find((r) => r.status === s)?.n ?? 0;
          const counted = get("present") + get("absent") + get("leave") + get("sick");
          return { ...x, label: cohortLabel(x.c), present: get("present"), counted, corrections: get("corrections"), pct: counted ? Math.round((get("present") / counted) * 1000) / 10 : null };
        }),
    })),
  };
}
