import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import type { Auth } from "./session";

/** ผู้รับผิดชอบคาบนี้หรือไม่ */
export function isSessionStaff(userId: number, sessionId: number) {
  return !!getDb()
    .select({ id: schema.sessionStaff.id })
    .from(schema.sessionStaff)
    .where(and(eq(schema.sessionStaff.sessionId, sessionId), eq(schema.sessionStaff.userId, userId), isNull(schema.sessionStaff.deletedAt)))
    .get();
}

/** สิทธิ์ของคาบ: แก้ได้ (ทุกคาบ หรือ คาบของตน) / ดูได้ */
export function sessionAccess(auth: Auth, sessionId: number, cohortId: number) {
  const own = isSessionStaff(auth.user.id, sessionId);
  const assigned = auth.cohortScopes.includes(cohortId);
  const canEdit = auth.can("attendance.edit") || (auth.can("attendance.edit_own") && (own || assigned));
  const canView = canEdit || auth.can("attendance.view");
  return { canEdit, canView, own };
}
