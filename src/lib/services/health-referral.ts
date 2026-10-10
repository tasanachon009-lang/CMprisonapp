import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { isValidISODate } from "../thai-date";
import { RuleError } from "../errors";

/**
 * ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ (สเปก 17 กิจกรรม 11) — ข้อมูลอ่อนไหว
 * ผู้เรียกต้องตรวจสิทธิ์ health.view / health.edit ก่อน · ไม่ส่งรายละเอียดโรคไปที่แจ้งเตือน/LINE/ประวัติการแก้ไข
 */
export const PHYSICAL_PROBLEMS = [
  { code: "tb", label: "วัณโรค" },
  { code: "hiv", label: "HIV" },
  { code: "diabetes", label: "เบาหวาน" },
  { code: "hypertension", label: "ความดันโลหิตสูง" },
  { code: "communicable", label: "โรคติดต่ออื่น" },
  { code: "other", label: "อื่นๆ" },
] as const;
export const COVERAGE = [
  { code: "uc", label: "บัตรทอง (หลักประกันสุขภาพถ้วนหน้า)" },
  { code: "sss", label: "ประกันสังคม" },
  { code: "civil", label: "ข้าราชการ/รัฐวิสาหกิจ" },
  { code: "none", label: "ไม่มีสิทธิ/ยังไม่ทราบ" },
  { code: "other", label: "อื่นๆ" },
] as const;
export const physicalLabel = (code: string) => PHYSICAL_PROBLEMS.find((p) => p.code === code)?.label ?? code;
export const coverageLabel = (code: string | null | undefined) => COVERAGE.find((p) => p.code === code)?.label ?? "-";

/** หลักสูตรที่มีกิจกรรมส่งต่อข้อมูลสุขภาพ */
export const usesHealthReferral = (courseCode: string) => courseCode === "PRE3";

export type ReferralInput = {
  recordedDate: string;
  needsReferral: boolean;
  physical?: string[];
  physicalOther?: string | null;
  mental?: string | null;
  treatmentPlan?: string | null;
  coverage?: string | null;
  coverageNote?: string | null;
  hospital?: string | null;
  medications?: string | null;
};
export type Referral = typeof schema.healthReferrals.$inferSelect;

const clean = (s: string | null | undefined, max: number) => s?.trim().slice(0, max) || null;

/** ตรวจและจัดรูปข้อมูลก่อนบันทึก — ข้อความผิดพลาดบอกว่าต้องทำอะไร */
export function normalizeReferral(input: ReferralInput) {
  if (!isValidISODate(input.recordedDate)) throw new RuleError("กรุณาใส่วันที่บันทึก");
  const physical = Array.from(new Set(input.physical ?? []));
  if (physical.some((c) => !PHYSICAL_PROBLEMS.some((p) => p.code === c))) throw new RuleError("รายการปัญหาสุขภาพไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  if (input.coverage && !COVERAGE.some((c) => c.code === input.coverage)) throw new RuleError("สิทธิการรักษาไม่ถูกต้อง กรุณาโหลดหน้าใหม่");
  const v = {
    recordedDate: input.recordedDate,
    needsReferral: input.needsReferral,
    physical,
    physicalOther: physical.includes("other") ? clean(input.physicalOther, 300) : null,
    mental: clean(input.mental, 1000),
    treatmentPlan: clean(input.treatmentPlan, 2000),
    coverage: input.coverage || null,
    coverageNote: input.coverage === "other" ? clean(input.coverageNote, 200) : null,
    hospital: clean(input.hospital, 200),
    medications: clean(input.medications, 1000),
  };
  if (v.needsReferral) {
    if (!v.physical.length && !v.mental) throw new RuleError("เลือก \"ต้องส่งต่อ\" แล้ว — กรุณาติ๊กปัญหาสุขภาพกายอย่างน้อย 1 ข้อ หรือพิมพ์ปัญหาสุขภาพจิต");
    if (v.physical.includes("other") && !v.physicalOther) throw new RuleError("ติ๊ก \"อื่นๆ\" แล้ว — กรุณาพิมพ์ชื่อโรค/ปัญหา");
    if (v.coverage === "other" && !v.coverageNote) throw new RuleError("เลือกสิทธิการรักษา \"อื่นๆ\" แล้ว — กรุณาพิมพ์ชื่อสิทธิ");
    return v;
  }
  // ไม่ต้องส่งต่อ: ไม่เก็บรายละเอียดโรค (กันข้อมูลค้างจากการกรอกผิด)
  return { ...v, physical: [], physicalOther: null, mental: null, treatmentPlan: null, hospital: null, medications: null };
}

export function referralOf(db: DB, enrollmentId: number) {
  return db.select().from(schema.healthReferrals).where(and(eq(schema.healthReferrals.enrollmentId, enrollmentId), isNull(schema.healthReferrals.deletedAt))).get() ?? null;
}

export function saveReferral(db: DB, enrollmentId: number, input: ReferralInput, actor: { userId: number; ip?: string | null }, loadedVersion?: number) {
  const v = normalizeReferral(input);
  return db.transaction((tx) => {
    const enr = tx.select({ e: schema.enrollments, course: schema.courses, inc: schema.incarcerations })
      .from(schema.enrollments)
      .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
      .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
      .where(and(eq(schema.enrollments.id, enrollmentId), isNull(schema.enrollments.deletedAt))).get();
    if (!enr) throw new RuleError("ไม่พบการลงทะเบียนนี้");
    if (!usesHealthReferral(enr.course.code)) throw new RuleError("หลักสูตรนี้ไม่มีกิจกรรมส่งต่อข้อมูลสุขภาพ");
    if (enr.e.status === "draft" || enr.e.status === "withdrawn") throw new RuleError("ยังไม่ได้ยืนยันรับเข้ารุ่น — ให้เจ้าหน้าที่ฟื้นฟูยืนยันรับเข้าก่อน แล้วจึงบันทึกส่งต่อ");
    const prev = tx.select().from(schema.healthReferrals).where(and(eq(schema.healthReferrals.enrollmentId, enrollmentId), isNull(schema.healthReferrals.deletedAt))).get();
    if (prev && loadedVersion !== undefined && prev.version !== loadedVersion) {
      throw new RuleError("รายการนี้ถูกบันทึกโดยผู้ใช้อื่น กรุณาโหลดหน้าใหม่", undefined, "conflict");
    }
    let id: number;
    if (prev) {
      tx.update(schema.healthReferrals).set({ ...v, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.healthReferrals.id, prev.id)).run();
      id = prev.id;
    } else {
      id = tx.insert(schema.healthReferrals).values({ enrollmentId, ...v, createdBy: actor.userId, updatedBy: actor.userId }).returning().get().id;
    }
    // ประวัติการแก้ไข: เก็บเฉพาะ "ต้องส่งต่อหรือไม่" ไม่เก็บชื่อโรค
    writeAudit(tx, { userId: actor.userId, action: prev ? "update" : "create", entity: "health_referral", entityId: id, personId: enr.inc.personId, before: prev ? { needsReferral: prev.needsReferral } : null, after: { needsReferral: v.needsReferral }, ip: actor.ip ?? null });
    return id;
  });
}

export function markReferralPrinted(db: DB, ids: number[], userId: number) {
  if (ids.length) db.update(schema.healthReferrals).set({ printedAt: new Date(), printedBy: userId }).where(inArray(schema.healthReferrals.id, ids)).run();
}

/** ผู้เข้าอบรมของรุ่น (ยืนยันรับเข้าแล้ว) พร้อมรายการส่งต่อ — สำหรับผู้มีสิทธิ์ health.view เท่านั้น */
export function cohortReferrals(db: DB, cohortId: number) {
  const rows = db.select({ e: schema.enrollments, inc: schema.incarcerations, p: schema.persons })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
    .where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["active", "completed"]), isNull(schema.enrollments.deletedAt)))
    .all();
  const ids = rows.map((r) => r.e.id);
  const refs = ids.length ? db.select().from(schema.healthReferrals).where(and(inArray(schema.healthReferrals.enrollmentId, ids), isNull(schema.healthReferrals.deletedAt))).all() : [];
  const by = new Map(refs.map((r) => [r.enrollmentId, r]));
  return rows
    .map((r) => ({ enrollmentId: r.e.id, personId: r.p.id, name: `${r.p.prefix ?? ""}${r.p.firstName} ${r.p.lastName}`, inmateNo: r.inc.inmateNo, zone: r.inc.zone, nationalId: r.p.nationalId, birthDate: r.p.birthDate, referral: by.get(r.e.id) ?? null }))
    .sort((a, b) => a.name.localeCompare(b.name, "th"));
}

/** สรุปไม่ระบุชื่อ (ผู้บริหารเห็นได้) — จงใจไม่แยกตามโรค เพราะรุ่นเล็กอาจระบุตัวบุคคลได้ */
export function referralSummary(db: DB, cohortId: number) {
  const list = cohortReferrals(db, cohortId);
  return {
    total: list.length,
    recorded: list.filter((x) => x.referral).length,
    needs: list.filter((x) => x.referral?.needsReferral).length,
    pending: list.filter((x) => !x.referral).length,
  };
}

/** ข้อความสรุปปัญหาสุขภาพกาย เช่น "วัณโรค, อื่นๆ (หอบหืด)" */
export function physicalText(r: Pick<Referral, "physical" | "physicalOther">) {
  return (r.physical ?? []).map((c) => (c === "other" && r.physicalOther ? `อื่นๆ (${r.physicalOther})` : physicalLabel(c))).join(", ");
}
