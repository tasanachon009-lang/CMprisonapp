"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { writeAudit, diff } from "@/lib/audit";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkPassword } from "@/lib/password-policy";
import { DEFAULT_ROLES_BY_PROFESSION, PERMISSIONS } from "@/lib/auth/permissions";
import { setRoles, requestDual, approveDual, rejectDual, executeAdminChange, activeAdminIds, MAX_ADMINS, type DualAction } from "@/lib/services/admin";
import { getSetting, setSetting } from "@/lib/bootstrap";
import { runBackup, restoreFromBackup, runRestoreTest } from "@/lib/backup/runner";
import { isValidISODate } from "@/lib/thai-date";
import { RuleError } from "@/lib/services/registry";

const UserSchema = z.object({
  prefix: z.string().max(30).nullable(),
  firstName: z.string().trim().min(1, "กรุณาใส่ชื่อ").max(100),
  lastName: z.string().trim().min(1, "กรุณาใส่นามสกุล").max(100),
  nickname: z.string().max(50).nullable(),
  position: z.string().max(200).nullable(),
  profession: z.string().max(40),
  level: z.enum(["executive", "lead", "staff"]),
  titleLabel: z.string().max(100).nullable(),
  sortOrder: z.number().int().min(0).max(9999),
});

export async function createUser(input: z.input<typeof UserSchema> & { tempPassword: string }): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("users.manage");
    const parsed = UserSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const problem = checkPassword(input.tempPassword, parsed.data);
    if (problem) return { ok: false, error: `รหัสผ่านชั่วคราว: ${problem}` };
    const db = getDb();
    const u = db.insert(schema.users).values({ ...parsed.data, passwordHash: await hashPassword(input.tempPassword), mustChangePassword: true, createdBy: auth.user.id, updatedBy: auth.user.id }).returning().get();
    for (const r of DEFAULT_ROLES_BY_PROFESSION[parsed.data.profession] ?? []) db.insert(schema.userRoles).values({ userId: u.id, role: r, createdBy: auth.user.id }).run();
    writeAudit(db, { userId: auth.user.id, action: "create", entity: "user", entityId: u.id, after: { ...parsed.data, roles: DEFAULT_ROLES_BY_PROFESSION[parsed.data.profession] }, ip: await clientIp() });
    revalidatePath("/admin/users");
    return { ok: true, data: { id: u.id } };
  } catch (e) {
    return toError(e);
  }
}

export async function updateUser(id: number, input: z.input<typeof UserSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const parsed = UserSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const db = getDb();
    const u = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!u) return { ok: false, error: "ไม่พบผู้ใช้" };
    const d = diff(u as Record<string, unknown>, parsed.data);
    db.update(schema.users).set({ ...parsed.data, updatedBy: auth.user.id, updatedAt: new Date(), version: u.version + 1 }).where(eq(schema.users.id, id)).run();
    if (d.changed) writeAudit(db, { userId: auth.user.id, action: "update", entity: "user", entityId: id, before: d.before, after: d.after, ip: await clientIp() });
    revalidatePath(`/admin/users/${id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function setUserRoles(id: number, roles: string[]): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    setRoles(getDb(), id, roles, auth.user.id, await clientIp());
    revalidatePath(`/admin/users/${id}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** รีเซ็ตรหัส: ผู้ดูแลตั้งรหัสชั่วคราว ผู้ใช้ต้องเปลี่ยนเมื่อเข้าครั้งถัดไป */
export async function resetPassword(id: number, tempPassword: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const db = getDb();
    const u = db.select().from(schema.users).where(eq(schema.users.id, id)).get();
    if (!u) return { ok: false, error: "ไม่พบผู้ใช้" };
    if (activeAdminIds(db).includes(id) && id !== auth.user.id) return { ok: false, error: "รหัสของผู้ดูแลอีกคน ให้เจ้าตัวเปลี่ยนเอง (หรือใช้ขั้นตอนรหัสฉุกเฉินใน README)" };
    const problem = checkPassword(tempPassword, u);
    if (problem) return { ok: false, error: problem };
    db.update(schema.users).set({ passwordHash: await hashPassword(tempPassword), mustChangePassword: true, failedAttempts: 0, lockedUntil: null, updatedBy: auth.user.id, updatedAt: new Date() }).where(eq(schema.users.id, id)).run();
    // ออกจากระบบทุกเครื่องของผู้ใช้นั้น
    db.update(schema.sessions).set({ endedAt: new Date() }).where(eq(schema.sessions.userId, id)).run();
    writeAudit(db, { userId: auth.user.id, action: "password.reset", entity: "user", entityId: id, ip: await clientIp() });
    return { ok: true, message: "รีเซ็ตแล้ว แจ้งรหัสชั่วคราวให้เจ้าตัวโดยตรง (ห้ามส่งทาง LINE)" };
  } catch (e) {
    return toError(e);
  }
}

/** รีเซ็ต OTP ของผู้ดูแลอีกคน (โทรศัพท์หาย) — ผู้นั้นต้องตั้ง OTP ใหม่เมื่อเข้าครั้งถัดไป (ยังต้องใช้รหัสผ่าน) */
export async function resetOtp(id: number, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    if (id === auth.user.id) return { ok: false, error: "รีเซ็ต OTP ของตัวเองไม่ได้ — ให้ผู้ดูแลอีกคนทำ หรือใช้ขั้นตอนรหัสฉุกเฉิน" };
    if (!reason.trim()) return { ok: false, error: "กรุณาระบุเหตุผล" };
    const db = getDb();
    db.update(schema.users).set({ totpSecret: null, totpEnabled: false, updatedBy: auth.user.id, updatedAt: new Date() }).where(eq(schema.users.id, id)).run();
    db.update(schema.sessions).set({ endedAt: new Date() }).where(eq(schema.sessions.userId, id)).run();
    writeAudit(db, { userId: auth.user.id, action: "otp.reset", entity: "user", entityId: id, note: reason, ip: await clientIp() });
    return { ok: true, message: "รีเซ็ตแล้ว — เมื่อผู้นั้นเข้าระบบครั้งถัดไป จะต้องสแกน QR ตั้ง OTP ใหม่" };
  } catch (e) {
    return toError(e);
  }
}

/** ระงับบัญชีได้ทันที (ไม่ลบ เพื่อเก็บประวัติ) */
export async function setUserStatus(id: number, status: "active" | "suspended", reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const db = getDb();
    if (id === auth.user.id) return { ok: false, error: "ระงับบัญชีตัวเองไม่ได้" };
    if (status === "suspended" && activeAdminIds(db).includes(id)) return { ok: false, error: "บัญชีผู้ดูแล ต้องถอนสิทธิ์ผู้ดูแลก่อน (ยืนยัน 2 คน)" };
    if (status === "suspended" && !reason.trim()) return { ok: false, error: "กรุณาระบุเหตุผลการระงับ" };
    db.update(schema.users).set({ status, suspendedReason: status === "suspended" ? reason : null, updatedBy: auth.user.id, updatedAt: new Date() }).where(eq(schema.users.id, id)).run();
    if (status === "suspended") db.update(schema.sessions).set({ endedAt: new Date() }).where(eq(schema.sessions.userId, id)).run();
    writeAudit(db, { userId: auth.user.id, action: status === "suspended" ? "user.suspend" : "user.reactivate", entity: "user", entityId: id, note: reason, ip: await clientIp() });
    revalidatePath(`/admin/users`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const GrantSchema = z.object({
  permission: z.string().refine((p) => p in PERMISSIONS, "สิทธิ์ไม่ถูกต้อง"),
  allow: z.boolean(),
  scope: z.string().regex(/^cohort:\d+$/).nullable(),
  validFrom: z.string().nullable().refine((v) => !v || isValidISODate(v)),
  validTo: z.string().nullable().refine((v) => !v || isValidISODate(v)),
  reason: z.string().max(500),
});

export async function addGrant(userId: number, input: z.input<typeof GrantSchema>): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const parsed = GrantSchema.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    if (["users.manage", "settings.manage", "backup.manage", "audit.view"].includes(parsed.data.permission) && parsed.data.allow) {
      return { ok: false, error: "สิทธิ์ระดับผู้ดูแลระบบให้รายคนไม่ได้ — ใช้การให้สิทธิ์ผู้ดูแล (ยืนยัน 2 คน)" };
    }
    const db = getDb();
    db.insert(schema.permissionGrants).values({ userId, ...parsed.data, createdBy: auth.user.id, updatedBy: auth.user.id }).run();
    writeAudit(db, { userId: auth.user.id, action: "permission.change", entity: "user", entityId: userId, after: parsed.data, ip: await clientIp() });
    revalidatePath(`/admin/users/${userId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function revokeGrant(grantId: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const db = getDb();
    const g = db.select().from(schema.permissionGrants).where(eq(schema.permissionGrants.id, grantId)).get();
    if (!g) return { ok: false, error: "ไม่พบรายการ" };
    db.update(schema.permissionGrants).set({ revokedAt: new Date(), revokedBy: auth.user.id }).where(eq(schema.permissionGrants.id, grantId)).run();
    writeAudit(db, { userId: auth.user.id, action: "permission.change", entity: "user", entityId: g.userId, before: { permission: g.permission, allow: g.allow, scope: g.scope }, after: { revoked: true }, ip: await clientIp() });
    revalidatePath(`/admin/users/${g.userId}`);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

// ───────── ยืนยัน 2 คน ─────────
export async function requestDualAction(action: DualAction, payload: Record<string, unknown>, reason: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const db = getDb();
    if (action === "grant_admin" && activeAdminIds(db).length >= MAX_ADMINS) return { ok: false, error: `ผู้ดูแลระบบมีได้ไม่เกิน ${MAX_ADMINS} คน — ถอนสิทธิ์คนเดิมก่อน` };
    requestDual(db, action, payload, reason, auth.user.id, await clientIp());
    revalidatePath("/admin/approvals");
    return { ok: true, message: "ส่งคำขอแล้ว รอผู้ดูแลอีกคนกดยืนยัน" };
  } catch (e) {
    return toError(e);
  }
}

export async function approveDualAction(id: number, emergencyCode?: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    const db = getDb();
    let emergency = false;
    if (emergencyCode) {
      const hash = getSetting<string | null>(db, "auth.emergencyCodeHash", null);
      if (!hash || !(await verifyPassword(hash, emergencyCode))) return { ok: false, error: "รหัสฉุกเฉินไม่ถูกต้อง" };
      emergency = true;
      // ใช้แล้วต้องเปลี่ยนใหม่ทันที
      setSetting(db, "auth.emergencyCodeHash", null, auth.user.id);
      setSetting(db, "auth.emergencyCodeUsedAt", Date.now(), auth.user.id);
    }
    const row = approveDual(db, id, auth.user.id, { emergency, ip: await clientIp() });
    if (row.action === "restore") {
      const file = (row.payload as { file: string }).file;
      // หลังกู้คืน ฐานข้อมูลถูกแทนที่ (คำขอนี้อาจไม่มีในไฟล์เก่า) — ประวัติการกู้คืนบันทึกในฐานใหม่โดย restoreFromBackup
      const r = await restoreFromBackup(file, auth.user.id);
      return { ok: true, message: `กู้คืนสำเร็จ — ข้อมูลก่อนกู้ถูกสำรองไว้ที่ ${r.preBackup} กรุณาให้ทุกคนโหลดหน้าใหม่` };
    } else {
      executeAdminChange(db, row, auth.user.id);
    }
    revalidatePath("/admin");
    return { ok: true, message: emergency ? "ทำรายการแล้ว — รหัสฉุกเฉินถูกยกเลิก ต้องสร้างรหัสใหม่และพิมพ์ใส่ซองปิดผนึก" : "ยืนยันและทำรายการแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

export async function rejectDualAction(id: number): Promise<ActionResult> {
  try {
    const auth = await requireAction("users.manage");
    rejectDual(getDb(), id, auth.user.id, await clientIp());
    revalidatePath("/admin/approvals");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** สร้างรหัสฉุกเฉินใหม่ (แสดงครั้งเดียว ให้พิมพ์ใส่ซองปิดผนึก) */
export async function regenerateEmergencyCode(): Promise<ActionResult<string>> {
  try {
    const auth = await requireAction("users.manage");
    const { randomBytes } = await import("node:crypto");
    const code = randomBytes(12).toString("base64url").replace(/[-_]/g, "x").slice(0, 16).replace(/(.{4})(?=.)/g, "$1-");
    const db = getDb();
    setSetting(db, "auth.emergencyCodeHash", await hashPassword(code), auth.user.id);
    setSetting(db, "auth.emergencyCodeCreatedAt", Date.now(), auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "emergency_code.regenerate", ip: await clientIp() });
    return { ok: true, data: code };
  } catch (e) {
    return toError(e);
  }
}

// ───────── สำรองข้อมูล ─────────
export async function backupNow(kind: "manual" | "removable"): Promise<ActionResult<{ name: string }>> {
  try {
    const auth = await requireAction("backup.manage");
    const r = await runBackup(kind, auth.user.id);
    revalidatePath("/admin/backup");
    if (!r.ok) return { ok: false, error: r.error };
    return { ok: true, data: { name: r.name } };
  } catch (e) {
    return toError(e);
  }
}

export async function restoreTestNow(): Promise<ActionResult> {
  try {
    await requireAction("backup.manage");
    const r = await runRestoreTest();
    revalidatePath("/admin/backup");
    return r.ok ? { ok: true, message: "ทดสอบกู้คืนผ่าน — จำนวนข้อมูลตรงกัน" } : { ok: false, error: "error" in r ? String(r.error) : `จำนวนข้อมูลไม่ตรง: ${r.mismatch?.join(", ")}` };
  } catch (e) {
    return toError(e);
  }
}

export async function saveBackupDirs(externalDir: string, removableDir: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("backup.manage");
    const db = getDb();
    for (const d of [externalDir, removableDir]) if (d && !/^[a-zA-Z]:\\|^\\\\|^\//.test(d)) throw new RuleError(`ตำแหน่ง "${d}" ไม่ถูกต้อง ใส่เป็นเส้นทางเต็ม เช่น E:\\RehabBackup`);
    setSetting(db, "backup.externalDir", externalDir.trim(), auth.user.id);
    setSetting(db, "backup.removableDir", removableDir.trim(), auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "backup", after: { externalDir, removableDir }, ip: await clientIp() });
    revalidatePath("/admin/backup");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

// ───────── ตั้งค่า ─────────
export async function saveSettings(values: Record<string, unknown>): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    const allowed = ["org.name", "org.unitName", "org.type", "org.address", "org.phone", "org.headTitle", "pdpa.consentRequired", "security.idleLockMinutes", "security.officeHours"];
    const db = getDb();
    const before: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(values)) {
      if (!allowed.includes(k)) continue;
      if (k === "security.idleLockMinutes" && (typeof v !== "number" || v < 5 || v > 15)) throw new RuleError("เวลาล็อกอัตโนมัติต้องอยู่ระหว่าง 5–15 นาที");
      before[k] = getSetting(db, k, null);
      setSetting(db, k, v, auth.user.id);
    }
    writeAudit(db, { userId: auth.user.id, action: "settings.change", before, after: values, ip: await clientIp() });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function changeOrgCode(newCode: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    if (newCode.length < 8) return { ok: false, error: "รหัสหน่วยงานต้องยาวอย่างน้อย 8 ตัว" };
    const db = getDb();
    setSetting(db, "auth.orgCodeHash", await hashPassword(newCode), auth.user.id);
    // บังคับทุกเครื่องใส่รหัสใหม่
    db.update(schema.trustedDevices).set({ revokedAt: new Date() }).run();
    writeAudit(db, { userId: auth.user.id, action: "org_code.change", ip: await clientIp() });
    return { ok: true, message: "เปลี่ยนแล้ว ทุกเครื่อง (รวมเครื่องนี้) ต้องใส่รหัสหน่วยงานใหม่ในการเข้าครั้งถัดไป" };
  } catch (e) {
    return toError(e);
  }
}

export async function addHoliday(date: string, name: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    if (!isValidISODate(date) || !name.trim()) return { ok: false, error: "กรุณาใส่วันที่และชื่อวันหยุด" };
    const db = getDb();
    db.insert(schema.holidays).values({ date, name: name.trim(), createdBy: auth.user.id }).onConflictDoUpdate({ target: schema.holidays.date, set: { name: name.trim() } }).run();
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "holiday", entityId: date, after: { name }, ip: await clientIp() });
    revalidatePath("/admin/settings");
    return { ok: true, message: "เพิ่มแล้ว — มีผลกับรุ่นที่สร้างใหม่ (รุ่นเดิมไม่เปลี่ยนวัน)" };
  } catch (e) {
    return toError(e);
  }
}

export async function removeHoliday(date: string): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    const db = getDb();
    db.delete(schema.holidays).where(eq(schema.holidays.date, date)).run();
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "holiday", entityId: date, after: { removed: true }, ip: await clientIp() });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function saveLookup(category: string, code: string, label: string, active: boolean): Promise<ActionResult> {
  try {
    const auth = await requireAction("settings.manage");
    if (!/^[a-z_]+$/.test(category) || !label.trim()) return { ok: false, error: "ข้อมูลไม่ครบ" };
    const db = getDb();
    const c = code.trim() || `custom_${Date.now()}`;
    db.insert(schema.lookups).values({ category, code: c, label: label.trim(), active, createdBy: auth.user.id, updatedBy: auth.user.id })
      .onConflictDoUpdate({ target: [schema.lookups.category, schema.lookups.code], set: { label: label.trim(), active, updatedBy: auth.user.id, updatedAt: new Date() } })
      .run();
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "lookup", entityId: `${category}:${c}`, after: { label, active }, ip: await clientIp() });
    revalidatePath("/admin/settings");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const BandZ = z.object({ min: z.number(), max: z.number(), label: z.string().min(1).max(200), tone: z.enum(["ok", "warn", "danger"]), alert: z.object({ severity: z.enum(["warning", "danger"]), message: z.string().max(300) }).optional() });
const ItemZ = z.object({ no: z.number().int(), text: z.string().min(1).max(1000), help: z.string().max(1000).optional(), reverse: z.boolean().optional(), correct: z.boolean().optional(), weight: z.number().optional(), group: z.string().max(100).optional() });

/** คลังแบบประเมิน: บันทึกเป็นเวอร์ชันใหม่ (ผลเก่ายังใช้เกณฑ์เดิมที่แช่แข็งไว้) */
export async function saveFormVersion(formId: number, items: unknown, bands: unknown, effectiveFrom: string, note: string): Promise<ActionResult<{ version: number }>> {
  try {
    const auth = await requireAction("forms.manage");
    if (!isValidISODate(effectiveFrom)) return { ok: false, error: "กรุณาใส่วันที่เริ่มใช้" };
    const db = getDb();
    const form = db.select().from(schema.assessmentForms).where(eq(schema.assessmentForms.id, formId)).get();
    if (!form) return { ok: false, error: "ไม่พบแบบประเมิน" };
    const latest = db.select().from(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.formId, formId)).all().sort((a, b) => b.version - a.version)[0];
    const pi = z.array(ItemZ).max(200).safeParse(items);
    if (!pi.success) return { ok: false, error: "ข้อคำถามไม่ถูกต้อง: ทุกข้อต้องมีข้อความ" };
    const scoring = { ...(latest.scoring as Record<string, unknown>) };
    if (bands != null) {
      const pb = z.array(BandZ).max(20).safeParse(bands);
      if (!pb.success) return { ok: false, error: "เกณฑ์แปลผลไม่ถูกต้อง" };
      const sorted = [...pb.data].sort((a, b) => a.min - b.min);
      for (let i = 0; i < sorted.length; i++) {
        if (sorted[i].min > sorted[i].max) return { ok: false, error: `ช่วง "${sorted[i].label}" ค่าต่ำสุดมากกว่าค่าสูงสุด` };
        if (i > 0 && sorted[i].min <= sorted[i - 1].max) return { ok: false, error: `ช่วงคะแนน "${sorted[i - 1].label}" กับ "${sorted[i].label}" ซ้อนกัน` };
      }
      scoring.bands = sorted;
    }
    const version = latest.version + 1;
    db.insert(schema.assessmentFormVersions).values({ formId, version, items: pi.data, scoring, effectiveFrom, note: note || null, createdBy: auth.user.id }).run();
    writeAudit(db, { userId: auth.user.id, action: "forms.version", entity: "assessment_form", entityId: formId, after: { version, effectiveFrom }, note, ip: await clientIp() });
    revalidatePath("/admin/forms");
    return { ok: true, data: { version } };
  } catch (e) {
    return toError(e);
  }
}

export async function markNotificationsRead(ids: number[]): Promise<ActionResult> {
  try {
    const auth = await requireAction();
    const db = getDb();
    for (const id of ids.slice(0, 500)) {
      const n = db.select().from(schema.notifications).where(eq(schema.notifications.id, id)).get();
      if (!n) continue;
      if (n.userId !== auth.user.id && !(n.role && auth.user.roles.includes(n.role))) continue;
      db.update(schema.notifications).set({ readAt: new Date(), readBy: auth.user.id }).where(eq(schema.notifications.id, id)).run();
    }
    revalidatePath("/notifications");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
