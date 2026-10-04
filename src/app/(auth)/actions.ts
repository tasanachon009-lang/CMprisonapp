"use server";

import { redirect } from "next/navigation";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { checkPassword } from "@/lib/password-policy";
import { writeAudit } from "@/lib/audit";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";
import { nowInTZ } from "@/lib/thai-date";
import {
  clientIp, createSession, endSession, getAuth, getTrustedDeviceId, trustThisDevice, touchSession,
} from "@/lib/auth/session";

export type FormState = { error?: string; ok?: boolean } | undefined;

// ───────── ชั้นที่ 1: รหัสหน่วยงาน ─────────
export async function verifyOrgCode(_: FormState, formData: FormData): Promise<FormState> {
  const code = String(formData.get("code") ?? "").trim();
  const ip = (await clientIp()) ?? "unknown";
  if (!rateLimit(`org:${ip}`, 10, 15 * 60000)) {
    return { error: "ลองผิดหลายครั้งเกินไป กรุณารอ 15 นาทีแล้วลองใหม่" };
  }
  const db = getDb();
  const hash = getSetting<string | null>(db, "auth.orgCodeHash", null);
  if (!hash) return { error: "ระบบยังไม่ได้ตั้งรหัสหน่วยงาน กรุณาให้ผู้ดูแลรันสคริปต์ติดตั้ง" };
  if (!code || !(await verifyPassword(hash, code))) {
    writeAudit(db, { userId: null, action: "device.fail", ip });
    return { error: "รหัสหน่วยงานไม่ถูกต้อง กรุณาตรวจสอบกับหัวหน้า/รองหัวหน้า" };
  }
  await trustThisDevice();
  writeAudit(db, { userId: null, action: "device.trust", ip });
  redirect("/login");
}

// ───────── ชั้นที่ 2: รหัสผ่านประจำตัว ─────────
export async function login(_: FormState, formData: FormData): Promise<FormState> {
  const deviceId = await getTrustedDeviceId();
  if (!deviceId) redirect("/device");
  const userId = Number(formData.get("userId"));
  const password = String(formData.get("password") ?? "");
  const ip = await clientIp();
  const db = getDb();
  const maxFail = getSetting(db, "security.maxFailedAttempts", 5);
  const lockMin = getSetting(db, "security.lockoutMinutes", 15);

  const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!u || u.status !== "active" || u.deletedAt) return { error: "ไม่พบบัญชีนี้ หรือบัญชีถูกระงับ กรุณาติดต่อหัวหน้า/รองหัวหน้า" };

  if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
    const mins = Math.ceil((u.lockedUntil.getTime() - Date.now()) / 60000);
    return { error: `บัญชีถูกล็อกชั่วคราวเพราะใส่รหัสผิดหลายครั้ง กรุณารออีก ${mins} นาที หรือให้ผู้ดูแลรีเซ็ตรหัส` };
  }

  if (!(await verifyPassword(u.passwordHash, password))) {
    const fails = u.failedAttempts + 1;
    const lock = fails >= maxFail;
    db.update(schema.users)
      .set({ failedAttempts: lock ? 0 : fails, lockedUntil: lock ? new Date(Date.now() + lockMin * 60000) : null })
      .where(eq(schema.users.id, u.id))
      .run();
    writeAudit(db, { userId: u.id, action: "login.fail", ip, note: lock ? "ล็อกบัญชีชั่วคราว" : `ผิดครั้งที่ ${fails}` });
    if (lock) {
      notify(db, { role: "admin", severity: "warning", kind: "login_lockout", message: `บัญชี ${u.firstName} ${u.lastName} ใส่รหัสผ่านผิด ${maxFail} ครั้ง ถูกล็อก ${lockMin} นาที`, link: "/admin/audit" });
      return { error: `ใส่รหัสผ่านผิด ${maxFail} ครั้ง บัญชีถูกล็อก ${lockMin} นาที` };
    }
    return { error: `รหัสผ่านไม่ถูกต้อง (เหลืออีก ${maxFail - fails} ครั้งก่อนล็อก) — ลืมรหัส ให้ติดต่อหัวหน้า/รองหัวหน้าเพื่อรีเซ็ต` };
  }

  db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null, lastLoginAt: new Date() }).where(eq(schema.users.id, u.id)).run();
  await createSession(u.id, deviceId);
  writeAudit(db, { userId: u.id, action: "login.success", ip });

  // เข้านอกเวลาราชการ → แจ้งผู้ดูแล
  const t = nowInTZ();
  const office = getSetting(db, "security.officeHours", { start: "07:00", end: "18:00" });
  const hm = `${String(t.hour).padStart(2, "0")}:${String(t.minute).padStart(2, "0")}`;
  if (t.weekday === 0 || t.weekday === 6 || hm < office.start || hm > office.end) {
    notify(db, { role: "admin", severity: "info", kind: "off_hours_login", message: `${u.firstName} ${u.lastName} เข้าระบบนอกเวลาราชการ (${hm} น.)`, link: "/admin/audit" });
  }

  redirect(u.mustChangePassword ? "/change-password" : "/");
}

/** สลับผู้ใช้ / ออกจากระบบ — กลับหน้าเลือกชื่อ ไม่ต้องใส่รหัสหน่วยงานใหม่ */
export async function switchUser() {
  const auth = await getAuth();
  if (auth) writeAudit(getDb(), { userId: auth.user.id, action: "logout", ip: await clientIp() });
  await endSession();
  redirect("/login");
}

export async function changePassword(_: FormState, formData: FormData): Promise<FormState> {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const db = getDb();
  const u = db.select().from(schema.users).where(eq(schema.users.id, auth.user.id)).get()!;
  if (!(await verifyPassword(u.passwordHash, current))) return { error: "รหัสผ่านปัจจุบันไม่ถูกต้อง" };
  if (next !== confirm) return { error: "รหัสผ่านใหม่ทั้งสองช่องไม่ตรงกัน กรุณาพิมพ์ให้เหมือนกัน" };
  if (next === current) return { error: "รหัสผ่านใหม่ต้องไม่ซ้ำกับรหัสเดิม" };
  const problem = checkPassword(next, { firstName: u.firstName, lastName: u.lastName });
  if (problem) return { error: problem };
  db.update(schema.users)
    .set({ passwordHash: await hashPassword(next), mustChangePassword: false, passwordChangedAt: new Date(), updatedAt: new Date(), updatedBy: u.id })
    .where(eq(schema.users.id, u.id))
    .run();
  writeAudit(db, { userId: u.id, action: "password.change", entity: "user", entityId: u.id, ip: await clientIp() });
  redirect("/");
}

// ───────── ล็อกหน้าจอด่วน (Ctrl+L / Esc 2 ครั้ง / ไม่ใช้งาน 15 นาที) ─────────
export async function lockScreen() {
  const auth = await getAuth();
  if (!auth) return;
  getDb().update(schema.sessions).set({ lockedAt: new Date() }).where(eq(schema.sessions.id, auth.sessionId)).run();
}

export async function unlockScreen(password: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await getAuth();
  if (!auth) return { ok: false, error: "หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่" };
  const db = getDb();
  const ip = await clientIp();
  const recentFails = db
    .select({ n: sql<number>`count(*)` })
    .from(schema.auditLogs)
    .where(and(eq(schema.auditLogs.userId, auth.user.id), eq(schema.auditLogs.action, "unlock.fail"), gte(schema.auditLogs.at, new Date(Date.now() - 15 * 60000))))
    .get();
  if ((recentFails?.n ?? 0) >= 5) {
    await endSession();
    return { ok: false, error: "ใส่รหัสผิดหลายครั้ง ระบบออกจากระบบให้แล้ว (งานร่างยังเก็บไว้)" };
  }
  const u = db.select().from(schema.users).where(eq(schema.users.id, auth.user.id)).get()!;
  if (!(await verifyPassword(u.passwordHash, password))) {
    writeAudit(db, { userId: u.id, action: "unlock.fail", ip });
    return { ok: false, error: "รหัสผ่านไม่ถูกต้อง" };
  }
  db.update(schema.sessions).set({ lockedAt: null, lastActiveAt: new Date() }).where(eq(schema.sessions.id, auth.sessionId)).run();
  writeAudit(db, { userId: u.id, action: "unlock", ip });
  return { ok: true };
}

/** ผู้ใช้ยังทำงานอยู่ (มีการพิมพ์/คลิก) — กันระบบล็อกขณะกรอกฟอร์มยาว */
export async function heartbeat(): Promise<{ locked: boolean; loggedIn: boolean }> {
  const auth = await getAuth();
  if (!auth) return { locked: false, loggedIn: false };
  if (auth.locked) return { locked: true, loggedIn: true };
  touchSession(auth.sessionId);
  return { locked: false, loggedIn: true };
}
