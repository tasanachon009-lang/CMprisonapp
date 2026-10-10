import "server-only";
import { cache } from "react";
import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "../db";
import { getSetting } from "../bootstrap";
import { resolvePermissions, scopedCohorts, scopedPermissions, canInCohorts, type Permission, type Grant } from "./permissions";
import { activeDelegationsFor, delegatedPermissions, type ActiveDelegation } from "../services/delegation";
import { todayISO } from "../thai-date";

export const DEVICE_COOKIE = "rh_dev";
export const SESSION_COOKIE = "rh_sess";
/** อายุเซสชันสูงสุด (ใช้งานต่อเนื่อง) */
const SESSION_MAX_MS = 12 * 60 * 60 * 1000;

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");

const secureCookies = () => process.env.COOKIE_SECURE !== "false" && process.env.NODE_ENV === "production";

export async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0].trim() ?? null;
}

// ───────── ชั้นที่ 1: เครื่องที่ผ่านรหัสหน่วยงาน ─────────

/** remember = false (ไม่ติ๊ก "จดจำเครื่องนี้"): ใช้ได้จนปิดเบราว์เซอร์ และไม่เกิน 12 ชั่วโมง */
export async function trustThisDevice(remember = true) {
  const db = getDb();
  const days = getSetting(db, "security.deviceTrustDays", 30);
  const token = newToken();
  const now = Date.now();
  const h = await headers();
  db.insert(schema.trustedDevices)
    .values({ id: sha256(token), createdAt: new Date(now), expiresAt: new Date(now + (remember ? days * 86400000 : 12 * 3600000)), ip: await clientIp(), userAgent: h.get("user-agent") })
    .run();
  (await cookies()).set(DEVICE_COOKIE, token, {
    httpOnly: true, secure: secureCookies(), sameSite: "strict", path: "/", ...(remember ? { maxAge: days * 86400 } : {}),
  });
}

export async function getTrustedDeviceId(): Promise<string | null> {
  const token = (await cookies()).get(DEVICE_COOKIE)?.value;
  if (!token) return null;
  const id = sha256(token);
  const row = getDb().select().from(schema.trustedDevices).where(eq(schema.trustedDevices.id, id)).get();
  if (!row || row.revokedAt || row.expiresAt.getTime() < Date.now()) return null;
  return id;
}

export async function requireTrustedDevice() {
  const id = await getTrustedDeviceId();
  if (!id) redirect("/device");
  return id;
}

// ───────── ชั้นที่ 2: เซสชันผู้ใช้ ─────────

export async function createSession(userId: number, deviceId: string | null) {
  const token = newToken();
  const now = new Date();
  const h = await headers();
  getDb()
    .insert(schema.sessions)
    .values({
      id: sha256(token), userId, deviceId, createdAt: now, lastActiveAt: now,
      expiresAt: new Date(now.getTime() + SESSION_MAX_MS), ip: await clientIp(), userAgent: h.get("user-agent"),
    })
    .run();
  (await cookies()).set(SESSION_COOKIE, token, { httpOnly: true, secure: secureCookies(), sameSite: "strict", path: "/" });
}

export async function endSession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    getDb().update(schema.sessions).set({ endedAt: new Date() }).where(eq(schema.sessions.id, sha256(token))).run();
  }
  store.delete(SESSION_COOKIE);
}

export type AuthUser = {
  id: number;
  prefix: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  titleLabel: string | null;
  position: string | null;
  profession: string;
  color: string | null;
  photoPath: string | null;
  roles: string[];
  mustChangePassword: boolean;
};

export type Auth = {
  sessionId: string;
  user: AuthUser;
  perms: Set<Permission>;
  /** รุ่นที่ได้รับมอบหมาย (กลุ่ม B) */
  cohortScopes: number[];
  /** สิทธิ์รายรุ่น (permission → รุ่น) */
  scoped: Partial<Record<Permission, number[]>>;
  /** มีสิทธิ์ทั้งระบบ หรือได้รับมอบหมายในรุ่นที่ระบุ — ใช้กับงานที่มอบหมายรายรุ่นได้ */
  canIn: (p: Permission, cohortIds: number[]) => boolean;
  locked: boolean;
  idleMinutes: number;
  can: (p: Permission) => boolean;
  isAdmin: boolean;
  /** ผู้ดูแลต้องใช้ OTP หรือไม่ (ตั้งค่า security.adminOtp — ค่าเริ่มต้นปิด) */
  otpRequired: boolean;
  /** ผ่านเงื่อนไข OTP แล้ว (ไม่ต้องใช้ OTP = ผ่านเสมอ) */
  mfaOk: boolean;
  totpEnabled: boolean;
  /** การมอบอำนาจที่มีผลวันนี้ (สเปก 22B) */
  delegations: ActiveDelegation[];
  /** สิทธิ์นี้ได้มาจากการมอบอำนาจหรือไม่ (ไว้เขียน audit "อนุมัติแทน") — null = มีสิทธิ์เอง/ไม่มีสิทธิ์ */
  viaDelegation: (p: Permission) => ActiveDelegation | null;
};

/** โหลดเซสชันปัจจุบัน (ครั้งเดียวต่อคำขอ) — ไม่มี/หมดอายุ → null */
export const getAuth = cache(async (): Promise<Auth | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const id = sha256(token);
  const s = db.select().from(schema.sessions).where(eq(schema.sessions.id, id)).get();
  if (!s || s.endedAt || s.expiresAt.getTime() < Date.now()) return null;
  const u = db.select().from(schema.users).where(eq(schema.users.id, s.userId)).get();
  if (!u || u.status !== "active" || u.deletedAt) return null;

  const idleMinutes = getSetting(db, "security.idleLockMinutes", 15);
  let locked = !!s.lockedAt;
  // ไม่ใช้งานเกินกำหนด → ล็อกหน้าจอ (ไม่ออกจากระบบ ไม่ทิ้งงานที่ค้าง)
  if (!locked && Date.now() - s.lastActiveAt.getTime() > idleMinutes * 60000) {
    db.update(schema.sessions).set({ lockedAt: new Date() }).where(eq(schema.sessions.id, id)).run();
    locked = true;
  }

  const roles = db.select({ role: schema.userRoles.role }).from(schema.userRoles).where(eq(schema.userRoles.userId, u.id)).all().map((r) => r.role);
  const grants: Grant[] = db
    .select({ permission: schema.permissionGrants.permission, allow: schema.permissionGrants.allow, scope: schema.permissionGrants.scope, validFrom: schema.permissionGrants.validFrom, validTo: schema.permissionGrants.validTo })
    .from(schema.permissionGrants)
    .where(and(eq(schema.permissionGrants.userId, u.id), isNull(schema.permissionGrants.revokedAt), isNull(schema.permissionGrants.deletedAt)))
    .all();
  const today = todayISO();
  const perms = resolvePermissions(roles, grants, today);
  // มอบอำนาจอนุมัติชั่วคราว: เพิ่มเฉพาะสิทธิ์ตามขอบเขต ระหว่างช่วงวันที่ (หมดเวลาคืนเอง)
  const delegations = activeDelegationsFor(db, u.id, today);
  const viaMap = delegatedPermissions(perms, delegations);
  for (const p of viaMap.keys()) perms.add(p);
  const scoped = scopedPermissions(grants, today);
  const otpRequired = roles.includes("admin") && getSetting<boolean>(db, "security.adminOtp", false) === true;
  return {
    sessionId: id,
    user: {
      id: u.id, prefix: u.prefix, firstName: u.firstName, lastName: u.lastName,
      fullName: `${u.prefix ?? ""}${u.firstName} ${u.lastName}`, titleLabel: u.titleLabel, position: u.position,
      profession: u.profession, color: u.color, photoPath: u.photoPath, roles, mustChangePassword: u.mustChangePassword,
    },
    perms,
    cohortScopes: scopedCohorts(grants, today),
    scoped,
    canIn: (p, cohortIds) => canInCohorts(perms, scoped, p, cohortIds),
    locked,
    idleMinutes,
    can: (p) => perms.has(p),
    isAdmin: roles.includes("admin"),
    otpRequired,
    mfaOk: !otpRequired || !!s.mfaVerifiedAt,
    totpEnabled: u.totpEnabled,
    delegations,
    viaDelegation: (p) => viaMap.get(p) ?? null,
  };
});

/** บันทึกว่ายังใช้งานอยู่ (เรียกจาก action/คำขอที่ผู้ใช้กระทำ) */
export function touchSession(sessionId: string) {
  getDb().update(schema.sessions).set({ lastActiveAt: new Date() }).where(eq(schema.sessions.id, sessionId)).run();
}

/**
 * ใช้ในหน้า (Server Component): ต้องล็อกอิน ไม่ถูกล็อก และมีสิทธิ์
 * ใช้ในทุกหน้า — ไม่พึ่งการซ่อนเมนูอย่างเดียว
 */
export async function requirePage(...need: Permission[]): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) {
    if (!(await getTrustedDeviceId())) redirect("/device");
    redirect("/login");
  }
  if (auth.user.mustChangePassword) redirect("/change-password");
  if (auth.locked) redirect("/lock");
  if (!auth.mfaOk) redirect(auth.totpEnabled ? "/otp" : "/otp/setup");
  // จดหมายเวรสีแดงที่ยังไม่กดรับทราบ → เข้าเมนูอื่นไม่ได้ (สเปก 20)
  if (auth.can("shift.use")) {
    const path = (await headers()).get("x-pathname") ?? "";
    if (!path.startsWith("/inbox")) {
      const { unacked, shiftViewer } = await import("../services/shift");
      const red = unacked(getDb(), shiftViewer(getDb(), auth)).some((m) => m.level === "red");
      if (red) redirect("/inbox?must=1");
    }
  }
  if (need.length && !need.some((p) => auth.can(p))) redirect("/forbidden");
  touchSession(auth.sessionId);
  return auth;
}

export class AuthError extends Error {}

/** ใช้ใน Server Action / Route Handler: ไม่ redirect แต่โยน error ที่อ่านเข้าใจได้ */
export async function requireAction(...need: Permission[]): Promise<Auth> {
  const auth = await getAuth();
  if (!auth) throw new AuthError("หมดเวลาการใช้งาน กรุณาเข้าสู่ระบบใหม่");
  if (auth.locked) throw new AuthError("หน้าจอถูกล็อก กรุณาใส่รหัสผ่านเพื่อปลดล็อกก่อน");
  if (auth.user.mustChangePassword) throw new AuthError("กรุณาเปลี่ยนรหัสผ่านก่อนใช้งาน");
  if (!auth.mfaOk) throw new AuthError("ผู้ดูแลระบบต้องยืนยันรหัส OTP จากแอปมือถือก่อน");
  if (need.length && !need.some((p) => auth.can(p))) throw new AuthError("ไม่มีสิทธิ์ทำรายการนี้");
  touchSession(auth.sessionId);
  return auth;
}
