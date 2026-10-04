import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import { config } from "../config";

export type DB = BetterSQLite3Database<typeof schema>;

/** เปิดฐานข้อมูลพร้อมค่าที่รองรับหลายคนใช้พร้อมกัน (WAL + busy_timeout) */
export function openDatabase(file: string) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("busy_timeout = 5000");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("synchronous = NORMAL");
  return sqlite;
}

export function runMigrations(db: DB) {
  migrate(db, { migrationsFolder: path.resolve(process.cwd(), "drizzle") });
}

// ใช้ตัวเดียวทั้งโปรแกรม (กันเปิดซ้ำตอน dev hot reload)
const g = globalThis as unknown as { __rehabSqlite?: Database.Database; __rehabDb?: DB };

export function getSqlite(): Database.Database {
  if (!g.__rehabSqlite) {
    g.__rehabSqlite = openDatabase(config.dbPath);
    g.__rehabDb = drizzle(g.__rehabSqlite, { schema });
    runMigrations(g.__rehabDb);
  }
  return g.__rehabSqlite;
}

export function getDb(): DB {
  getSqlite();
  return g.__rehabDb!;
}

/** ปิดฐานข้อมูล (ใช้ตอนกู้คืน) */
export function closeDb() {
  g.__rehabSqlite?.close();
  g.__rehabSqlite = undefined;
  g.__rehabDb = undefined;
}

export { schema };
