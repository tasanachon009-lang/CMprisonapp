import type { DB } from "./db";
import { schema } from "./db";

export type AuditEntry = {
  userId: number | null;
  action: string;
  entity?: string;
  entityId?: string | number | null;
  personId?: number | null;
  before?: unknown;
  after?: unknown;
  note?: string | null;
  ip?: string | null;
};

/** เขียนประวัติการใช้งาน (เพิ่มได้อย่างเดียว) */
export function writeAudit(db: Pick<DB, "insert">, e: AuditEntry) {
  db.insert(schema.auditLogs)
    .values({
      at: new Date(),
      userId: e.userId,
      action: e.action,
      entity: e.entity ?? null,
      entityId: e.entityId != null ? String(e.entityId) : null,
      personId: e.personId ?? null,
      before: e.before ?? null,
      after: e.after ?? null,
      note: e.note ?? null,
      ip: e.ip ?? null,
    })
    .run();
}

/** เก็บเฉพาะฟิลด์ที่เปลี่ยน (ค่าเดิม→ค่าใหม่) */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (k === "updatedAt" || k === "updatedBy" || k === "version") continue;
    const bv = before[k] instanceof Date ? (before[k] as Date).getTime() : before[k];
    const av = after[k] instanceof Date ? (after[k] as Date).getTime() : after[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv;
      a[k] = av;
    }
  }
  return { before: b, after: a, changed: Object.keys(a).length > 0 };
}
