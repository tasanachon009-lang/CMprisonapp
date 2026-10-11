import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";

/** อัตราค่าตอบแทน (สเปก 11.1) และคลังหัวข้อ (สเปก 11.3) */

export type RateInput = { name: string; kind: "internal" | "external"; externalType: string | null; perHourBaht: number; dailyCapBaht: number | null; fromFiscalYear: number; active: boolean; note?: string | null };

const toSatang = (baht: number) => Math.round(baht * 100);

export function listRates(db: DB) {
  return db.select().from(schema.rates).where(isNull(schema.rates.deletedAt)).orderBy(asc(schema.rates.kind), asc(schema.rates.fromFiscalYear), asc(schema.rates.id)).all();
}

export function saveRate(db: DB, id: number | null, r: RateInput, actor: { userId: number; ip?: string | null }) {
  if (!r.name.trim()) throw new RuleError("กรุณาตั้งชื่ออัตรา");
  if (!(r.perHourBaht >= 0) || r.perHourBaht > 100000) throw new RuleError("อัตราต่อชั่วโมงต้องเป็นตัวเลข 0–100,000 บาท");
  if (r.dailyCapBaht != null && (!(r.dailyCapBaht > 0) || r.dailyCapBaht < r.perHourBaht)) throw new RuleError("เพดานต่อวันต้องมากกว่าหรือเท่ากับอัตราต่อชั่วโมง (เว้นว่าง = ไม่จำกัด)");
  if (!(r.fromFiscalYear >= 2560 && r.fromFiscalYear <= 2650)) throw new RuleError("ปีงบประมาณที่เริ่มใช้ต้องเป็น พ.ศ. เช่น 2570");
  const values = {
    name: r.name.trim(), kind: r.kind, externalType: r.kind === "external" ? r.externalType || null : null,
    perHourSatang: toSatang(r.perHourBaht), dailyCapSatang: r.dailyCapBaht == null ? null : toSatang(r.dailyCapBaht),
    fromFiscalYear: r.fromFiscalYear, active: r.active, note: r.note?.trim() || null,
  };
  if (id) {
    const prev = db.select().from(schema.rates).where(eq(schema.rates.id, id)).get();
    if (!prev) throw new RuleError("ไม่พบอัตรา");
    // แก้จำนวนเงินแล้ว = ไม่ใช่อัตราตัวอย่างอีกต่อไป
    const isSample = prev.isSample && prev.perHourSatang === values.perHourSatang && prev.dailyCapSatang === values.dailyCapSatang;
    db.update(schema.rates).set({ ...values, isSample, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.rates.id, id)).run();
    writeAudit(db, { userId: actor.userId, action: "update", entity: "rate", entityId: id, before: { name: prev.name, perHourSatang: prev.perHourSatang, dailyCapSatang: prev.dailyCapSatang, fromFiscalYear: prev.fromFiscalYear, active: prev.active }, after: values, ip: actor.ip });
    return id;
  }
  const row = db.insert(schema.rates).values({ ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "rate", entityId: row.id, after: values, ip: actor.ip });
  return row.id;
}

// ───────── คลังหัวข้อ ─────────
export const SPLIT_LABEL: Record<string, string> = { full: "คนละเต็มอัตรา", equal: "หารเท่ากัน", ratio: "กำหนดสัดส่วน" };

export function listTopics(db: DB, courseId: number) {
  return db.select().from(schema.activityTopics).where(and(eq(schema.activityTopics.courseId, courseId), isNull(schema.activityTopics.deletedAt))).orderBy(asc(schema.activityTopics.sortOrder), asc(schema.activityTopics.id)).all();
}

export type TopicInput = {
  name: string; category: string | null; standardHours: number | null; activityType: string; color: string | null;
  staffingType: "individual" | "team"; maxStaff: number | null; payable: boolean; internalRateId: number | null;
  externalRates: Record<string, number | null> | null; splitMethod: "full" | "equal" | "ratio"; active: boolean; sortOrder: number;
  defaultStaff?: Array<{ userId?: number; instructorId?: number }> | null;
};

function checkTopic(t: TopicInput) {
  if (!t.name.trim()) throw new RuleError("กรุณาใส่ชื่อหัวข้อ");
  if (t.standardHours != null && !(t.standardHours > 0 && t.standardHours <= 24)) throw new RuleError("ชั่วโมงมาตรฐานต้องอยู่ระหว่าง 0–24");
  if (t.staffingType === "individual" && t.maxStaff != null && !(t.maxStaff >= 1 && t.maxStaff <= 20)) throw new RuleError("จำนวนวิทยากรสูงสุดต้องอยู่ระหว่าง 1–20");
  if (!["lecture", "panel", "group", "practice", "other"].includes(t.activityType)) throw new RuleError("ลักษณะกิจกรรมไม่ถูกต้อง");
  if (!["full", "equal", "ratio"].includes(t.splitMethod)) throw new RuleError("วิธีแบ่งค่าตอบแทนไม่ถูกต้อง");
  if (t.color && !/^#[0-9a-fA-F]{6}$/.test(t.color)) throw new RuleError("สีต้องเป็นรหัส เช่น #3D5590");
}

export function saveTopic(db: DB, courseId: number, id: number | null, t: TopicInput, actor: { userId: number; ip?: string | null }) {
  checkTopic(t);
  const values = {
    name: t.name.trim(), category: t.category?.trim() || null, standardHours: t.standardHours, activityType: t.activityType, color: t.color,
    staffingType: t.staffingType, maxStaff: t.staffingType === "team" ? null : t.maxStaff, payable: t.payable, internalRateId: t.internalRateId,
    externalRates: t.externalRates, splitMethod: t.splitMethod, active: t.active, sortOrder: t.sortOrder, defaultStaff: t.defaultStaff ?? null,
  };
  if (id) {
    const prev = db.select().from(schema.activityTopics).where(eq(schema.activityTopics.id, id)).get();
    if (!prev || prev.courseId !== courseId) throw new RuleError("ไม่พบหัวข้อ");
    db.update(schema.activityTopics).set({ ...values, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.activityTopics.id, id)).run();
    writeAudit(db, { userId: actor.userId, action: "update", entity: "activity_topic", entityId: id, before: { ...prev, createdAt: undefined, updatedAt: undefined }, after: values, ip: actor.ip });
    return id;
  }
  const row = db.insert(schema.activityTopics).values({ courseId, ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning().get();
  writeAudit(db, { userId: actor.userId, action: "create", entity: "activity_topic", entityId: row.id, after: values, ip: actor.ip });
  return row.id;
}

/** แก้หลายหัวข้อพร้อมกัน (สเปก 11.3) — ใช้ค่าเฉพาะช่องที่ส่งมา */
export function bulkUpdateTopics(db: DB, courseId: number, ids: number[], patch: Partial<Pick<TopicInput, "payable" | "internalRateId" | "externalRates" | "splitMethod" | "activityType" | "maxStaff" | "staffingType" | "active">>, actor: { userId: number; ip?: string | null }) {
  if (!ids.length) throw new RuleError("กรุณาเลือกหัวข้ออย่างน้อย 1 รายการ");
  if (!Object.keys(patch).length) throw new RuleError("กรุณาเลือกสิ่งที่จะเปลี่ยน");
  const rows = db.select().from(schema.activityTopics).where(and(inArray(schema.activityTopics.id, ids), eq(schema.activityTopics.courseId, courseId))).all();
  for (const r of rows) {
    const next = { ...patch } as Record<string, unknown>;
    if ((patch.staffingType ?? r.staffingType) === "team") next.maxStaff = null;
    db.update(schema.activityTopics).set({ ...next, updatedBy: actor.userId, updatedAt: new Date(), version: r.version + 1 }).where(eq(schema.activityTopics.id, r.id)).run();
  }
  writeAudit(db, { userId: actor.userId, action: "update", entity: "activity_topic", entityId: ids.join(","), after: patch, note: `แก้พร้อมกัน ${rows.length} หัวข้อ`, ip: actor.ip });
  return rows.length;
}

/**
 * ตั้งค่าอย่างง่ายต่อหัวข้อ: เบิก/ไม่เบิก และผู้สอน (ทั้งทีม หรือระบุคนจากทะเบียนวิทยากร)
 * ผู้ดูแลเป็นผู้ตัดสินว่าเบิกหัวข้อใด — ไม่ผูกกับประเภทผู้สอน · ผู้สอนที่ระบุจะเติมให้รุ่นที่สร้างใหม่
 */
export function setTopicTeaching(db: DB, topicId: number, patch: { payable?: boolean; staff?: "team" | Array<{ userId?: number; instructorId?: number }> }, actor: { userId: number; ip?: string | null }) {
  const t = db.select().from(schema.activityTopics).where(and(eq(schema.activityTopics.id, topicId), isNull(schema.activityTopics.deletedAt))).get();
  if (!t) throw new RuleError("ไม่พบหัวข้อ — โหลดหน้าใหม่แล้วลองอีกครั้ง");
  const next: Partial<typeof schema.activityTopics.$inferInsert> = {};
  if (patch.payable !== undefined) next.payable = patch.payable;
  if (patch.staff === "team") Object.assign(next, { staffingType: "team", maxStaff: null, defaultStaff: null });
  else if (patch.staff) {
    const seen = new Set<string>();
    const staff = patch.staff.map((s) => (s.userId ? { userId: s.userId } : { instructorId: s.instructorId })).filter((s) => {
      const k = JSON.stringify(s);
      return (s.userId || s.instructorId) && !seen.has(k) && !!seen.add(k);
    });
    if (staff.length > 20) throw new RuleError("ผู้สอนต่อหัวข้อได้ไม่เกิน 20 คน");
    for (const s of staff) {
      const ok = s.userId
        ? db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, s.userId)).get()
        : db.select({ id: schema.instructors.id }).from(schema.instructors).where(and(eq(schema.instructors.id, s.instructorId!), isNull(schema.instructors.deletedAt))).get();
      if (!ok) throw new RuleError("ไม่พบผู้สอนที่เลือกในทะเบียนวิทยากร — โหลดหน้าใหม่แล้วเลือกอีกครั้ง");
    }
    Object.assign(next, { staffingType: "individual", maxStaff: Math.max(t.maxStaff ?? 2, staff.length), defaultStaff: staff });
  }
  if (!Object.keys(next).length) return;
  db.update(schema.activityTopics).set({ ...next, updatedBy: actor.userId, updatedAt: new Date(), version: t.version + 1 }).where(eq(schema.activityTopics.id, t.id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "activity_topic", entityId: t.id, before: { payable: t.payable, staffingType: t.staffingType, defaultStaff: t.defaultStaff }, after: next, ip: actor.ip });
}
