"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { parseWorkbook, checkRows, commitRows, type CheckedRow } from "@/lib/services/import";
import { toError, type ActionResult } from "@/lib/action-result";
import { importCache } from "@/lib/import-cache";
import { writeAudit } from "@/lib/audit";

export type PreviewRow = Pick<CheckedRow, "rowNo" | "inmateNo" | "prefix" | "firstName" | "lastName" | "status" | "category" | "reasons">;

/** ขั้นตรวจ: อ่านไฟล์ → ตรวจทุกแถว → เก็บผลไว้ฝั่งเซิร์ฟเวอร์ (ไม่เชื่อข้อมูลจากหน้าจอตอนนำเข้า) */
export async function previewImport(formData: FormData): Promise<ActionResult<{ token: string; rows: PreviewRow[] }>> {
  try {
    const auth = await requireAction("registry.import");
    const cohortId = Number(formData.get("cohortId"));
    const file = formData.get("file");
    if (!cohortId) return { ok: false, error: "กรุณาเลือกรุ่น" };
    if (!(file instanceof File) || !file.size) return { ok: false, error: "กรุณาเลือกไฟล์ Excel (.xlsx)" };
    if (!file.name.toLowerCase().endsWith(".xlsx")) return { ok: false, error: "รองรับเฉพาะไฟล์ .xlsx (ถ้าเป็น .xls ให้เปิดใน Excel แล้ว \"บันทึกเป็น\" .xlsx)" };
    if (file.size > 5 * 1024 * 1024) return { ok: false, error: "ไฟล์ใหญ่เกิน 5 MB" };
    const raw = await parseWorkbook(Buffer.from(await file.arrayBuffer()));
    if (!raw.length) return { ok: false, error: "ไม่พบข้อมูลในไฟล์ (แถวแรกต้องเป็นหัวตารางตามแม่แบบ)" };
    const rows = checkRows(getDb(), cohortId, raw);
    const token = randomUUID();
    importCache.set(token, { userId: auth.user.id, cohortId, fileName: file.name, rows, at: Date.now() });
    return { ok: true, data: { token, rows: rows.map(({ rowNo, inmateNo, prefix, firstName, lastName, status, category, reasons }) => ({ rowNo, inmateNo, prefix, firstName, lastName, status, category, reasons })) } };
  } catch (e) {
    return toError(e);
  }
}

export async function commitImport(token: string): Promise<ActionResult<{ imported: number }>> {
  try {
    const auth = await requireAction("registry.import");
    const entry = importCache.get(token);
    if (!entry || entry.userId !== auth.user.id) return { ok: false, error: "ผลตรวจหมดอายุแล้ว กรุณาเลือกไฟล์และตรวจใหม่" };
    const db = getDb();
    // ตรวจซ้ำอีกครั้งตอนนำเข้า (เผื่อมีคนลงทะเบียนเพิ่มระหว่างนั้น)
    const recheck = checkRows(db, entry.cohortId, entry.rows);
    const r = commitRows(db, entry.cohortId, recheck, auth.user.id, entry.fileName);
    writeAudit(db, { userId: auth.user.id, action: "import.commit", entity: "cohort", entityId: entry.cohortId, note: entry.fileName, ip: await clientIp() });
    importCache.delete(token);
    revalidatePath(`/cohorts/${entry.cohortId}`);
    return { ok: true, data: { imported: r.imported } };
  } catch (e) {
    return toError(e);
  }
}
