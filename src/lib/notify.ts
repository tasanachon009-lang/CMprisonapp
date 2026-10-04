import type { DB } from "./db";
import { schema } from "./db";

/** แจ้งเตือนในระบบ — ห้ามใส่ข้อมูลผู้ต้องขังในข้อความที่อาจส่งออกนอกระบบ (LINE) */
export function notify(
  db: Pick<DB, "insert">,
  n: { role?: string; userId?: number; severity?: "info" | "warning" | "danger"; kind: string; message: string; link?: string },
) {
  db.insert(schema.notifications)
    .values({
      createdAt: new Date(),
      role: n.role ?? null,
      userId: n.userId ?? null,
      severity: n.severity ?? "info",
      kind: n.kind,
      message: n.message,
      link: n.link ?? null,
    })
    .run();
}
