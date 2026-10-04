import type { CheckedRow } from "./services/import";

type Entry = { userId: number; cohortId: number; fileName: string; rows: CheckedRow[]; at: number };

/** ผลตรวจไฟล์นำเข้า เก็บในหน่วยความจำ 30 นาที */
const g = globalThis as unknown as { __rehabImport?: Map<string, Entry> };
const map = (g.__rehabImport ??= new Map());

export const importCache = {
  set(token: string, e: Entry) {
    for (const [k, v] of map) if (Date.now() - v.at > 30 * 60000) map.delete(k);
    map.set(token, e);
  },
  get(token: string): Entry | undefined {
    const e = map.get(token);
    if (e && Date.now() - e.at > 30 * 60000) {
      map.delete(token);
      return undefined;
    }
    return e;
  },
  delete(token: string) {
    map.delete(token);
  },
};
