"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireAction, clientIp } from "@/lib/auth/session";
import { recordReleases, cancelRelease } from "@/lib/services/release";
import { normalizeInmateNo } from "@/lib/services/registry";
import { isValidISODate } from "@/lib/thai-date";
import { toError, type ActionResult } from "@/lib/action-result";

export type ReleaseCandidate = {
  inmateNo: string;
  found: boolean;
  incarcerationId?: number;
  name?: string;
  zone?: string | null;
  thumb?: string | null;
  alreadyReleased?: string | null;
  ongoing?: string[];
};

/** วางเลขประจำตัวหลายเลข → แสดงชื่อ+รูปให้ตรวจ */
export async function checkInmateNos(text: string): Promise<ActionResult<ReleaseCandidate[]>> {
  try {
    await requireAction("release.edit");
    const nos = Array.from(new Set(text.split(/[\s,;]+/).map(normalizeInmateNo).filter(Boolean))).slice(0, 200);
    if (!nos.length) return { ok: false, error: "กรุณาวางเลขประจำตัวอย่างน้อย 1 เลข (คั่นด้วยการขึ้นบรรทัดใหม่ เว้นวรรค หรือจุลภาค)" };
    const db = getDb();
    const incs = db
      .select({ inc: schema.incarcerations, p: schema.persons })
      .from(schema.incarcerations)
      .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
      .where(inArray(schema.incarcerations.inmateNo, nos))
      .all();
    const ongoing = incs.length
      ? db
          .select({ incId: schema.enrollments.incarcerationId, course: schema.courses.shortName, n: schema.cohorts.number, fy: schema.cohorts.fiscalYear })
          .from(schema.enrollments)
          .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId))
          .innerJoin(schema.courses, eq(schema.courses.id, schema.enrollments.courseId))
          .where(and(inArray(schema.enrollments.incarcerationId, incs.map((x) => x.inc.id)), inArray(schema.enrollments.status, ["draft", "active"]), isNull(schema.enrollments.deletedAt)))
          .all()
      : [];
    return {
      ok: true,
      data: nos.map((no) => {
        const x = incs.find((i) => i.inc.inmateNo === no);
        if (!x) return { inmateNo: no, found: false };
        return {
          inmateNo: no, found: true, incarcerationId: x.inc.id, name: `${x.p.prefix ?? ""}${x.p.firstName} ${x.p.lastName}`, zone: x.inc.zone,
          thumb: x.inc.thumbPath ? `/api/files/photo/${x.inc.id}?s=thumb` : null, alreadyReleased: x.inc.releasedDate,
          ongoing: ongoing.filter((o) => o.incId === x.inc.id).map((o) => `${o.course} รุ่นที่ ${o.n}/${o.fy}`),
        };
      }),
    };
  } catch (e) {
    return toError(e);
  }
}

export async function recordReleaseAction(incarcerationIds: number[], releasedDate: string, reason: string, note: string): Promise<ActionResult<Awaited<ReturnType<typeof recordReleases>>>> {
  try {
    const auth = await requireAction("release.edit");
    if (!isValidISODate(releasedDate)) return { ok: false, error: "กรุณาใส่วันที่ออกจากเรือนจำ" };
    const r = recordReleases(getDb(), { incarcerationIds, releasedDate, reason, note: note || null }, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/release");
    return { ok: true, data: r };
  } catch (e) {
    return toError(e);
  }
}

export async function cancelReleaseAction(eventId: number, reason: string): Promise<ActionResult<{ restoredEnrollments: number; restoredAttendance: number }>> {
  try {
    const auth = await requireAction("release.edit");
    const r = cancelRelease(getDb(), eventId, reason, { userId: auth.user.id, ip: await clientIp() });
    revalidatePath("/release");
    return { ok: true, data: r };
  } catch (e) {
    return toError(e);
  }
}
