import { and, desc, eq, gte, inArray, isNull, or, sql } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { RuleError } from "../errors";
import { assistantCohortIds } from "../queries/home";
import type { Permission } from "../auth/permissions";

/**
 * กล่องจดหมายเวร (สเปก 20)
 * ผู้รับ: "ผลัดถัดไป" = เจ้าหน้าที่หลัก/สถานพยาบาลทุกคน (ยกเว้นผู้เขียน) ที่เข้าระบบหลังจากนั้น · "ทุกคน" · รายบุคคล · "ทีมของรุ่น"
 * ผู้ใช้: หัวหน้า/รอง + กลุ่ม A = เต็ม · กลุ่ม B = ส่งได้ และรับเฉพาะข้อความถึงตน/รุ่นที่ตนสอน (ไม่เห็นข้อความทั่วไปของเวร)
 * การเงิน/ผู้บริหาร = ไม่มีเมนู (ไม่มีสิทธิ์ shift.use)
 */
export const LEVEL_LABEL: Record<string, string> = { normal: "ปกติ", important: "สำคัญ", red: "สีแดง" };
const SHIFT_ROLES = ["rehab", "medical", "mental_health", "admin"];

/** full = หัวหน้า/รอง/กลุ่ม A · cohortIds = รุ่นที่ผู้ใช้กลุ่ม B สอน/ได้รับมอบหมาย */
export type Viewer = { userId: number; full: boolean; cohortIds: number[]; canHealth: boolean };

export function shiftViewer(db: DB, a: { user: { id: number; roles: string[] }; can: (p: Permission) => boolean; cohortScopes: number[] }): Viewer {
  const full = a.user.roles.some((r) => SHIFT_ROLES.includes(r));
  return { userId: a.user.id, full, cohortIds: full ? [] : assistantCohortIds(db, a.user.id, a.cohortScopes), canHealth: a.can("health.view") };
}

function recipientFilter(v: Viewer) {
  const toMe = and(eq(schema.shiftMessages.recipientType, "user"), eq(schema.shiftMessages.recipientUserId, v.userId));
  if (v.full) return or(inArray(schema.shiftMessages.recipientType, ["all", "next_shift", "cohort"]), toMe);
  return or(toMe, v.cohortIds.length ? and(eq(schema.shiftMessages.recipientType, "cohort"), inArray(schema.shiftMessages.recipientCohortId, v.cohortIds)) : sql`0`);
}
/** ข้อความที่ผู้ใช้ควรเห็น (14 วันล่าสุด + เรื่องที่ยังค้าง) */
export function messagesFor(db: DB, v: Viewer) {
  const since = new Date(Date.now() - 14 * 86400000);
  const rows = db
    .select()
    .from(schema.shiftMessages)
    .where(and(isNull(schema.shiftMessages.deletedAt), or(eq(schema.shiftMessages.authorId, v.userId), recipientFilter(v)), or(gte(schema.shiftMessages.createdAt, since), eq(schema.shiftMessages.status, "open"))))
    .orderBy(desc(schema.shiftMessages.id))
    .limit(200)
    .all();
  const acks = rows.length ? db.select().from(schema.shiftMessageAcks).where(inArray(schema.shiftMessageAcks.messageId, rows.map((r) => r.id))).all() : [];
  return rows.map((m) => ({
    ...m,
    body: m.healthRelated && !v.canHealth ? "มีเรื่องสุขภาพ — ติดต่อพยาบาล" : m.body,
    masked: m.healthRelated && !v.canHealth,
    ackedByMe: acks.some((a) => a.messageId === m.id && a.userId === v.userId),
    acks: acks.filter((a) => a.messageId === m.id),
    mine: m.authorId === v.userId,
  }));
}

export function unacked(db: DB, v: Viewer) {
  return messagesFor(db, v).filter((m) => !m.mine && !m.ackedByMe);
}

export function createMessage(db: DB, input: { level: string; body: string; personId?: number | null; healthRelated: boolean; recipientType: string; recipientUserId?: number | null; recipientCohortId?: number | null; needsAction: boolean; dueDate?: string | null }, actor: { userId: number; ip?: string | null; viewer?: Viewer }) {
  if (!input.body.trim()) throw new RuleError("กรุณาพิมพ์ข้อความ");
  if (!["normal", "important", "red"].includes(input.level)) throw new RuleError("ระดับไม่ถูกต้อง");
  if (!["next_shift", "all", "user", "cohort"].includes(input.recipientType)) throw new RuleError("กรุณาเลือกผู้รับ");
  if (input.recipientType === "user" && !input.recipientUserId) throw new RuleError("กรุณาเลือกผู้รับรายบุคคล");
  if (input.recipientType === "cohort") {
    if (!input.recipientCohortId) throw new RuleError("กรุณาเลือกรุ่นที่จะส่งถึง");
    // กลุ่ม B ส่งถึงทีมของรุ่นได้เฉพาะรุ่นที่ตนสอน/ได้รับมอบหมาย
    if (actor.viewer && !actor.viewer.full && !actor.viewer.cohortIds.includes(input.recipientCohortId)) throw new RuleError("ส่งได้เฉพาะรุ่นที่รับผิดชอบหรือได้รับมอบหมาย");
  }
  const values = { ...input, recipientUserId: input.recipientType === "user" ? input.recipientUserId : null, recipientCohortId: input.recipientType === "cohort" ? input.recipientCohortId : null };
  const m = db.insert(schema.shiftMessages).values({ ...values, body: input.body.trim(), authorId: actor.userId, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "shift_message", entityId: m.id, personId: input.personId ?? null, after: { level: input.level, recipientType: input.recipientType }, ip: actor.ip });
  return m;
}

export function ackMessage(db: DB, messageId: number, v: Viewer) {
  const visible = messagesFor(db, v).find((m) => m.id === messageId);
  if (!visible) throw new RuleError("ไม่พบข้อความ");
  db.insert(schema.shiftMessageAcks).values({ messageId, userId: v.userId, ackAt: new Date() }).onConflictDoNothing().run();
  writeAudit(db, { userId: v.userId, action: "shift.ack", entity: "shift_message", entityId: messageId });
}

export function resolveMessage(db: DB, messageId: number, resolution: string, v: Viewer) {
  if (!resolution.trim()) throw new RuleError("กรุณาบันทึกผลการดำเนินการ");
  const visible = messagesFor(db, v).find((m) => m.id === messageId);
  if (!visible || !visible.needsAction) throw new RuleError("ไม่พบเรื่องที่ต้องติดตาม");
  if (visible.masked) throw new RuleError("เรื่องสุขภาพ — ให้พยาบาล/ผู้มีสิทธิ์สุขภาพเป็นผู้ปิดเรื่อง");
  db.update(schema.shiftMessages).set({ status: "done", resolvedBy: v.userId, resolvedAt: new Date(), resolution: resolution.trim(), updatedBy: v.userId, updatedAt: new Date() }).where(eq(schema.shiftMessages.id, messageId)).run();
  db.insert(schema.shiftMessageAcks).values({ messageId, userId: v.userId, ackAt: new Date() }).onConflictDoNothing().run();
  writeAudit(db, { userId: v.userId, action: "shift.resolve", entity: "shift_message", entityId: messageId, note: resolution });
}

/** เรื่องค้างเกินกำหนด → เตือนหัวหน้า/รอง (งานตั้งเวลาทุกวัน) */
export function notifyOverdue(db: DB, today: string) {
  const rows = db
    .select()
    .from(schema.shiftMessages)
    .where(and(eq(schema.shiftMessages.status, "open"), eq(schema.shiftMessages.needsAction, true), sql`${schema.shiftMessages.dueDate} < ${today}`, isNull(schema.shiftMessages.overdueNotifiedAt)))
    .all();
  for (const m of rows) {
    notify(db, { role: "admin", severity: "warning", kind: "shift_overdue", message: `เรื่องส่งเวร #${m.id} (${LEVEL_LABEL[m.level]}) เลยกำหนดแล้วยังไม่ดำเนินการ`, link: "/inbox" });
    db.update(schema.shiftMessages).set({ overdueNotifiedAt: new Date() }).where(eq(schema.shiftMessages.id, m.id)).run();
  }
  return rows.length;
}
