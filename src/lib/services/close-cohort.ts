import { and, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { dueAssessments } from "./assessments";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { todayISO } from "../thai-date";

/**
 * เช็คลิสต์ความครบถ้วนก่อนปิดรุ่น (สเปก 6) — ไม่ครบปิดไม่ได้
 * (ค่าตอบแทน/รายงานส่งกรมฯ จะเพิ่มเข้าเช็คลิสต์ในขั้นที่ 3–4)
 */
export function closeChecklist(db: DB, cohortId: number) {
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) throw new RuleError("ไม่พบรุ่น");
  const enr = db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), isNull(schema.enrollments.deletedAt))).all();
  const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), isNull(schema.cohortSessions.deletedAt))).all();
  const unchecked = sessions.filter((s) => s.takesAttendance && !s.attendanceCheckedAt && s.date <= todayISO()).length;
  const ongoing = enr.filter((e) => e.status === "draft" || e.status === "active").length;
  const postDue = dueAssessments(db, cohortId).filter((d) => d.round === "post").length;
  const preDue = dueAssessments(db, cohortId).filter((d) => d.round === "pre").length;
  const intakeTasks = enr.length
    ? db.select().from(schema.bstTasks).where(and(inArray(schema.bstTasks.enrollmentId, enr.map((e) => e.id)), inArray(schema.bstTasks.step, ["register", "screen", "treat"]), eq(schema.bstTasks.status, "pending"))).all().length
    : 0;
  const items = [
    { key: "ended", label: "อบรมครบตามกำหนดแล้ว", ok: todayISO() > c.endDate, detail: `วันสุดท้าย ${c.endDate}` },
    { key: "attendance", label: "เช็คชื่อครบทุกคาบ", ok: unchecked === 0, detail: unchecked ? `ยังไม่เช็ค ${unchecked} คาบ` : "" },
    { key: "status", label: "สรุปสถานะทุกคน (ครบหลักสูตร/ไม่ผ่าน/ออกก่อนกำหนด)", ok: ongoing === 0, detail: ongoing ? `ยังค้าง ${ongoing} คน` : "" },
    { key: "post", label: "ประเมินหลังเรียนครบ", ok: postDue === 0, detail: postDue ? `ยังขาด ${postDue} รายการ` : "" },
    { key: "pre", label: "ประเมินก่อนเรียนครบ", ok: preDue === 0, detail: preDue ? `ยังขาด ${preDue} รายการ` : "" },
    { key: "bst", label: "ลง บสต./รท.101 ช่วงบำบัดครบ", ok: intakeTasks === 0, detail: intakeTasks ? `ค้าง ${intakeTasks} งาน` : "" },
  ];
  return { cohort: c, items, ready: items.every((i) => i.ok) };
}

export function closeCohort(db: DB, cohortId: number, actor: { userId: number; isAdmin: boolean; ip?: string | null }, force?: { reason: string }) {
  const cl = closeChecklist(db, cohortId);
  if (cl.cohort.status === "closed") throw new RuleError("รุ่นนี้ปิดแล้ว");
  if (!cl.ready && !(actor.isAdmin && force?.reason.trim())) throw new RuleError("ข้อมูลยังไม่ครบ ปิดรุ่นไม่ได้ — ดูรายการที่ยังไม่ครบในเช็คลิสต์");
  db.update(schema.cohorts).set({ status: "closed", closedAt: new Date(), closedBy: actor.userId, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.cohorts.id, cohortId)).run();
  writeAudit(db, { userId: actor.userId, action: "cohort.close", entity: "cohort", entityId: cohortId, note: cl.ready ? null : `ปิดทั้งที่ยังไม่ครบ: ${force?.reason}`, after: { checklist: cl.items }, ip: actor.ip });
}
