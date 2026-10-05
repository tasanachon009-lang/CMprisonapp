import { and, asc, eq, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { normalizeNationalId } from "../thai-id";
import { digitsOnly, readiness, validateInstructor, type InstructorFields } from "../instructor-rules";

/**
 * ทะเบียนวิทยากร (สเปก 11.2, 11.5A–B)
 * - ภายใน: ผูกบัญชีผู้ใช้ — ชื่อ/ตำแหน่งดึงจากบัญชี เติมเฉพาะที่อยู่/เลขบัตร/บัญชีธนาคาร
 * - ภายนอก: ข้อมูลทั้งหมดอยู่ในทะเบียน
 */
type Row = typeof schema.instructors.$inferSelect;
export type InstructorInput = Partial<Omit<Row, "id" | "createdAt" | "updatedAt" | "createdBy" | "updatedBy" | "deletedAt" | "deletedBy" | "version">> & { kind: string };

/** ช่องที่เป็นข้อมูลอ่อนไหว — ไม่เก็บค่าใน audit log (บันทึกเพียงว่า "เปลี่ยนแล้ว") */
const SENSITIVE = ["nationalId", "accountNo", "addrHouseNo", "addrMoo", "addrSoi", "addrRoad", "phone", "email"] as const;

export function listInstructors(db: DB) {
  const rows = db
    .select({ i: schema.instructors, u: schema.users })
    .from(schema.instructors)
    .leftJoin(schema.users, eq(schema.users.id, schema.instructors.userId))
    .where(isNull(schema.instructors.deletedAt))
    .orderBy(asc(schema.instructors.kind), asc(schema.instructors.firstName))
    .all();
  return rows.map(({ i, u }) => withDisplay(i, u));
}

export function getInstructor(db: DB, id: number) {
  const r = db.select({ i: schema.instructors, u: schema.users }).from(schema.instructors).leftJoin(schema.users, eq(schema.users.id, schema.instructors.userId)).where(and(eq(schema.instructors.id, id), isNull(schema.instructors.deletedAt))).get();
  return r ? withDisplay(r.i, r.u) : null;
}

function withDisplay(i: Row, u: typeof schema.users.$inferSelect | null) {
  const prefix = u?.prefix ?? i.prefix;
  const firstName = u?.firstName ?? i.firstName ?? "";
  const lastName = u?.lastName ?? i.lastName ?? "";
  const position = i.position ?? u?.position ?? null;
  const name = `${firstName} ${lastName}`.trim();
  return { ...i, prefix, firstName, lastName, position, displayName: name, fullName: `${prefix ?? ""}${name}`, readiness: readiness({ ...(i as InstructorFields), firstName, lastName }) };
}

/** วิทยากรภายในของผู้ใช้ (สร้างให้ถ้ายังไม่มี) — ใช้ตอนต้องเติมข้อมูลเบิกจ่าย */
export function ensureInternalInstructor(db: DB, userId: number, actorId: number) {
  const ex = db.select().from(schema.instructors).where(and(eq(schema.instructors.userId, userId), isNull(schema.instructors.deletedAt))).get();
  if (ex) return ex;
  const u = db.select().from(schema.users).where(eq(schema.users.id, userId)).get();
  if (!u) throw new RuleError("ไม่พบบัญชีผู้ใช้");
  return db.insert(schema.instructors).values({ kind: "internal", userId, organization: null, createdBy: actorId, updatedBy: actorId }).returning().get();
}

function clean(input: InstructorInput) {
  const t = (s: string | null | undefined) => (s == null ? null : s.trim() || null);
  return {
    ...input,
    prefix: t(input.prefix), firstName: t(input.firstName), lastName: t(input.lastName), position: t(input.position), organization: t(input.organization),
    phone: input.phone ? digitsOnly(input.phone) || null : null, email: t(input.email)?.toLowerCase() ?? null,
    nationalId: input.nationalId ? normalizeNationalId(input.nationalId) || null : null,
    addrHouseNo: t(input.addrHouseNo), addrMoo: t(input.addrMoo), addrSoi: t(input.addrSoi), addrRoad: t(input.addrRoad),
    addrSubdistrict: t(input.addrSubdistrict), addrDistrict: t(input.addrDistrict), addrProvince: t(input.addrProvince), addrPostcode: t(input.addrPostcode),
    companyName: input.payeeType === "company" ? t(input.companyName) : null,
    bank: t(input.bank), bankBranch: t(input.bankBranch), accountName: t(input.accountName),
    accountNo: input.accountNo ? digitsOnly(input.accountNo) || null : null,
    bankBookReceivedDate: input.bankBookReceived ? input.bankBookReceivedDate ?? null : null,
    expertise: t(input.expertise), note: t(input.note),
    externalType: input.kind === "external" ? input.externalType ?? "gov" : null,
  };
}

function redact(x: Record<string, unknown>) {
  const out: Record<string, unknown> = { ...x };
  for (const k of SENSITIVE) if (k in out) out[k] = out[k] ? "(มีข้อมูล)" : null;
  return out;
}

export function saveInstructor(db: DB, id: number | null, input: InstructorInput, actor: { userId: number; ip?: string | null }, loadedVersion?: number) {
  const v = clean(input);
  const problem = validateInstructor(v);
  if (problem) throw new RuleError(problem);
  if (v.kind === "internal" && !v.userId) throw new RuleError("วิทยากรภายใน — กรุณาเลือกบัญชีเจ้าหน้าที่");
  if (v.kind === "internal") {
    const dup = db.select().from(schema.instructors).where(and(eq(schema.instructors.userId, v.userId!), isNull(schema.instructors.deletedAt))).get();
    if (dup && dup.id !== id) throw new RuleError("เจ้าหน้าที่คนนี้มีในทะเบียนวิทยากรแล้ว — เปิดรายการเดิมเพื่อแก้");
  }
  if (id) {
    const prev = db.select().from(schema.instructors).where(eq(schema.instructors.id, id)).get();
    if (!prev || prev.deletedAt) throw new RuleError("ไม่พบวิทยากร");
    if (loadedVersion !== undefined && prev.version !== loadedVersion) throw new RuleError("มีผู้อื่นแก้ข้อมูลวิทยากรนี้ระหว่างที่คุณเปิดอยู่ — โหลดหน้าใหม่ก่อนแก้", undefined, "conflict");
    const { kind: _k, ...rest } = v;
    db.update(schema.instructors).set({ ...rest, kind: prev.kind, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.instructors.id, id)).run();
    const changed = Object.keys(rest).filter((k) => JSON.stringify((prev as Record<string, unknown>)[k] ?? null) !== JSON.stringify((rest as Record<string, unknown>)[k] ?? null));
    writeAudit(db, {
      userId: actor.userId, action: "update", entity: "instructor", entityId: id,
      before: redact(Object.fromEntries(changed.map((k) => [k, (prev as Record<string, unknown>)[k]]))),
      after: redact(Object.fromEntries(changed.map((k) => [k, (rest as Record<string, unknown>)[k]]))), ip: actor.ip,
    });
    return id;
  }
  const row = db.insert(schema.instructors).values({ ...v, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "instructor", entityId: row.id, after: redact({ kind: v.kind, firstName: v.firstName, lastName: v.lastName, organization: v.organization }), ip: actor.ip });
  return row.id;
}

export function setInstructorActive(db: DB, id: number, active: boolean, actor: { userId: number; ip?: string | null }) {
  db.update(schema.instructors).set({ active, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.instructors.id, id)).run();
  writeAudit(db, { userId: actor.userId, action: active ? "instructor.activate" : "instructor.deactivate", entity: "instructor", entityId: id, ip: actor.ip });
}
