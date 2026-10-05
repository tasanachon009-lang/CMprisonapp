"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { setTopicChips, cleanChips } from "@/lib/services/session-close";
import { toError, type ActionResult } from "@/lib/action-result";
import { getSetting, setSetting } from "@/lib/bootstrap";
import { writeAudit } from "@/lib/audit";
import { saveRate, saveTopic, bulkUpdateTopics } from "@/lib/services/pay-setup";

const RateZ = z.object({
  name: z.string().max(200), kind: z.enum(["internal", "external"]), externalType: z.enum(["gov", "private", "volunteer", "civil"]).nullable(),
  perHourBaht: z.number(), dailyCapBaht: z.number().nullable(), fromFiscalYear: z.number().int(), active: z.boolean(), note: z.string().max(500).nullable().optional(),
});

export async function saveRateAction(id: number | null, input: z.input<typeof RateZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("rates.manage");
    const p = RateZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลอัตราไม่ถูกต้อง — ตรวจตัวเลขอีกครั้ง" };
    saveRate(getDb(), id, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/rates");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const PaySettingsZ = z.object({
  maxPayableByType: z.record(z.string(), z.number().int().min(0).max(20)),
  withholdingTax: z.object({ enabled: z.boolean(), pct: z.number().min(0).max(15) }),
});

/** จำนวนวิทยากรที่เบิกได้ตามลักษณะกิจกรรม + ภาษีหัก ณ ที่จ่าย */
export async function savePaySettingsAction(input: z.input<typeof PaySettingsZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("rates.manage");
    const p = PaySettingsZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ค่าที่ตั้งไม่ถูกต้อง — จำนวนคน 0–20, ภาษี 0–15%" };
    const db = getDb();
    const before = { max: getSetting(db, "pay.maxPayableByType", null), tax: getSetting(db, "pay.withholdingTax", null) };
    setSetting(db, "pay.maxPayableByType", p.data.maxPayableByType, auth.user.id);
    setSetting(db, "pay.withholdingTax", p.data.withholdingTax, auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "pay_settings", before, after: p.data, ip: await clientIp() });
    revalidatePath("/admin/rates");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

const TopicZ = z.object({
  name: z.string().max(200), category: z.string().max(200).nullable(), standardHours: z.number().nullable(),
  activityType: z.string().max(20), color: z.string().max(10).nullable(), staffingType: z.enum(["individual", "team"]), maxStaff: z.number().int().nullable(),
  payable: z.boolean(), internalRateId: z.number().int().nullable(), externalRates: z.record(z.string(), z.number().int().nullable()).nullable(),
  splitMethod: z.enum(["full", "equal", "ratio"]), active: z.boolean(), sortOrder: z.number().int(),
  defaultStaff: z.array(z.object({ userId: z.number().int().optional(), instructorId: z.number().int().optional() })).max(20).nullable().optional(),
});

export async function saveTopicAction(courseId: number, id: number | null, input: z.input<typeof TopicZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("topics.manage");
    const p = TopicZ.safeParse(input);
    if (!p.success) return { ok: false, error: "ข้อมูลหัวข้อไม่ถูกต้อง" };
    saveTopic(getDb(), courseId, id, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/topics");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function bulkTopicsAction(courseId: number, ids: number[], patch: Partial<z.input<typeof TopicZ>>): Promise<ActionResult<{ n: number }>> {
  try {
    const auth = await requireAction("topics.manage");
    const p = TopicZ.partial().safeParse(patch);
    if (!p.success) return { ok: false, error: "ค่าที่จะเปลี่ยนไม่ถูกต้อง" };
    const n = bulkUpdateTopics(getDb(), courseId, ids.slice(0, 500), p.data as never, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/topics");
    return { ok: true, data: { n }, message: `แก้แล้ว ${n} หัวข้อ` };
  } catch (e) {
    return toError(e);
  }
}

/** สเปก 22B: ชิป "สิ่งที่ได้" ของหัวข้อ */
export async function saveTopicChipsAction(topicId: number, chips: string[]): Promise<ActionResult> {
  try {
    const auth = await requireAction("topics.manage");
    const p = z.array(z.string().max(100)).max(20).safeParse(chips);
    if (!p.success) return { ok: false, error: "ชิปได้สูงสุด 20 อัน อันละไม่เกิน 100 ตัวอักษร" };
    setTopicChips(getDb(), topicId, p.data, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/admin/topics");
    return { ok: true, message: "บันทึกชิปแล้ว" };
  } catch (e) {
    return toError(e);
  }
}

const ChoicesZ = z.object({
  generalChips: z.array(z.string().max(100)).max(20),
  reasons: z.object({ partial: z.array(z.string().max(100)).max(20), not_done: z.array(z.string().max(100)).max(20) }),
});

/** สเปก 22B: ชิปทั่วไป + เหตุผลสำเร็จรูป */
export async function saveReportChoicesAction(input: z.input<typeof ChoicesZ>): Promise<ActionResult> {
  try {
    const auth = await requireAction("topics.manage");
    const p = ChoicesZ.safeParse(input);
    if (!p.success) return { ok: false, error: "รายการได้สูงสุด 20 ข้อ ข้อละไม่เกิน 100 ตัวอักษร" };
    const db = getDb();
    const before = { generalChips: getSetting(db, "report.generalChips", null), reasons: getSetting(db, "report.reasons", null) };
    const clean = { generalChips: cleanChips(p.data.generalChips), reasons: { partial: cleanChips(p.data.reasons.partial), not_done: cleanChips(p.data.reasons.not_done) } };
    setSetting(db, "report.generalChips", clean.generalChips, auth.user.id);
    setSetting(db, "report.reasons", clean.reasons, auth.user.id);
    writeAudit(db, { userId: auth.user.id, action: "settings.change", entity: "report_choices", before, after: clean, ip: await clientIp() });
    revalidatePath("/admin/topics");
    return { ok: true, message: "บันทึกแล้ว" };
  } catch (e) {
    return toError(e);
  }
}