import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "./db";
import { writeAudit } from "./audit";
import { notify } from "./notify";

/**
 * บันทึกการส่งออก + แจ้งเตือนผู้ดูแลเมื่อผิดปกติ (สเปก 2.4): ส่งออกจำนวนมากใน 1 ชั่วโมง
 */
export function logExport(userId: number, entity: string, entityId: string | number, rows: number, ip: string | null) {
  const db = getDb();
  writeAudit(db, { userId, action: "export", entity, entityId, after: { rows }, ip });
  const lastHour = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.userId, userId), eq(schema.auditLogs.action, "export"), gte(schema.auditLogs.at, new Date(Date.now() - 3600000))))
    .get()?.n ?? 0;
  if (rows > 300 || lastHour >= 5) {
    const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
    notify(db, { role: "admin", severity: "warning", kind: "mass_export", message: `${u?.firstName ?? ""} ${u?.lastName ?? ""} ส่งออกข้อมูลที่มีชื่อผู้ต้องขังจำนวนมาก (${rows} แถว / ${lastHour} ครั้งใน 1 ชั่วโมง)`, link: "/admin/audit?action=export" });
  }
}
