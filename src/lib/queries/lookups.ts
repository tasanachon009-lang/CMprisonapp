import { and, asc, eq, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";

export function lookupsOf(db: DB, category: string) {
  return db
    .select({ code: schema.lookups.code, label: schema.lookups.label })
    .from(schema.lookups)
    .where(and(eq(schema.lookups.category, category), eq(schema.lookups.active, true), isNull(schema.lookups.deletedAt)))
    .orderBy(asc(schema.lookups.sortOrder))
    .all();
}
