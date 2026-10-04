import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { AuthError, type Auth } from "./session";
import type { Permission } from "./permissions";

/** ผู้รับผิดชอบคาบนี้หรือไม่ */
export function isSessionStaff(userId: number, sessionId: number) {
  return !!getDb()
    .select({ id: schema.sessionStaff.id })
    .from(schema.sessionStaff)
    .where(and(eq(schema.sessionStaff.sessionId, sessionId), eq(schema.sessionStaff.userId, userId), isNull(schema.sessionStaff.deletedAt)))
    .get();
}

/** รุ่นทั้งหมดที่บุคคลนี้เคยลงทะเบียน — ใช้ตรวจสิทธิ์ที่มอบหมายรายรุ่น (กลุ่ม B) */
export function cohortsOfPerson(personId: number) {
  return getDb()
    .select({ id: schema.enrollments.cohortId })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .where(and(eq(schema.incarcerations.personId, personId), isNull(schema.enrollments.deletedAt)))
    .all()
    .map((r) => r.id);
}

export function cohortsOfIncarceration(incarcerationId: number) {
  return getDb().select({ id: schema.enrollments.cohortId }).from(schema.enrollments).where(and(eq(schema.enrollments.incarcerationId, incarcerationId), isNull(schema.enrollments.deletedAt))).all().map((r) => r.id);
}

export function cohortOfEnrollment(enrollmentId: number) {
  return getDb().select({ id: schema.enrollments.cohortId }).from(schema.enrollments).where(eq(schema.enrollments.id, enrollmentId)).get()?.id ?? null;
}

export function cohortOfTask(taskId: number) {
  const t = getDb().select({ e: schema.bstTasks.enrollmentId }).from(schema.bstTasks).where(eq(schema.bstTasks.id, taskId)).get();
  return t ? cohortOfEnrollment(t.e) : null;
}

export function cohortOfFollowup(followupId: number) {
  const f = getDb().select({ e: schema.followups.enrollmentId }).from(schema.followups).where(eq(schema.followups.id, followupId)).get();
  return f ? cohortOfEnrollment(f.e) : null;
}

/** ต้องมีสิทธิ์ทั้งระบบ หรือได้รับมอบหมายในรุ่นที่เกี่ยวข้อง — ไม่ผ่าน = โยน AuthError */
export function assertIn(auth: Auth, p: Permission, cohortIds: Array<number | null>) {
  if (!auth.canIn(p, cohortIds.filter((x): x is number => x != null))) throw new AuthError("คุณไม่มีสิทธิ์ทำรายการนี้กับผู้ต้องขังคนนี้ (ไม่ได้รับมอบหมายรุ่นนี้)");
}

/** สิทธิ์ของคาบ: แก้ได้ (ทุกคาบ หรือ คาบของตน) / ดูได้ */
export function sessionAccess(auth: Auth, sessionId: number, cohortId: number) {
  const own = isSessionStaff(auth.user.id, sessionId);
  const assigned = auth.cohortScopes.includes(cohortId);
  const canEdit = auth.can("attendance.edit") || (auth.can("attendance.edit_own") && (own || assigned));
  const canView = canEdit || auth.can("attendance.view");
  return { canEdit, canView, own };
}
