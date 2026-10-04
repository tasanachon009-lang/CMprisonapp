import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { RuleError } from "./registry";
import { ROLES, type Role } from "../auth/permissions";

export const MAX_ADMINS = 2;

export function activeAdminIds(db: DB): number[] {
  return db
    .select({ id: schema.users.id })
    .from(schema.userRoles)
    .innerJoin(schema.users, eq(schema.users.id, schema.userRoles.userId))
    .where(and(eq(schema.userRoles.role, "admin"), eq(schema.users.status, "active"), isNull(schema.users.deletedAt)))
    .all()
    .map((r) => r.id);
}

/** ตั้งบทบาท (ยกเว้น admin — การเปลี่ยนสิทธิ์ผู้ดูแลต้องยืนยัน 2 คน) */
export function setRoles(db: DB, userId: number, roles: string[], actorId: number, ip?: string | null) {
  const valid = roles.filter((r) => r in ROLES && r !== "admin") as Role[];
  return db.transaction((tx) => {
    const before = tx.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, userId)).all().map((r) => r.role);
    tx.delete(schema.userRoles).where(and(eq(schema.userRoles.userId, userId), ne(schema.userRoles.role, "admin"))).run();
    for (const r of valid) tx.insert(schema.userRoles).values({ userId, role: r, createdBy: actorId }).onConflictDoNothing().run();
    const after = [...(before.includes("admin") ? ["admin"] : []), ...valid];
    writeAudit(tx, { userId: actorId, action: "permission.change", entity: "user", entityId: userId, before: { roles: before }, after: { roles: after }, ip });
  });
}

// ───────── การกระทำที่ต้องยืนยัน 2 คน ─────────

export const DUAL_ACTIONS = {
  restore: "กู้คืนข้อมูลจากไฟล์สำรอง",
  grant_admin: "ให้สิทธิ์ผู้ดูแลระบบ",
  revoke_admin: "ถอนสิทธิ์ผู้ดูแลระบบ",
  hard_delete: "ลบข้อมูลถาวร",
} as const;
export type DualAction = keyof typeof DUAL_ACTIONS;

export function requestDual(db: DB, action: DualAction, payload: Record<string, unknown>, reason: string, requestedBy: number, ip?: string | null) {
  if (!reason.trim()) throw new RuleError("กรุณาระบุเหตุผล");
  const pending = db.select().from(schema.dualApprovals).where(and(eq(schema.dualApprovals.action, action), eq(schema.dualApprovals.status, "pending"))).get();
  if (pending) throw new RuleError("มีคำขอประเภทนี้รอยืนยันอยู่แล้ว — ยกเลิกคำขอเดิมก่อน");
  const row = db.insert(schema.dualApprovals).values({ action, payload, reason, requestedBy, requestedAt: new Date() }).returning().get();
  writeAudit(db, { userId: requestedBy, action: "dual.request", entity: "dual_approval", entityId: row.id, after: { action, payload }, note: reason, ip });
  const u = db.select().from(schema.users).where(eq(schema.users.id, requestedBy)).get();
  notify(db, { role: "admin", severity: "warning", kind: "dual_request", message: `${u?.firstName ?? ""} ขอ "${DUAL_ACTIONS[action]}" — รอผู้ดูแลอีกคนยืนยัน`, link: "/admin/approvals" });
  return row;
}

/**
 * ยืนยันคำขอ: ต้องเป็นผู้ดูแลคนละคนกับผู้ขอ
 * (หรือใช้รหัสฉุกเฉินเมื่ออีกคนไม่อยู่นาน — ตรวจที่ action)
 */
export function approveDual(db: DB, id: number, approverId: number, opts: { emergency?: boolean; ip?: string | null } = {}) {
  const row = db.select().from(schema.dualApprovals).where(eq(schema.dualApprovals.id, id)).get();
  if (!row || row.status !== "pending") throw new RuleError("ไม่พบคำขอ หรือคำขอไม่อยู่ในสถานะรอยืนยัน");
  if (row.requestedBy === approverId && !opts.emergency) throw new RuleError("ผู้ขอยืนยันคำขอของตัวเองไม่ได้ — ต้องให้ผู้ดูแลอีกคนยืนยัน");
  if (!activeAdminIds(db).includes(approverId)) throw new RuleError("เฉพาะผู้ดูแลระบบเท่านั้นที่ยืนยันได้");
  if (Date.now() - row.requestedAt.getTime() > 7 * 86400000) {
    db.update(schema.dualApprovals).set({ status: "expired" }).where(eq(schema.dualApprovals.id, id)).run();
    throw new RuleError("คำขอนี้เกิน 7 วันแล้ว หมดอายุ กรุณาขอใหม่");
  }
  db.update(schema.dualApprovals).set({ status: "approved", decidedBy: approverId, decidedAt: new Date() }).where(eq(schema.dualApprovals.id, id)).run();
  writeAudit(db, { userId: approverId, action: opts.emergency ? "dual.approve_emergency" : "dual.approve", entity: "dual_approval", entityId: id, after: { action: row.action }, ip: opts.ip });
  return row;
}

export function rejectDual(db: DB, id: number, userId: number, ip?: string | null) {
  const row = db.select().from(schema.dualApprovals).where(eq(schema.dualApprovals.id, id)).get();
  if (!row || row.status !== "pending") throw new RuleError("ไม่พบคำขอที่รอยืนยัน");
  db.update(schema.dualApprovals).set({ status: "rejected", decidedBy: userId, decidedAt: new Date() }).where(eq(schema.dualApprovals.id, id)).run();
  writeAudit(db, { userId, action: row.requestedBy === userId ? "dual.cancel" : "dual.reject", entity: "dual_approval", entityId: id, ip });
}

/** ทำการกระทำที่ได้รับอนุมัติแล้ว (ยกเว้น restore ที่ทำแบบ async ที่ action) */
export function executeAdminChange(db: DB, row: typeof schema.dualApprovals.$inferSelect, actorId: number) {
  const p = row.payload as { userId?: number };
  if (row.action === "grant_admin") {
    if (activeAdminIds(db).length >= MAX_ADMINS) throw new RuleError(`ผู้ดูแลระบบมีได้ไม่เกิน ${MAX_ADMINS} คน — ต้องถอนสิทธิ์คนเดิมก่อน`);
    db.insert(schema.userRoles).values({ userId: p.userId!, role: "admin", createdBy: actorId }).onConflictDoNothing().run();
  } else if (row.action === "revoke_admin") {
    if (activeAdminIds(db).filter((i) => i !== p.userId).length < 1) throw new RuleError("ต้องมีผู้ดูแลระบบอย่างน้อย 1 คน");
    db.delete(schema.userRoles).where(and(eq(schema.userRoles.userId, p.userId!), eq(schema.userRoles.role, "admin"))).run();
  } else return;
  db.update(schema.dualApprovals).set({ status: "executed", executedAt: new Date(), result: "สำเร็จ" }).where(eq(schema.dualApprovals.id, row.id)).run();
  writeAudit(db, { userId: actorId, action: "permission.change", entity: "user", entityId: p.userId, after: { [row.action]: true }, note: `ยืนยัน 2 คน (คำขอ #${row.id})` });
}

/** บัญชีกลุ่ม B ที่ไม่ได้ใช้เกิน 60 วัน (ให้หัวหน้า/รองทบทวน) */
export function staleAssistantAccounts(db: DB) {
  const cutoff = Date.now() - 60 * 86400000;
  return db
    .select({ id: schema.users.id, firstName: schema.users.firstName, lastName: schema.users.lastName, lastLoginAt: schema.users.lastLoginAt })
    .from(schema.users)
    .innerJoin(schema.userRoles, and(eq(schema.userRoles.userId, schema.users.id), eq(schema.userRoles.role, "assistant")))
    .where(and(eq(schema.users.status, "active"), sql`coalesce(${schema.users.lastLoginAt}, ${schema.users.createdAt}) < ${cutoff}`))
    .all();
}
