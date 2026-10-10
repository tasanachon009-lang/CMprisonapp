"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { getSetting } from "@/lib/bootstrap";
import {
  findByInmateNo, findPersonByNationalId, findPossibleSamePersons, priorsForPerson, registerEnrollment, incarcerationsOfPerson, normalizeInmateNo,
} from "@/lib/services/registry";
import { evaluateEnrollment, type RuleResult } from "@/lib/rules/enrollment-rules";
import { isValidNationalId, maskNationalId, normalizeNationalId } from "@/lib/thai-id";
import { isValidISODate } from "@/lib/thai-date";
import { toError, type ActionResult } from "@/lib/action-result";
import { writeAudit } from "@/lib/audit";

export type PersonDTO = {
  id: number; prefix: string | null; firstName: string; lastName: string; nationalIdMasked: string; hasNationalId: boolean;
  birthDate: string | null; gender: string | null; maritalStatus: string | null; education: string | null; occupation: string | null; familySize: number | null;
};
export type HistoryItem = { courseName: string; cohortLabel: string; status: string; inmateNo: string; current: boolean };

function personDTO(p: typeof schema.persons.$inferSelect): PersonDTO {
  return {
    id: p.id, prefix: p.prefix, firstName: p.firstName, lastName: p.lastName, nationalIdMasked: maskNationalId(p.nationalId), hasNationalId: !!p.nationalId,
    birthDate: p.birthDate, gender: p.gender, maritalStatus: p.maritalStatus, education: p.education, occupation: p.occupation, familySize: p.familySize,
  };
}

function cohortCourse(cohortId: number) {
  const c = getDb().select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) throw new Error("ไม่พบรุ่น");
  return c;
}

function history(personId: number, currentIncId: number | null): HistoryItem[] {
  return priorsForPerson(getDb(), personId).map((p) => ({ courseName: p.courseName, cohortLabel: p.cohortLabel, status: p.status, inmateNo: p.inmateNo, current: p.incarcerationId === currentIncId }));
}

export type LookupResult = {
  kind: "existing_incarceration" | "new";
  person?: PersonDTO;
  incarceration?: { id: number; inmateNo: string; offense: string | null; zone: string | null; room: string | null; prisonerClass: string | null; admittedDate: string | null; sentenceYears: number | null; sentenceMonths: number | null; sentenceDays: number | null; releasedDate: string | null };
  history?: HistoryItem[];
  evaluation?: RuleResult;
};

/** ขั้นที่ 1: ใส่เลขประจำตัวผู้ต้องขัง */
export async function lookupInmate(cohortId: number, inmateNo: string): Promise<ActionResult<LookupResult>> {
  try {
    await requireAction("registry.edit");
    const no = normalizeInmateNo(inmateNo);
    if (!no) return { ok: false, error: "กรุณาใส่เลขประจำตัวผู้ต้องขัง" };
    const db = getDb();
    const cohort = cohortCourse(cohortId);
    const found = findByInmateNo(db, no);
    if (!found) return { ok: true, data: { kind: "new" } };
    if (found.incarceration.releasedDate) {
      return { ok: false, error: `เลข ${no} ถูกบันทึกว่าออกจากเรือนจำแล้ว (${found.incarceration.releasedDate}) หากบันทึกผิด กรุณายกเลิกที่หน้า "บันทึกออกจากเรือนจำ"` };
    }
    const evaluation = evaluateEnrollment({ targetCourseId: cohort.courseId, incarcerationId: found.incarceration.id, priors: priorsForPerson(db, found.person.id) });
    const i = found.incarceration;
    return {
      ok: true,
      data: {
        kind: "existing_incarceration",
        person: personDTO(found.person),
        incarceration: { id: i.id, inmateNo: i.inmateNo, offense: i.offense, zone: i.zone, room: i.room, prisonerClass: i.prisonerClass, admittedDate: i.admittedDate, sentenceYears: i.sentenceYears, sentenceMonths: i.sentenceMonths, sentenceDays: i.sentenceDays, releasedDate: i.releasedDate },
        history: history(found.person.id, i.id),
        evaluation,
      },
    };
  } catch (e) {
    return toError(e);
  }
}

/** เลขใหม่ → ใส่เลขบัตรประชาชน → ค้นการต้องโทษครั้งก่อน */
export async function lookupNationalId(cohortId: number, nationalId: string): Promise<ActionResult<{ person: PersonDTO | null; history: HistoryItem[]; evaluation: RuleResult | null; incarcerations: number }>> {
  try {
    await requireAction("registry.edit");
    const nid = normalizeNationalId(nationalId);
    if (!isValidNationalId(nid)) return { ok: false, error: "เลขบัตรประชาชนไม่ถูกต้อง (ต้องมี 13 หลัก และหลักสุดท้ายต้องตรงตามสูตร) กรุณาตรวจอีกครั้ง" };
    const db = getDb();
    const cohort = cohortCourse(cohortId);
    const p = findPersonByNationalId(db, nid);
    if (!p) return { ok: true, data: { person: null, history: [], evaluation: null, incarcerations: 0 } };
    const evaluation = evaluateEnrollment({ targetCourseId: cohort.courseId, incarcerationId: null, priors: priorsForPerson(db, p.id) });
    return { ok: true, data: { person: personDTO(p), history: history(p.id, null), evaluation, incarcerations: incarcerationsOfPerson(db, p.id).length } };
  } catch (e) {
    return toError(e);
  }
}

/** ไม่มีเลขบัตร → เทียบชื่อ-สกุล + วันเกิด แสดง "อาจเป็นคนเดียวกัน" */
export async function matchByName(cohortId: number, firstName: string, lastName: string, birthDate: string | null): Promise<ActionResult<Array<{ person: PersonDTO; history: HistoryItem[]; inmateNos: string[]; evaluation: RuleResult }>>> {
  try {
    await requireAction("registry.edit");
    if (!firstName.trim() || !lastName.trim()) return { ok: true, data: [] };
    const db = getDb();
    const cohort = cohortCourse(cohortId);
    const cands = findPossibleSamePersons(db, firstName, lastName, birthDate).slice(0, 10);
    return {
      ok: true,
      data: cands.map((p) => ({
        person: personDTO(p),
        history: history(p.id, null),
        inmateNos: incarcerationsOfPerson(db, p.id).map((i) => i.inmateNo),
        evaluation: evaluateEnrollment({ targetCourseId: cohort.courseId, incarcerationId: null, priors: priorsForPerson(db, p.id) }),
      })),
    };
  } catch (e) {
    return toError(e);
  }
}

const opt = <T extends z.ZodTypeAny>(s: T) => s.nullable().optional();
const RegisterSchema = z.object({
  cohortId: z.number().int(),
  personId: opt(z.number().int()),
  person: z.object({
    prefix: opt(z.string().max(30)),
    firstName: z.string().trim().min(1, "กรุณาใส่ชื่อ").max(100),
    lastName: z.string().trim().min(1, "กรุณาใส่นามสกุล").max(100),
    nationalId: opt(z.string().max(20)),
    birthDate: opt(z.string().refine((v) => !v || isValidISODate(v), "วันเกิดไม่ถูกต้อง")),
    gender: opt(z.enum(["male", "female", "other"])),
    maritalStatus: opt(z.string().max(50)),
    education: opt(z.string().max(100)),
    occupation: opt(z.string().max(100)),
    familySize: opt(z.number().int().min(0).max(50)),
  }),
  incarceration: z.object({
    inmateNo: z.string().trim().min(1, "กรุณาใส่เลขประจำตัวผู้ต้องขัง").max(40),
    admittedDate: opt(z.string().refine((v) => !v || isValidISODate(v), "วันที่รับตัวไม่ถูกต้อง")),
    offense: opt(z.string().max(300)),
    sentenceYears: opt(z.number().int().min(0).max(99)),
    sentenceMonths: opt(z.number().int().min(0).max(11)),
    sentenceDays: opt(z.number().int().min(0).max(31)),
    sentenceStatus: opt(z.string().max(50)),
    zone: opt(z.string().max(50)),
    room: opt(z.string().max(50)),
    prisonerClass: opt(z.string().max(50)),
  }),
  drugUse: z.array(z.object({ substance: z.string().max(50), ageStarted: opt(z.number().int().min(1).max(99)), frequency: opt(z.string().max(20)), timesPerMonth: opt(z.number().int().min(0).max(31)), durationYears: opt(z.number().min(0).max(80)) })).max(10).optional(),
  screeningScore: opt(z.number().int().min(0).max(100)),
  intake: opt(z.record(z.string(), z.unknown())),
  consentSigned: z.boolean().optional(),
  consentDate: opt(z.string()),
  consentRefused: z.boolean().optional(),
  consentRefuseReason: opt(z.string().max(500)),
  confirmAdmission: z.boolean(),
  acknowledgeWarnings: z.boolean().optional(),
  override: opt(z.object({ reason: z.string().max(500) })),
  enrolledDate: z.string().refine(isValidISODate, "วันที่ลงทะเบียนไม่ถูกต้อง"),
});

export type RegisterPayload = z.input<typeof RegisterSchema>;

export async function registerAction(payload: RegisterPayload): Promise<ActionResult<{ enrollmentId: number; personId: number; messages: string[] }>> {
  try {
    const auth = await requireAction("registry.edit");
    const parsed = RegisterSchema.safeParse(payload);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const db = getDb();
    const r = registerEnrollment(db, parsed.data, {
      userId: auth.user.id,
      canOverride: auth.can("registry.override_duplicate"),
      consentRequired: getSetting(db, "pdpa.consentRequired", true),
      ip: await clientIp(),
    });
    revalidatePath(`/cohorts/${parsed.data.cohortId}`);
    return { ok: true, data: { enrollmentId: r.enrollment.id, personId: r.personId, messages: r.result.messages } };
  } catch (e) {
    return toError(e);
  }
}

/** กดดูเลขบัตรเต็ม — เฉพาะผู้มีสิทธิ์ และบันทึกการกดดูทุกครั้ง */
export async function revealNationalId(personId: number): Promise<ActionResult<string>> {
  try {
    const auth = await requireAction("national_id.view_full");
    const db = getDb();
    const p = db.select().from(schema.persons).where(eq(schema.persons.id, personId)).get();
    if (!p?.nationalId) return { ok: false, error: "ไม่มีเลขบัตรประชาชน" };
    writeAudit(db, { userId: auth.user.id, action: "view_sensitive", entity: "person.national_id", entityId: personId, personId, ip: await clientIp() });
    return { ok: true, data: p.nationalId };
  } catch (e) {
    return toError(e);
  }
}
