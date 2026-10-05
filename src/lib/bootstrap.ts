import { and, desc, eq } from "drizzle-orm";
import type { DB } from "./db";
import { schema } from "./db";
import { COURSES, B12_TEMPLATE, LOOKUPS, DEFAULT_HOLIDAYS, DEFAULT_SETTINGS } from "./reference-data";
import { FORM_DEFS } from "./assessments/forms";

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
    for (const f of FORM_DEFS) {
      const existing = tx.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.code, f.code)).get();
      if (existing) {
        upgradeDefaultForm(tx, existing.id, f);
        continue;
      }
      const form = tx
        .insert(schema.assessmentForms)
        .values({ code: f.code, name: f.name, shortName: f.shortName, category: f.category, kind: f.kind, sensitive: f.sensitive, rounds: f.rounds, courseCodes: f.courseCodes, description: f.description ?? null, sortOrder: f.sortOrder })
        .returning()
        .get();
      tx.insert(schema.assessmentFormVersions).values({ formId: form.id, version: 1, items: f.items, scoring: f.scoring, effectiveFrom: "2000-01-01", note: defaultNote(f.rev) }).run();
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

/** หมายเหตุของเวอร์ชันที่ระบบสร้าง — ใช้รู้ว่าเวอร์ชันล่าสุดยังเป็นค่าเริ่มต้น (ผู้ดูแลยังไม่ได้แก้) */
const DEFAULT_NOTE = "ค่าเริ่มต้นระบบ";
const defaultNote = (rev: number) => `${DEFAULT_NOTE} rev ${rev}`;
function noteRev(note: string | null): number | null {
  if (note === "ค่าเริ่มต้นจากสเปก") return 1; // เวอร์ชันแรกของขั้น 2
  const m = note?.match(/^ค่าเริ่มต้นระบบ rev (\d+)/);
  return m ? Number(m[1]) : null;
}

/**
 * เนื้อหาค่าเริ่มต้นของแบบประเมินถูกปรับ (rev สูงขึ้น) → สร้างเวอร์ชันใหม่ให้ฐานข้อมูลที่ติดตั้งแล้ว
 * - ทำเฉพาะเมื่อเวอร์ชันล่าสุดยังเป็นค่าเริ่มต้นของระบบ (ถ้าผู้ดูแลแก้เองแล้ว ไม่ทับ)
 * - วันเริ่มใช้เท่ากับเวอร์ชันเดิม: เปลี่ยนเฉพาะข้อความ/ป้าย คะแนนเดิมไม่เปลี่ยน ผลเก่ายังผูกกับเวอร์ชันเดิม
 */
function upgradeDefaultForm(tx: Pick<DB, "select" | "insert">, formId: number, f: (typeof FORM_DEFS)[number]) {
  const latest = tx.select().from(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.formId, formId)).orderBy(desc(schema.assessmentFormVersions.version)).get();
  if (!latest) return;
  const rev = noteRev(latest.note);
  if (rev == null || rev >= f.rev) return;
  tx.insert(schema.assessmentFormVersions).values({ formId, version: latest.version + 1, items: f.items, scoring: f.scoring, effectiveFrom: latest.effectiveFrom, note: `${defaultNote(f.rev)} — ข้อความจากแบบฟอร์มจริง` }).run();
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
