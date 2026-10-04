import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { cohortLabel } from "../services/cohorts";

export function enrollmentContext(db: DB, id: number) {
  const row = db
    .select({ e: schema.enrollments, inc: schema.incarcerations, p: schema.persons, c: schema.cohorts, course: schema.courses })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(eq(schema.enrollments.id, id), isNull(schema.enrollments.deletedAt)))
    .get();
  if (!row) return null;
  return { ...row, label: cohortLabel(row.c), name: `${row.p.prefix ?? ""}${row.p.firstName} ${row.p.lastName}` };
}

export function bstOf(db: DB, enrollmentId: number) {
  return {
    tasks: db.select().from(schema.bstTasks).where(eq(schema.bstTasks.enrollmentId, enrollmentId)).orderBy(asc(schema.bstTasks.system), asc(schema.bstTasks.id)).all(),
    followups: db.select().from(schema.followups).where(eq(schema.followups.enrollmentId, enrollmentId)).orderBy(asc(schema.followups.seq)).all(),
    ids: db.select().from(schema.externalIds).where(eq(schema.externalIds.enrollmentId, enrollmentId)).all(),
  };
}

export function medicalNotesOf(db: DB, enrollmentId: number) {
  return db.select().from(schema.medicalNotes).where(and(eq(schema.medicalNotes.enrollmentId, enrollmentId), isNull(schema.medicalNotes.deletedAt))).orderBy(desc(schema.medicalNotes.noteDate), desc(schema.medicalNotes.id)).all();
}

export function behaviorNotesOf(db: DB, incarcerationId: number) {
  return db.select().from(schema.behaviorNotes).where(and(eq(schema.behaviorNotes.incarcerationId, incarcerationId), isNull(schema.behaviorNotes.deletedAt))).orderBy(desc(schema.behaviorNotes.noteDate), desc(schema.behaviorNotes.id)).all();
}
