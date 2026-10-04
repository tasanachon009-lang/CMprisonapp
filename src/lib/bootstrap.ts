import { and, eq } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";
import { COURSES, B12_TEMPLATE, LOOKUPS, DEFAULT_HOLIDAYS, DEFAULT_SETTINGS } from "./reference-data";

/**
 * ใส่ข้อมูลอ้างอิงเริ่มต้น (ทำซ้ำได้ ไม่ทับค่าที่ผู้ใช้แก้แล้ว)
 * ใช้ทั้งตอนติดตั้งจริง (install.ps1) และตอน seed ข้อมูลปลอม
 */
export function bootstrapReferenceData(db: DB) {
  db.transaction((tx) => {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      tx.insert(schema.settings).values({ key, value }).onConflictDoNothing().run();
    }
    for (const [category, items] of Object.entries(LOOKUPS)) {
      items.forEach(([code, label], i) => {
        tx.insert(schema.lookups).values({ category, code, label, sortOrder: (i + 1) * 10 }).onConflictDoNothing().run();
      });
    }
    for (const [date, name] of DEFAULT_HOLIDAYS) {
      tx.insert(schema.holidays).values({ date, name }).onConflictDoNothing().run();
    }
    for (const c of COURSES) {
      const existing = tx.select().from(schema.courses).where(eq(schema.courses.code, c.code)).get();
      if (existing) continue;
      const row = tx
        .insert(schema.courses)
        .values({ ...c, intakeCriteria: c.intakeCriteria as unknown })
        .returning()
        .get();
      if (c.code === "B12") {
        for (const t of B12_TEMPLATE) {
          tx.insert(schema.courseTemplateSessions).values({ courseId: row.id, ...t }).run();
        }
      }
    }
  });
}

export function getSetting<T>(db: DB, key: string, fallback: T): T {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  return (row?.value as T) ?? fallback;
}

export function setSetting(db: DB, key: string, value: unknown, userId: number | null) {
  db.insert(schema.settings)
    .values({ key, value, updatedBy: userId, updatedAt: new Date() })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value, updatedBy: userId, updatedAt: new Date() } })
    .run();
}

export function lookupLabel(db: DB, category: string, code: string | null | undefined): string {
  if (!code) return "-";
  const row = db
    .select()
    .from(schema.lookups)
    .where(and(eq(schema.lookups.category, category), eq(schema.lookups.code, code)))
    .get();
  return row?.label ?? code;
}
