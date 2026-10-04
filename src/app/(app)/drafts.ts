"use server";

import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getAuth } from "@/lib/auth/session";

/** ร่างอัตโนมัติ (ทุก 30 วินาที / ก่อนล็อกหน้าจอ) — เก็บแยกตามเจ้าของ */
export async function saveDraft(key: string, data: unknown) {
  const auth = await getAuth();
  if (!auth) return { ok: false };
  if (key.length > 100) return { ok: false };
  const json = JSON.stringify(data);
  if (json.length > 200_000) return { ok: false };
  getDb()
    .insert(schema.drafts)
    .values({ userId: auth.user.id, key, data, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [schema.drafts.userId, schema.drafts.key], set: { data, updatedAt: new Date() } })
    .run();
  return { ok: true };
}

export async function loadDraft(key: string): Promise<{ data: unknown; updatedAt: number } | null> {
  const auth = await getAuth();
  if (!auth || auth.locked) return null;
  const row = getDb().select().from(schema.drafts).where(and(eq(schema.drafts.userId, auth.user.id), eq(schema.drafts.key, key))).get();
  return row ? { data: row.data, updatedAt: row.updatedAt.getTime() } : null;
}

export async function clearDraft(key: string) {
  const auth = await getAuth();
  if (!auth) return;
  getDb().delete(schema.drafts).where(and(eq(schema.drafts.userId, auth.user.id), eq(schema.drafts.key, key))).run();
}
