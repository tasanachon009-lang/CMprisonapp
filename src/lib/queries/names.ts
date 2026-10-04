import type { DB } from "../db";
import { schema } from "../db";

/** แผนที่ id ผู้ใช้ → ชื่อ (สำหรับ "บันทึกโดย ...") */
export function userNameMap(db: DB): Map<number, string> {
  return new Map(
    db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).all().map((u) => [u.id, `${u.f} ${u.l}`]),
  );
}

export function fullName(p: { prefix?: string | null; firstName: string; lastName: string }) {
  return `${p.prefix ?? ""}${p.firstName} ${p.lastName}`;
}
