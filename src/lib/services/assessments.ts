import { and, asc, desc, eq, inArray, isNull, lte } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { computeResult } from "../assessments/compute";
import type { Item } from "../assessments/scoring";
import { defaultChannel } from "../assessments/forms";
import type { Permission } from "../auth/permissions";
import { writeAudit } from "../audit";
import { notify } from "../notify";
import { RuleError } from "../errors";
import { todayISO } from "../thai-date";

export type FormRow = typeof schema.assessmentForms.$inferSelect;
export type VersionRow = typeof schema.assessmentFormVersions.$inferSelect;

/** สิทธิ์ตามหมวดแบบประเมิน (สเปก 2.2A) */
export function formAccess(can: (p: Permission) => boolean, form: Pick<FormRow, "category" | "sensitive">) {
  if (form.category === "health_mental") return { view: can("health.view"), edit: can("health.mental_edit") || can("health.edit") };
  if (form.category === "health_physical") return { view: can("health.view"), edit: can("health.edit") };
  if (form.sensitive) return { view: can("health.view"), edit: can("health.edit") };
  return { view: can("assessment.view") || can("health.view"), edit: can("assessment.edit") };
}

export function listForms(db: DB) {
  return db.select().from(schema.assessmentForms).where(and(eq(schema.assessmentForms.active, true), isNull(schema.assessmentForms.deletedAt))).orderBy(asc(schema.assessmentForms.sortOrder)).all();
}

export function getForm(db: DB, idOrCode: number | string) {
  return db
    .select()
    .from(schema.assessmentForms)
    .where(typeof idOrCode === "number" ? eq(schema.assessmentForms.id, idOrCode) : eq(schema.assessmentForms.code, idOrCode))
    .get() ?? null;
}

/** เวอร์ชันที่มีผล ณ วันประเมิน (เกณฑ์แช่แข็ง) */
export function versionFor(db: DB, formId: number, date: string): VersionRow {
  const v = db
    .select()
    .from(schema.assessmentFormVersions)
    .where(and(eq(schema.assessmentFormVersions.formId, formId), lte(schema.assessmentFormVersions.effectiveFrom, date)))
    .orderBy(desc(schema.assessmentFormVersions.effectiveFrom), desc(schema.assessmentFormVersions.version))
    .get();
  if (!v) throw new RuleError("ยังไม่มีเวอร์ชันของแบบประเมินที่ใช้ได้ในวันที่นี้");
  return v;
}

export type SaveInput = {
  enrollmentId: number; formId: number; round: string; period?: string; assessedDate: string; answers: unknown; assessorId?: number | null; source?: string | null;
  /** paper | system (ไม่ส่ง = ค่าเริ่มต้นของแบบนั้น) */
  channel?: string | null;
  /** ที่เก็บกระดาษต้นฉบับ (ใช้เมื่อ channel = paper) */
  paperLocation?: string | null;
};

export function saveAssessment(db: DB, input: SaveInput, actor: { userId: number; can: (p: Permission) => boolean; ip?: string | null }, loadedVersion?: number) {
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const form = getForm(t, input.formId);
    if (!form) throw new RuleError("ไม่พบแบบประเมิน");
    if (!formAccess(actor.can, form).edit) throw new RuleError("คุณไม่มีสิทธิ์บันทึกแบบประเมินนี้");
    if (!(form.rounds as string[]).includes(input.round)) throw new RuleError("แบบประเมินนี้ไม่ใช้ในรอบที่เลือก");
    const enr = tx.select().from(schema.enrollments).where(eq(schema.enrollments.id, input.enrollmentId)).get();
    if (!enr || enr.deletedAt) throw new RuleError("ไม่พบการลงทะเบียน");
    if (input.assessedDate > todayISO()) throw new RuleError("วันที่ประเมินต้องไม่เป็นวันในอนาคต");
    const v = versionFor(t, form.id, input.assessedDate);
    const r = computeResult(form.kind, v.items as Item[], v.scoring as Record<string, unknown>, input.answers);
    // แบบสภาวะกาย/จิต และสมรรถภาพ ยอมให้บันทึกบางส่วนได้ แต่แบบรายข้อต้องครบและอยู่ในช่วง
    if (r.errors.length && form.kind !== "fitness") throw new RuleError(r.errors.join(" · "));
    const channel = input.channel ?? defaultChannel(form.code);
    if (channel !== "paper" && channel !== "system") throw new RuleError("ช่องทางการกรอกไม่ถูกต้อง");
    const paperLocation = channel === "paper" ? input.paperLocation?.trim().slice(0, 200) || null : null;
    const period = input.period ?? "";
    const prev = tx
      .select()
      .from(schema.assessmentResults)
      .where(and(eq(schema.assessmentResults.enrollmentId, enr.id), eq(schema.assessmentResults.formId, form.id), eq(schema.assessmentResults.round, input.round), eq(schema.assessmentResults.period, period), isNull(schema.assessmentResults.deletedAt)))
      .get();
    if (prev && loadedVersion !== undefined && prev.version !== loadedVersion) {
      throw new RuleError("มีผู้อื่นบันทึกแบบประเมินนี้ไปแล้วระหว่างที่คุณเปิดอยู่ — กรุณาโหลดหน้าใหม่", undefined, "conflict");
    }
    const values = {
      versionId: v.id, assessedDate: input.assessedDate, assessorId: input.assessorId ?? actor.userId, answers: input.answers as object,
      total: r.total, level: r.level, tone: r.tone, details: r.details, sensitive: form.sensitive, source: input.source ?? null,
      channel, paperLocation,
    };
    let id: number;
    if (prev) {
      tx.update(schema.assessmentResults).set({ ...values, updatedBy: actor.userId, updatedAt: new Date(), version: prev.version + 1 }).where(eq(schema.assessmentResults.id, prev.id)).run();
      id = prev.id;
      writeAudit(tx, { userId: actor.userId, action: "update", entity: "assessment", entityId: id, before: { total: prev.total, level: prev.level }, after: { total: r.total, level: r.level }, note: form.code, ip: actor.ip });
    } else {
      id = tx.insert(schema.assessmentResults).values({ enrollmentId: enr.id, formId: form.id, round: input.round, period, ...values, createdBy: actor.userId, updatedBy: actor.userId }).returning().get().id;
      writeAudit(tx, { userId: actor.userId, action: "create", entity: "assessment", entityId: id, after: { form: form.code, round: input.round, total: r.total, level: r.level }, ip: actor.ip });
    }
    // แจ้งเตือนสถานพยาบาลทันที (ข้อมูลอ่อนไหว → ส่งเฉพาะบทบาทที่มีสิทธิ์สุขภาพ)
    if (r.alerts.length) {
      const who = tx
        .select({ f: schema.persons.firstName, l: schema.persons.lastName, no: schema.incarcerations.inmateNo })
        .from(schema.incarcerations)
        .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
        .where(eq(schema.incarcerations.id, enr.incarcerationId))
        .get();
      for (const a of r.alerts) {
        for (const role of form.sensitive ? ["medical", "mental_health", "admin"] : ["admin", "rehab"]) {
          notify(tx, { role, severity: a.severity, kind: `assessment_${form.code}`, message: `${who?.f} ${who?.l} (${who?.no}): ${a.message}`, link: `/enrollments/${enr.id}/assessments` });
        }
      }
    }
    return { id, result: r };
  });
}

/** ผลประเมินทั้งหมดของการลงทะเบียน (กรองตามสิทธิ์) */
export function resultsOf(db: DB, enrollmentIds: number[], can: (p: Permission) => boolean) {
  if (!enrollmentIds.length) return [];
  const rows = db
    .select({ r: schema.assessmentResults, f: schema.assessmentForms })
    .from(schema.assessmentResults)
    .innerJoin(schema.assessmentForms, eq(schema.assessmentForms.id, schema.assessmentResults.formId))
    .where(and(inArray(schema.assessmentResults.enrollmentId, enrollmentIds), isNull(schema.assessmentResults.deletedAt)))
    .all();
  return rows.filter((x) => formAccess(can, x.f).view);
}

/**
 * แบบประเมินที่ถึงรอบแต่ยังไม่ทำ (ใช้กับหน้าแรก/ข้อมูลไม่ครบ/ชุดฉุกเฉิน)
 * ก่อนเรียน: ทุกคนที่ร่าง/กำลังอบรม · หลังเรียน: เมื่อเหลือ ≤ 2 วันก่อนจบ หรือจบแล้ว
 * ผูกกับการลงทะเบียน → การต้องโทษรอบใหม่จะมีงาน Baseline ใหม่ทุกแบบเสมอ (ไม่ใช้คะแนนรอบเก่า)
 */
export function dueAssessments(db: DB, cohortId: number, today = todayISO()) {
  const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!cohort) return [];
  const course = db.select().from(schema.courses).where(eq(schema.courses.id, cohort.courseId)).get()!;
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(course.code));
  const enrs = db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["draft", "active", "completed"]), isNull(schema.enrollments.deletedAt))).all();
  if (!enrs.length) return [];
  const done = db
    .select({ e: schema.assessmentResults.enrollmentId, f: schema.assessmentResults.formId, round: schema.assessmentResults.round })
    .from(schema.assessmentResults)
    .where(and(inArray(schema.assessmentResults.enrollmentId, enrs.map((e) => e.id)), isNull(schema.assessmentResults.deletedAt)))
    .all();
  const has = new Set(done.map((d) => `${d.e}:${d.f}:${d.round}`));
  const postDue = today >= addDaysSafe(cohort.endDate, -2);
  const out: Array<{ enrollmentId: number; formId: number; formCode: string; formName: string; round: string; sensitive: boolean; category: string }> = [];
  for (const e of enrs) {
    for (const f of forms) {
      const rounds = f.rounds as string[];
      if (rounds.includes("pre") && e.status !== "completed" && !has.has(`${e.id}:${f.id}:pre`)) out.push({ enrollmentId: e.id, formId: f.id, formCode: f.code, formName: f.shortName, round: "pre", sensitive: f.sensitive, category: f.category });
      if (rounds.includes("post") && postDue && e.status !== "draft" && !has.has(`${e.id}:${f.id}:post`)) out.push({ enrollmentId: e.id, formId: f.id, formCode: f.code, formName: f.shortName, round: "post", sensitive: f.sensitive, category: f.category });
    }
  }
  return out;
}

function addDaysSafe(iso: string, n: number) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
