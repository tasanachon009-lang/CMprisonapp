import { and, desc, eq, inArray, isNull, max } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { evaluateEnrollment, ONGOING_STATUSES, type PriorEnrollment, type RuleResult } from "../rules/enrollment-rules";
import { personSearchKey } from "../search";
import { isValidNationalId, normalizeNationalId } from "../thai-id";
import { writeAudit } from "../audit";
import { cohortLabel } from "./cohorts";
import { ensureIntakeTasks } from "./followup";
import { RuleError } from "../errors";

export { RuleError };

export const ENROLLMENT_STATUS_LABEL: Record<string, string> = {
  draft: "ร่าง (รอยืนยันรับเข้า)",
  active: "กำลังอบรม",
  completed: "ครบหลักสูตร",
  dropped: "ออกก่อนกำหนด",
  withdrawn: "ถอนตัว",
  failed: "ไม่ผ่าน",
};

export function normalizeInmateNo(s: string) {
  return s.trim().replace(/\s+/g, "").toUpperCase();
}

/** ประวัติการลงทะเบียนทั้งหมดของบุคคล (ทุกการต้องโทษ) */
export function priorsForPerson(db: DB, personId: number): PriorEnrollment[] {
  return db
    .select({
      enrollmentId: schema.enrollments.id,
      incarcerationId: schema.enrollments.incarcerationId,
      inmateNo: schema.incarcerations.inmateNo,
      courseId: schema.enrollments.courseId,
      courseName: schema.courses.name,
      number: schema.cohorts.number,
      fiscalYear: schema.cohorts.fiscalYear,
      status: schema.enrollments.status,
    })
    .from(schema.enrollments)
    .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
    .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
    .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
    .where(and(eq(schema.incarcerations.personId, personId), isNull(schema.enrollments.deletedAt)))
    .all()
    .map((r) => ({
      enrollmentId: r.enrollmentId,
      incarcerationId: r.incarcerationId,
      inmateNo: r.inmateNo,
      courseId: r.courseId,
      courseName: r.courseName,
      cohortLabel: cohortLabel(r),
      status: r.status,
      isOngoing: ONGOING_STATUSES.has(r.status),
    }));
}

export function findByInmateNo(db: DB, inmateNo: string) {
  const inc = db
    .select()
    .from(schema.incarcerations)
    .where(and(eq(schema.incarcerations.inmateNo, normalizeInmateNo(inmateNo)), isNull(schema.incarcerations.deletedAt)))
    .get();
  if (!inc) return null;
  const person = db.select().from(schema.persons).where(eq(schema.persons.id, inc.personId)).get()!;
  return { incarceration: inc, person };
}

export function findPersonByNationalId(db: DB, nationalId: string) {
  const nid = normalizeNationalId(nationalId);
  if (!nid) return null;
  return db
    .select()
    .from(schema.persons)
    .where(and(eq(schema.persons.nationalId, nid), isNull(schema.persons.deletedAt)))
    .get() ?? null;
}

/** ไม่มีเลขบัตร: เทียบชื่อ-สกุล (+ วันเกิด) → "อาจเป็นคนเดียวกัน" */
export function findPossibleSamePersons(db: DB, firstName: string, lastName: string, birthDate?: string | null) {
  const key = personSearchKey(firstName, lastName);
  if (!key) return [];
  const rows = db
    .select()
    .from(schema.persons)
    .where(and(eq(schema.persons.searchKey, key), isNull(schema.persons.deletedAt)))
    .all();
  return rows.filter((p) => !birthDate || !p.birthDate || p.birthDate === birthDate);
}

export function incarcerationsOfPerson(db: DB, personId: number) {
  return db
    .select()
    .from(schema.incarcerations)
    .where(and(eq(schema.incarcerations.personId, personId), isNull(schema.incarcerations.deletedAt)))
    .orderBy(desc(schema.incarcerations.id))
    .all();
}

export type PersonInput = {
  prefix?: string | null;
  firstName: string;
  lastName: string;
  nationalId?: string | null;
  birthDate?: string | null;
  gender?: string | null;
  maritalStatus?: string | null;
  education?: string | null;
  occupation?: string | null;
  familySize?: number | null;
};

export type IncarcerationInput = {
  inmateNo: string;
  admittedDate?: string | null;
  offense?: string | null;
  sentenceYears?: number | null;
  sentenceMonths?: number | null;
  sentenceDays?: number | null;
  sentenceStatus?: string | null;
  zone?: string | null;
  room?: string | null;
  prisonerClass?: string | null;
};

export type DrugUseInput = { substance: string; ageStarted?: number | null; frequency?: string | null; timesPerMonth?: number | null; durationYears?: number | null };

export type RegisterInput = {
  cohortId: number;
  /** ใช้บุคคลเดิม (เมื่อพบจากเลขบัตร หรือผู้ใช้ยืนยัน "เป็นคนเดียวกัน") */
  personId?: number | null;
  person: PersonInput;
  incarceration: IncarcerationInput;
  drugUse?: DrugUseInput[];
  screeningScore?: number | null;
  intake?: Record<string, unknown> | null;
  consentSigned?: boolean;
  consentDate?: string | null;
  consentReceiverId?: number | null;
  consentRefused?: boolean;
  consentRefuseReason?: string | null;
  /** ยืนยันรับเข้าทันที (active) หรือบันทึกเป็นร่าง */
  confirmAdmission: boolean;
  /** ผู้ใช้กดยืนยันคำเตือนสีเหลืองแล้ว */
  acknowledgeWarnings?: boolean;
  /** ผู้ดูแลปลดล็อกลงซ้ำ */
  override?: { reason: string } | null;
  enrolledDate: string;
};

export type Actor = { userId: number; canOverride: boolean; consentRequired: boolean; ip?: string | null };

/**
 * ลงทะเบียนเข้ารุ่น — ตรวจกฎกันซ้ำในทรานแซกชันเดียวกับการบันทึก
 * (ฐานข้อมูลมี unique index กันซ้ำอีกชั้น)
 */
export function registerEnrollment(db: DB, input: RegisterInput, actor: Actor) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const cohort = tx.select().from(schema.cohorts).where(eq(schema.cohorts.id, input.cohortId)).get();
    if (!cohort || cohort.deletedAt) throw new RuleError("ไม่พบรุ่นที่เลือก");
    if (cohort.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว ลงทะเบียนเพิ่มไม่ได้");

    const inmateNo = normalizeInmateNo(input.incarceration.inmateNo);
    if (!inmateNo) throw new RuleError("กรุณาใส่เลขประจำตัวผู้ต้องขัง");
    const nid = input.person.nationalId ? normalizeNationalId(input.person.nationalId) : null;
    if (nid && !isValidNationalId(nid)) throw new RuleError("เลขบัตรประชาชนไม่ถูกต้อง (ตรวจหลักสุดท้ายไม่ผ่าน) กรุณาตรวจเลขอีกครั้ง");

    // 1) หา/สร้าง บุคคล + การต้องโทษ
    const existing = findByInmateNo(t, inmateNo);
    let personId: number;
    let incarcerationId: number | null = existing?.incarceration.id ?? null;
    if (existing) {
      personId = existing.person.id;
    } else if (input.personId) {
      personId = input.personId;
    } else {
      const byNid = nid ? findPersonByNationalId(t, nid) : null;
      personId = byNid?.id ?? 0;
    }

    // 2) ตรวจกฎกันซ้ำ
    const priors = personId ? priorsForPerson(t, personId) : [];
    const result = evaluateEnrollment({ targetCourseId: cohort.courseId, incarcerationId, priors });
    let overrideSeq = 0;
    if (result.level === "block") {
      if (!input.override) throw new RuleError(result.messages.join("\n"), result, "blocked");
      if (!actor.canOverride) throw new RuleError("เฉพาะผู้ดูแลระบบเท่านั้นที่ปลดล็อกการลงซ้ำได้", result, "forbidden");
      if (!input.override.reason?.trim()) throw new RuleError("กรุณาระบุเหตุผลการปลดล็อก", result, "reason_required");
      const m = tx
        .select({ m: max(schema.enrollments.overrideSeq) })
        .from(schema.enrollments)
        .where(and(eq(schema.enrollments.incarcerationId, incarcerationId!), eq(schema.enrollments.courseId, cohort.courseId)))
        .get();
      overrideSeq = (m?.m ?? 0) + 1;
    } else if (result.level === "warn" && !input.acknowledgeWarnings) {
      throw new RuleError(result.messages.join("\n"), result, "needs_ack");
    }

    // 3) ความยินยอม PDPA
    let status: "draft" | "active" = input.confirmAdmission ? "active" : "draft";
    if (status === "active" && actor.consentRequired && !input.consentSigned) {
      throw new RuleError("ยังไม่ได้ติ๊กหลักฐานการลงนามยินยอม — บันทึกเป็น \"ร่าง\" ได้ แต่ยืนยันรับเข้าไม่ได้", undefined, "consent_required");
    }

    const now = new Date();
    if (!personId) {
      const p = tx
        .insert(schema.persons)
        .values({
          ...input.person,
          nationalId: nid,
          searchKey: personSearchKey(input.person.firstName, input.person.lastName),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning()
        .get();
      personId = p.id;
      writeAudit(tx, { userId: actor.userId, action: "create", entity: "person", entityId: p.id, personId, after: p, ip: actor.ip });
    } else {
      // เติมข้อมูลที่ยังว่าง (ไม่ทับค่าเดิม)
      const p = tx.select().from(schema.persons).where(eq(schema.persons.id, personId)).get()!;
      const patch: Record<string, unknown> = {};
      for (const [k, v] of Object.entries({ ...input.person, nationalId: nid })) {
        if (v != null && v !== "" && (p as Record<string, unknown>)[k] == null) patch[k] = v;
      }
      if (Object.keys(patch).length) {
        tx.update(schema.persons).set({ ...patch, updatedBy: actor.userId, updatedAt: now }).where(eq(schema.persons.id, personId)).run();
        writeAudit(tx, { userId: actor.userId, action: "update", entity: "person", entityId: personId, personId, after: patch, ip: actor.ip });
      }
    }

    // สเปก 17 (เกณฑ์รับเข้ารายหลักสูตร): ต้องมีเลขบัตร + ติ๊กยืนยันที่บังคับ ก่อนยืนยันรับเข้า (ร่างได้)
    // ตรวจหลังสร้าง/เติมข้อมูลบุคคลแล้ว (incarcerationId อาจยังไม่มี → ตรวจเลขบัตรจาก personId)
    if (status === "active") {
      const course = tx.select().from(schema.courses).where(eq(schema.courses.id, cohort.courseId)).get()!;
      const crit = (course.intakeCriteria ?? {}) as { requireNationalId?: boolean; confirmations?: Array<{ code: string; label: string; required?: boolean }> };
      const gaps: string[] = [];
      if (crit.requireNationalId && !tx.select().from(schema.persons).where(eq(schema.persons.id, personId)).get()?.nationalId) gaps.push(`หลักสูตร ${course.shortName} ต้องมีเลขบัตรประชาชน — ใส่เลขบัตรในขั้น "เกณฑ์รับเข้า"`);
      const given = new Set(((input.intake?.confirmations as string[] | undefined) ?? []));
      for (const c of crit.confirmations ?? []) if (c.required && !given.has(c.code)) gaps.push(`ยังไม่ได้ยืนยัน: ${c.label}`);
      if (gaps.length) throw new RuleError(`${gaps.join("\n")}\n(หรือบันทึกเป็นร่างไว้ก่อน)`, undefined, "criteria_required");
    }

    if (!incarcerationId) {
      const inc = tx
        .insert(schema.incarcerations)
        .values({ ...input.incarceration, inmateNo, personId, createdBy: actor.userId, updatedBy: actor.userId })
        .returning()
        .get();
      incarcerationId = inc.id;
      writeAudit(tx, { userId: actor.userId, action: "create", entity: "incarceration", entityId: inc.id, personId, after: inc, ip: actor.ip });
      for (const d of input.drugUse ?? []) {
        if (!d.substance) continue;
        tx.insert(schema.drugUseHistory).values({ ...d, incarcerationId, createdBy: actor.userId, updatedBy: actor.userId }).run();
      }
    }

    const enrollment = tx
      .insert(schema.enrollments)
      .values({
        incarcerationId,
        cohortId: cohort.id,
        courseId: cohort.courseId,
        overrideSeq,
        overrideBy: overrideSeq ? actor.userId : null,
        overrideReason: overrideSeq ? input.override!.reason : null,
        status,
        enrolledDate: input.enrolledDate,
        screeningScore: input.screeningScore ?? null,
        intake: input.intake ?? null,
        consentSigned: !!input.consentSigned,
        consentDate: input.consentSigned ? input.consentDate ?? input.enrolledDate : null,
        consentReceiverId: input.consentSigned ? input.consentReceiverId ?? actor.userId : null,
        consentRefused: !!input.consentRefused,
        consentRefuseReason: input.consentRefused ? input.consentRefuseReason ?? null : null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning()
      .get();
    writeAudit(tx, {
      userId: actor.userId,
      action: overrideSeq ? "enrollment.override_duplicate" : "create",
      entity: "enrollment",
      entityId: enrollment.id,
      personId,
      after: enrollment,
      note: overrideSeq ? `ปลดล็อกลงซ้ำ: ${input.override!.reason}` : result.messages.join(" / ") || null,
      ip: actor.ip,
    });

    if (status === "active") ensureIntakeTasks(tx, enrollment.id, actor.userId);

    // ไม่ยินยอม → แจ้งหัวหน้า/รอง
    if (input.consentRefused) {
      tx.insert(schema.notifications)
        .values({
          createdAt: now,
          role: "admin",
          severity: "warning",
          kind: "consent_refused",
          message: `มีผู้เข้ารับการฟื้นฟูไม่ยินยอมการจัดเก็บข้อมูล (${cohortLabel(cohort)}) — กรุณาพิจารณา`,
          link: `/cohorts/${cohort.id}/roster`,
        })
        .run();
    }
    return { enrollment, personId, incarcerationId, result };
  });
}

/** เกณฑ์รับเข้าที่ยังขาด (สเปก 17) — ใช้ทั้งตอนลงทะเบียนและยืนยันรับเข้าภายหลัง */
export function intakeGaps(db: DB, e: { courseId: number; incarcerationId: number; intake: unknown }) {
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, e.courseId)).get();
  const crit = (course?.intakeCriteria ?? {}) as { requireNationalId?: boolean; confirmations?: Array<{ code: string; label: string; required?: boolean }> };
  const gaps: string[] = [];
  if (crit.requireNationalId) {
    const p = db.select({ nid: schema.persons.nationalId }).from(schema.incarcerations).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId)).where(eq(schema.incarcerations.id, e.incarcerationId)).get();
    if (!p?.nid) gaps.push("ยังไม่มีเลขบัตรประชาชน");
  }
  const given = new Set(((e.intake as { confirmations?: string[] } | null)?.confirmations) ?? []);
  for (const c of crit.confirmations ?? []) if (c.required && !given.has(c.code)) gaps.push(`ยังไม่ได้ยืนยัน: ${c.label}`);
  return gaps;
}

/** ยืนยันรับเข้า (ร่าง → กำลังอบรม) หลายคนพร้อมกัน */
export function confirmAdmissions(db: DB, enrollmentIds: number[], actor: Actor) {
  return db.transaction((tx) => {
    const rows = tx.select().from(schema.enrollments).where(inArray(schema.enrollments.id, enrollmentIds)).all();
    const done: number[] = [];
    const skipped: Array<{ id: number; reason: string }> = [];
    for (const e of rows) {
      if (e.status !== "draft") {
        skipped.push({ id: e.id, reason: "ไม่ได้อยู่ในสถานะร่าง" });
        continue;
      }
      if (actor.consentRequired && !e.consentSigned) {
        skipped.push({ id: e.id, reason: "ยังไม่มีหลักฐานการลงนามยินยอม" });
        continue;
      }
      const gaps = intakeGaps(tx as unknown as DB, e);
      if (gaps.length) {
        skipped.push({ id: e.id, reason: `${gaps.join(", ")} — เปิดแฟ้มเพื่อแก้เกณฑ์รับเข้า` });
        continue;
      }
      // ผลประเมินสภาวะกาย/จิต "ยังเข้าร่วมไม่ได้" → ยืนยันรับเข้าไม่ได้ (ยกเว้นผู้ดูแล)
      const cond = tx
        .select({ total: schema.assessmentResults.total })
        .from(schema.assessmentResults)
        .innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
        .where(and(eq(schema.assessmentResults.enrollmentId, e.id), eq(schema.assessmentForms.code, "COND"), isNull(schema.assessmentResults.deletedAt)))
        .get();
      if (cond && cond.total === 0 && !actor.canOverride) {
        skipped.push({ id: e.id, reason: "ผลประเมินสภาวะกาย/จิต: ยังเข้าร่วมไม่ได้ (ผู้ดูแลยืนยันได้)" });
        continue;
      }
      tx.update(schema.enrollments)
        .set({ status: "active", updatedBy: actor.userId, updatedAt: new Date(), version: e.version + 1 })
        .where(eq(schema.enrollments.id, e.id))
        .run();
      writeAudit(tx, { userId: actor.userId, action: "update", entity: "enrollment", entityId: e.id, before: { status: "draft" }, after: { status: "active" }, ip: actor.ip });
      ensureIntakeTasks(tx, e.id, actor.userId);
      done.push(e.id);
    }
    return { done, skipped };
  });
}
