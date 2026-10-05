"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { toError, type ActionResult } from "@/lib/action-result";
import { saveInstructor, setInstructorActive, getInstructor } from "@/lib/services/instructors";
import { searchSubdistricts, type SubdistrictHit } from "@/lib/thai-address";
import { isValidISODate } from "@/lib/thai-date";

const s = (max: number) => z.string().max(max).nullable().optional();
const InstructorZ = z.object({
  kind: z.enum(["internal", "external"]),
  userId: z.number().int().positive().nullable().optional(),
  externalType: z.enum(["gov", "private", "volunteer", "civil"]).nullable().optional(),
  prefix: s(30), firstName: s(100), lastName: s(100), position: s(200), organization: s(200),
  phone: s(20), email: s(120), nationalId: s(20),
  addrHouseNo: s(50), addrMoo: s(10), addrSoi: s(100), addrRoad: s(100),
  addrSubdistrictId: z.number().int().nullable().optional(), addrSubdistrict: s(100), addrDistrict: s(100), addrProvince: s(100), addrPostcode: s(5),
  payeeType: z.enum(["person", "company"]).optional(), companyName: s(200),
  bank: s(100), bankBranch: s(100), accountType: z.enum(["savings", "current", "fixed"]).nullable().optional(), accountName: s(200), accountNo: s(30),
  notifyChannel: z.enum(["sms", "email", "both"]).nullable().optional(),
  bankBookReceived: z.boolean().optional(), bankBookReceivedDate: z.string().nullable().optional().refine((v) => !v || isValidISODate(v), "วันที่ได้รับสำเนาสมุดบัญชีไม่ถูกต้อง"),
  expertise: s(1000), note: s(1000),
});
/** ช่องที่ผู้ไม่มีสิทธิ์ข้อมูลอ่อนไหว แก้ทับของเดิมไม่ได้ (เห็นแบบปิดบัง) */
const SENSITIVE_KEYS = ["nationalId", "accountNo", "addrHouseNo", "addrMoo", "addrSoi", "addrRoad"] as const;

export async function saveInstructorAction(id: number | null, input: z.input<typeof InstructorZ>, loadedVersion?: number): Promise<ActionResult<{ id: number }>> {
  try {
    const auth = await requireAction("instructors.manage");
    const parsed = InstructorZ.safeParse(input);
    if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
    const data: Record<string, unknown> = { ...parsed.data };
    if (id && !auth.can("instructors.sensitive")) {
      const prev = getInstructor(getDb(), id);
      for (const k of SENSITIVE_KEYS) data[k] = prev?.[k] ?? null;
    }
    const newId = saveInstructor(getDb(), id, data as never, { userId: auth.user.id, ip: await clientIp() }, loadedVersion);
    revalidatePath("/instructors");
    return { ok: true, data: { id: newId } };
  } catch (e) {
    return toError(e);
  }
}

export async function setInstructorActiveAction(id: number, active: boolean): Promise<ActionResult> {
  try {
    const auth = await requireAction("instructors.manage");
    setInstructorActive(getDb(), id, active, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/instructors");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** ค้นหาตำบล/แขวง (ข้อมูลออฟไลน์) */
export async function searchAddressAction(q: string): Promise<SubdistrictHit[]> {
  await requireAction("instructors.manage");
  return searchSubdistricts(String(q).slice(0, 60));
}
