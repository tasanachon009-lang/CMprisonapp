import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { isValidISODate, todayISO, formatThaiDate } from "../thai-date";
import { DELEGATION_SCOPES, type DelegationScope, type Permission } from "../auth/permissions";
import { dutyCandidates } from "./duty";

/**
 * มอบอำนาจอนุมัติชั่วคราว (สเปก 22B)
 * - หัวหน้า/รองมอบให้เจ้าหน้าที่กลุ่ม A 1 คน ระบุช่วงวันที่และขอบเขต · หมดเวลาคืนสิทธิ์เอง · ยกเลิกก่อนได้
 * - ได้เฉพาะสิทธิ์ตามขอบเขต (ไม่ได้บทบาทผู้ดูแล → งานที่ต้องยืนยัน 2 คนมอบไม่ได้โดยโครงสร้าง)
 * - ผู้มอบต้องยังเป็นผู้ดูแลอยู่ ถ้าถูกถอดบทบาท การมอบอำนาจหยุดมีผลทันที
 */

export type ActiveDelegation = { id: number; fromUserId: number; fromName: string; scopes: DelegationScope[]; startDate: string; endDate: string };

export function activeDelegationsFor(db: DB, userId: number, today = todayISO()): ActiveDelegation[] {
  const rows = db
    .select({ d: schema.delegations, f: schema.users.firstName, l: schema.users.lastName, status: schema.users.status })
    .from(schema.delegations)
    .innerJoin(schema.users, eq(schema.users.id, schema.delegations.fromUserId))
    .where(and(eq(schema.delegations.toUserId, userId), isNull(schema.delegations.revokedAt), isNull(schema.delegations.deletedAt), lte(schema.delegations.startDate, today), gte(schema.delegations.endDate, today)))
    .all();
  return rows
    .filter((r) => r.status === "active" && isAdmin(db, r.d.fromUserId))
    .map((r) => ({ id: r.d.id, fromUserId: r.d.fromUserId, fromName: `${r.f} ${r.l}`, scopes: ((r.d.scopes as string[]) ?? []).filter((s): s is DelegationScope => s in DELEGATION_SCOPES), startDate: r.d.startDate, endDate: r.d.endDate }));
}

function isAdmin(db: DB, userId: number) {
  return !!db.select().from(schema.userRoles).where(and(eq(schema.userRoles.userId, userId), eq(schema.userRoles.role, "admin"))).get();
}

/** สิทธิ์ที่ได้จากการมอบอำนาจ (เฉพาะที่ไม่มีอยู่แล้ว) → การมอบอำนาจที่ให้สิทธิ์นั้น */
export function delegatedPermissions(base: Set<Permission>, delegations: ActiveDelegation[]) {
  const out = new Map<Permission, ActiveDelegation>();
  for (const d of delegations) {
    for (const s of d.scopes) for (const p of DELEGATION_SCOPES[s].perms) if (!base.has(p) && !out.has(p)) out.set(p, d);
  }
  return out;
}

/** ข้อความ audit เช่น "อนุมัติแทน (มอบอำนาจโดย วิภาวรรณ ฟื้นฟูใจ ช่วง 6 ต.ค. 2569 – 10 ต.ค. 2569)" */
export function delegationNote(d: ActiveDelegation) {
  return `อนุมัติแทน (มอบอำนาจโดย ${d.fromName} ช่วง ${formatThaiDate(d.startDate)} – ${formatThaiDate(d.endDate)})`;
}

export function createDelegation(db: DB, input: { toUserId: number; scopes: string[]; startDate: string; endDate: string; reason?: string | null }, actor: { userId: number; ip?: string | null }) {
  if (!isAdmin(db, actor.userId)) throw new RuleError("มอบอำนาจได้เฉพาะผู้ดูแลระบบ");
  if (input.toUserId === actor.userId) throw new RuleError("มอบอำนาจให้ตัวเองไม่ได้");
  if (!dutyCandidates(db).some((u) => u.id === input.toUserId) || isAdmin(db, input.toUserId)) throw new RuleError("มอบอำนาจได้เฉพาะเจ้าหน้าที่หลัก กรุณาเลือกจากรายชื่อ");
  const scopes = Array.from(new Set(input.scopes)).filter((s): s is DelegationScope => s in DELEGATION_SCOPES);
  if (!scopes.length) throw new RuleError("เลือกขอบเขตอย่างน้อย 1 อย่าง");
  if (!isValidISODate(input.startDate) || !isValidISODate(input.endDate) || input.endDate < input.startDate) throw new RuleError("ช่วงวันที่ไม่ถูกต้อง — วันสิ้นสุดต้องไม่ก่อนวันเริ่ม");
  if (input.endDate < todayISO()) throw new RuleError("วันสิ้นสุดผ่านไปแล้ว");
  const row = db.insert(schema.delegations).values({ fromUserId: actor.userId, toUserId: input.toUserId, scopes, startDate: input.startDate, endDate: input.endDate, reason: input.reason?.trim() || null, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "delegation", entityId: row.id, after: { toUserId: input.toUserId, scopes, startDate: input.startDate, endDate: input.endDate }, note: input.reason ?? null, ip: actor.ip });
  return row;
}

export function revokeDelegation(db: DB, id: number, actor: { userId: number; ip?: string | null }) {
  if (!isAdmin(db, actor.userId)) throw new RuleError("ยกเลิกการมอบอำนาจได้เฉพาะผู้ดูแลระบบ");
  const d = db.select().from(schema.delegations).where(eq(schema.delegations.id, id)).get();
  if (!d || d.revokedAt) throw new RuleError("ไม่พบการมอบอำนาจที่ยังมีผล");
  db.update(schema.delegations).set({ revokedAt: new Date(), revokedBy: actor.userId, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.delegations.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "delegation", entityId: id, before: { revokedAt: null }, after: { revoked: true }, note: "ยกเลิกการมอบอำนาจก่อนกำหนด", ip: actor.ip });
}

export function listDelegations(db: DB) {
  return db.select().from(schema.delegations).where(isNull(schema.delegations.deletedAt)).orderBy(desc(schema.delegations.startDate)).all();
}
