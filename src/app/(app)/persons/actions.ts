"use server";

import { revalidatePath } from "next/cache";
import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { writeAudit, diff } from "@/lib/audit";
import { personSearchKey } from "@/lib/search";
import { isValidISODate } from "@/lib/thai-date";
import { isValidNationalId, normalizeNationalId } from "@/lib/thai-id";
import { normalizeInmateNo } from "@/lib/services/registry";

const s = (max: number) => z.string().max(max).nullable().optional().transform((v) => (v?.trim() ? v.trim() : null));
const n = (min: number, max: number) => z.number().int().min(min).max(max).nullable().optional();

const PersonSchema = z.object({
  prefix: s(30),
  firstName: z.string().trim().min(1, "กรุณาใส่ชื่อ").max(100),
  lastName: z.string().trim().min(1, "กรุณาใส่นามสกุล").max(100),
  birthDate: s(10).refine((v) => !v || isValidISODate(v), "วันเกิดไม่ถูกต้อง"),
  gender: s(10),
  maritalStatus: s(50),
  education: s(100),
  occupation: s(100),
  familySize: n(0, 50),
  /** ส่งมาเฉพาะเมื่อต้องการเพิ่ม/แก้เลขบัตร */
  nationalId: s(20),
});

export async function updatePerson(personId: number, version: number, input: z.input<typeof PersonSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("registry.edit");
    const parsed = PersonSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const db = getDb();
    const p = db.select().from(schema.persons).where(eq(schema.persons.id, personId)).get();
    if (!p) return { ok: false, error: "ไม่พบบุคคล" };
    if (p.version !== version) return { ok: false, error: "ข้อมูลถูกแก้ไขโดยผู้ใช้อื่น กรุณาโหลดหน้าใหม่", code: "conflict" };
    const { nationalId, ...rest } = parsed.data;
    const patch: Record<string, unknown> = { ...rest };
    if (nationalId) {
      const nid = normalizeNationalId(nationalId);
      if (!isValidNationalId(nid)) return { ok: false, error: "เลขบัตรประชาชนไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน)" };
      if (p.nationalId && p.nationalId !== nid && !auth.isAdmin) return { ok: false, error: "เลขบัตรที่บันทึกแล้ว แก้ได้เฉพาะผู้ดูแลระบบ" };
      const other = db.select().from(schema.persons).where(and(eq(schema.persons.nationalId, nid), ne(schema.persons.id, personId))).get();
      if (other) return { ok: false, error: `เลขบัตรนี้เป็นของบุคคลอื่นในระบบ (${other.firstName} ${other.lastName}) กรุณาติดต่อผู้ดูแลระบบ` };
      patch.nationalId = nid;
    }
    const d = diff(p as Record<string, unknown>, patch);
    if (!d.changed) return { ok: true, message: "ไม่มีการเปลี่ยนแปลง" };
    db.update(schema.persons)
      .set({ ...patch, searchKey: personSearchKey(rest.firstName, rest.lastName), updatedBy: auth.user.id, updatedAt: new Date(), version: p.version + 1 })
      .where(eq(schema.persons.id, personId))
      .run();
    // ไม่เก็บเลขบัตรเต็มใน audit
    if ("nationalId" in d.after) { d.before.nationalId = d.before.nationalId ? "(เดิม)" : null; d.after.nationalId = "(ใหม่)"; }
    writeAudit(db, { userId: auth.user.id, action: "update", entity: "person", entityId: personId, personId, before: d.before, after: d.after, ip: await clientIp() });
    revalidatePath(`/persons/${personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const IncSchema = z.object({
  admittedDate: s(10).refine((v) => !v || isValidISODate(v), "วันที่ไม่ถูกต้อง"),
  offense: s(300),
  sentenceYears: n(0, 99),
  sentenceMonths: n(0, 11),
  sentenceDays: n(0, 31),
  sentenceStatus: s(50),
  zone: s(50),
  room: s(50),
  prisonerClass: s(50),
});

export async function updateIncarceration(incId: number, version: number, input: z.input<typeof IncSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("registry.edit");
    const parsed = IncSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const db = getDb();
    const i = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, incId)).get();
    if (!i) return { ok: false, error: "ไม่พบข้อมูลการต้องโทษ" };
    if (i.version !== version) return { ok: false, error: "มีผู้อื่นแก้ไขข้อมูลนี้ไปแล้ว — กรุณาโหลดหน้าใหม่", code: "conflict" };
    const d = diff(i as Record<string, unknown>, parsed.data);
    if (!d.changed) return { ok: true, message: "ไม่มีการเปลี่ยนแปลง" };
    db.update(schema.incarcerations).set({ ...parsed.data, updatedBy: auth.user.id, updatedAt: new Date(), version: i.version + 1 }).where(eq(schema.incarcerations.id, incId)).run();
    writeAudit(db, { userId: auth.user.id, action: "update", entity: "incarceration", entityId: incId, personId: i.personId, before: d.before, after: d.after, ip: await clientIp() });
    revalidatePath(`/persons/${i.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** เลขประจำตัวแก้ไม่ได้หลังบันทึก — ยกเว้นผู้ดูแลพร้อมเหตุผล (สเปก 7.1) */
export async function changeInmateNo(incId: number, newNo: string, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("registry.edit_inmate_no");
    if (!reason.trim()) return { ok: false, error: "กรุณาระบุเหตุผลการแก้เลขประจำตัว" };
    const no = normalizeInmateNo(newNo);
    if (!no) return { ok: false, error: "กรุณาใส่เลขประจำตัวใหม่" };
    const db = getDb();
    const i = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, incId)).get();
    if (!i) return { ok: false, error: "ไม่พบข้อมูล" };
    const dup = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.inmateNo, no)).get();
    if (dup) return { ok: false, error: `เลข ${no} มีอยู่แล้วในระบบ` };
    db.update(schema.incarcerations).set({ inmateNo: no, updatedBy: auth.user.id, updatedAt: new Date(), version: i.version + 1 }).where(eq(schema.incarcerations.id, incId)).run();
    writeAudit(db, { userId: auth.user.id, action: "inmate_no.change", entity: "incarceration", entityId: incId, personId: i.personId, before: { inmateNo: i.inmateNo }, after: { inmateNo: no }, note: reason, ip: await clientIp() });
    revalidatePath(`/persons/${i.personId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
