import { and, eq, inArray, isNull, ne } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { cohortLabel } from "../services/cohorts";

/** วันพ้นโทษโดยประมาณ = วันรับตัว + โทษ (ปี/เดือน/วัน) — ไม่รวมพักโทษ/ลดวันต้องโทษ */
export function estimatedRelease(admitted: string | null, y?: number | null, m?: number | null, d?: number | null) {
  if (!admitted || (y == null && m == null && d == null)) return null;
  const [Y, M, D] = admitted.split("-").map(Number);
  const dt = new Date(Date.UTC(Y + (y ?? 0), M - 1 + (m ?? 0), D + (d ?? 0)));
  return dt.toISOString().slice(0, 10);
}

/**
 * รายชื่อแนะนำหลักสูตร 3 วัน (สเปก 17): เคยผ่าน 12 วัน/ชุมชนบำบัด แต่ยังไม่เคยเข้า 3 วัน · ยังไม่ออกจากเรือนจำ
 * เรียงตามวันพ้นโทษโดยประมาณ (ใกล้สุดก่อน)
 */
export function pre3Candidates(db: DB, today: string) {
  const courses = db.select().from(schema.courses).all();
  const pre3 = courses.find((c) => c.code === "PRE3");
  const source = courses.filter((c) => c.code === "B12" || c.code === "FAST").map((c) => c.id);
  if (!pre3 || !source.length) return [];
  const done = db.select({ e: schema.enrollments, c: schema.cohorts, course: schema.courses, inc: schema.incarcerations, p: schema.persons })
    .from(schema.enrollments)
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(inArray(schema.enrollments.courseId, source), eq(schema.enrollments.status, "completed"), isNull(schema.incarcerations.releasedDate), isNull(schema.persons.deletedAt)))
    .all();
  if (!done.length) return [];
  // เคยลง 3 วันแล้ว (การต้องโทษเดียวกัน ไม่นับที่ถอนตัว)
  const incIds = Array.from(new Set(done.map((r) => r.inc.id)));
  const had = new Set(db.select({ id: schema.enrollments.incarcerationId }).from(schema.enrollments)
    .where(and(eq(schema.enrollments.courseId, pre3.id), inArray(schema.enrollments.incarcerationId, incIds), ne(schema.enrollments.status, "withdrawn"))).all().map((r) => r.id));
  const byInc = new Map<number, { inc: (typeof done)[number]["inc"]; p: (typeof done)[number]["p"]; courses: string[] }>();
  for (const r of done) {
    if (had.has(r.inc.id)) continue;
    const x = byInc.get(r.inc.id) ?? { inc: r.inc, p: r.p, courses: [] };
    x.courses.push(`${r.course.shortName} ${cohortLabel(r.c)}`);
    byInc.set(r.inc.id, x);
  }
  return [...byInc.values()].map((x) => {
    const release = estimatedRelease(x.inc.admittedDate, x.inc.sentenceYears, x.inc.sentenceMonths, x.inc.sentenceDays);
    const monthsLeft = release ? Math.round(((Date.parse(release) - Date.parse(today)) / 86400000 / 30.44) * 10) / 10 : null;
    return {
      incarcerationId: x.inc.id, personId: x.p.id, name: `${x.p.prefix ?? ""}${x.p.firstName} ${x.p.lastName}`, inmateNo: x.inc.inmateNo, zone: x.inc.zone,
      hasNationalId: !!x.p.nationalId, courses: x.courses, release, monthsLeft, sentenceStatus: x.inc.sentenceStatus,
    };
  }).sort((a, b) => (a.release ?? "9999").localeCompare(b.release ?? "9999"));
}
