import { and, eq, gt, inArray, isNull } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "./registry";
import { lookupLabel } from "../bootstrap";
import { applyReleaseToFollowup, revertFollowupEffects, type FollowupEffects } from "./followup";

type AttendanceRow = typeof schema.attendance.$inferSelect;

export type ReleaseEffects = {
  enrollments: Array<{ id: number; from: string; leftDate: string | null; leftReason: string | null }>;
  removedAttendance: AttendanceRow[];
  followup?: FollowupEffects;
};

/**
 * บันทึกการออกจากเรือนจำ (สเปก 8) ทีละหลายคน
 * ระบบทำอัตโนมัติ: กำลังอบรม → "ออกก่อนกำหนด", ตัดออกจากเช็คชื่อตั้งแต่วันนั้น
 * (ลบแถวเช็คชื่อของคาบตั้งแต่วันที่ออก เก็บไว้ใน effects เพื่อย้อนได้)
 * งาน บสต./ประเมินค้าง จะต่อเติมในขั้น 2
 */
export function recordReleases(
  db: DB,
  input: { incarcerationIds: number[]; releasedDate: string; reason: string; note?: string | null },
  actor: { userId: number; ip?: string | null },
) {
  if (!input.incarcerationIds.length) throw new RuleError("ยังไม่ได้เลือกผู้ต้องขัง");
  if (!input.reason) throw new RuleError("กรุณาเลือกเหตุผลการออก");
  const batchId = randomUUID();
  return db.transaction((tx) => {
    const t = tx as unknown as DB;
    const reasonLabel = lookupLabel(t, "release_reason", input.reason);
    const summary: Array<{ incarcerationId: number; inmateNo: string; name: string; actions: string[] }> = [];
    for (const incId of input.incarcerationIds) {
      const inc = tx.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, incId)).get();
      if (!inc) throw new RuleError(`ไม่พบการต้องโทษรหัส ${incId}`);
      if (inc.releasedDate) throw new RuleError(`เลข ${inc.inmateNo} บันทึกออกจากเรือนจำไปแล้ว (${inc.releasedDate}) — ถ้าต้องแก้ ให้ยกเลิกรายการเดิมก่อน`);
      const person = tx.select().from(schema.persons).where(eq(schema.persons.id, inc.personId)).get()!;
      const actions: string[] = [];
      const effects: ReleaseEffects = { enrollments: [], removedAttendance: [] };

      const event = tx
        .insert(schema.releaseEvents)
        .values({ batchId, incarcerationId: incId, releasedDate: input.releasedDate, reason: input.reason, note: input.note ?? null, createdBy: actor.userId, updatedBy: actor.userId })
        .returning()
        .get();

      tx.update(schema.incarcerations)
        .set({ releasedDate: input.releasedDate, releaseReason: input.reason, releaseNote: input.note ?? null, updatedBy: actor.userId, updatedAt: new Date(), version: inc.version + 1 })
        .where(eq(schema.incarcerations.id, incId))
        .run();
      actions.push(`บันทึกออกจากเรือนจำ ${reasonLabel}`);

      const ongoing = tx
        .select()
        .from(schema.enrollments)
        .where(and(eq(schema.enrollments.incarcerationId, incId), inArray(schema.enrollments.status, ["draft", "active"]), isNull(schema.enrollments.deletedAt)))
        .all();
      for (const e of ongoing) {
        effects.enrollments.push({ id: e.id, from: e.status, leftDate: e.leftDate, leftReason: e.leftReason });
        tx.update(schema.enrollments)
          .set({ status: "dropped", statusBeforeRelease: e.status, leftDate: input.releasedDate, leftReason: "released", releaseEventId: event.id, updatedBy: actor.userId, updatedAt: new Date(), version: e.version + 1 })
          .where(eq(schema.enrollments.id, e.id))
          .run();
        // ตัดออกจากเช็คชื่อตั้งแต่วันที่ออก
        const sessIds = tx
          .select({ id: schema.cohortSessions.id })
          .from(schema.cohortSessions)
          .where(and(eq(schema.cohortSessions.cohortId, e.cohortId), gt(schema.cohortSessions.date, prevDay(input.releasedDate))))
          .all()
          .map((s) => s.id);
        if (sessIds.length) {
          const rows = tx
            .select()
            .from(schema.attendance)
            .where(and(eq(schema.attendance.enrollmentId, e.id), inArray(schema.attendance.sessionId, sessIds)))
            .all();
          if (rows.length) {
            effects.removedAttendance.push(...rows);
            tx.delete(schema.attendance).where(inArray(schema.attendance.id, rows.map((r) => r.id))).run();
          }
        }
        actions.push(`เปลี่ยนสถานะการอบรมเป็น "ออกก่อนกำหนด" และตัดออกจากการเช็คชื่อตั้งแต่วันที่ออก`);
      }
      if (!ongoing.length) actions.push("ไม่มีหลักสูตรที่กำลังอบรมอยู่");

      // งาน บสต./ติดตาม: บันทึกจำหน่าย + ติดตามไม่ได้ / ปิดการติดตาม (สเปก 8, docs/decisions.md)
      const fu = applyReleaseToFollowup(tx, incId, input.reason, input.releasedDate, actor.userId);
      effects.followup = fu.effects;
      actions.push(...fu.actions);

      tx.update(schema.releaseEvents).set({ effects }).where(eq(schema.releaseEvents.id, event.id)).run();
      writeAudit(tx, { userId: actor.userId, action: "release.record", entity: "incarceration", entityId: incId, personId: inc.personId, after: { releasedDate: input.releasedDate, reason: input.reason, effects }, ip: actor.ip });
      summary.push({ incarcerationId: incId, inmateNo: inc.inmateNo, name: `${person.firstName} ${person.lastName}`, actions });
    }
    return { batchId, summary };
  });
}

/** ยกเลิกบันทึกออก — ระบบย้อนการประมวลผลให้ */
export function cancelRelease(db: DB, eventId: number, reason: string, actor: { userId: number; ip?: string | null }) {
  if (!reason?.trim()) throw new RuleError("กรุณาระบุเหตุผลการยกเลิก");
  return db.transaction((tx) => {
    const ev = tx.select().from(schema.releaseEvents).where(eq(schema.releaseEvents.id, eventId)).get();
    if (!ev || ev.cancelledAt) throw new RuleError("ไม่พบรายการ หรือถูกยกเลิกไปแล้ว");
    const effects = (ev.effects ?? { enrollments: [], removedAttendance: [] }) as ReleaseEffects;
    revertFollowupEffects(tx, effects.followup);
    for (const e of effects.enrollments) {
      tx.update(schema.enrollments)
        .set({ status: e.from, statusBeforeRelease: null, leftDate: e.leftDate, leftReason: e.leftReason, releaseEventId: null, updatedBy: actor.userId, updatedAt: new Date() })
        .where(eq(schema.enrollments.id, e.id))
        .run();
    }
    for (const a of effects.removedAttendance) {
      tx.insert(schema.attendance)
        .values({ ...a, createdAt: new Date(a.createdAt), updatedAt: new Date(a.updatedAt), deletedAt: a.deletedAt ? new Date(a.deletedAt) : null })
        .onConflictDoNothing()
        .run();
    }
    const inc = tx.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, ev.incarcerationId)).get()!;
    tx.update(schema.incarcerations)
      .set({ releasedDate: null, releaseReason: null, releaseNote: null, updatedBy: actor.userId, updatedAt: new Date(), version: inc.version + 1 })
      .where(eq(schema.incarcerations.id, ev.incarcerationId))
      .run();
    tx.update(schema.releaseEvents)
      .set({ cancelledAt: new Date(), cancelledBy: actor.userId, cancelReason: reason })
      .where(eq(schema.releaseEvents.id, eventId))
      .run();
    writeAudit(tx, { userId: actor.userId, action: "release.cancel", entity: "incarceration", entityId: ev.incarcerationId, personId: inc.personId, before: { releasedDate: ev.releasedDate, reason: ev.reason }, note: reason, ip: actor.ip });
    return { restoredEnrollments: effects.enrollments.length, restoredAttendance: effects.removedAttendance.length };
  });
}

function prevDay(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}
