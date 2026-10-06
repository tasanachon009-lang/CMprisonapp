import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { isValidISODate } from "../thai-date";
import { RuleError } from "../errors";

/** ขั้นตอนโครงการของรุ่น (สเปก 17 — หลักสูตร 3 วัน) เรียงตามลำดับงานจริง */
export const PROJECT_STEPS = [
  { code: "select", label: "คัดเลือกผู้เข้าอบรม" },
  { code: "project_approval", label: "ขออนุมัติโครงการ" },
  { code: "run_approval", label: "ขออนุมัติจัดอบรม" },
  { code: "invite", label: "เชิญวิทยากร" },
  { code: "run", label: "ดำเนินการอบรม" },
  { code: "satisfaction", label: "ประเมินความพึงพอใจ" },
  { code: "report", label: "รายงานกรมราชทัณฑ์" },
] as const;

export type ProjectStepCode = (typeof PROJECT_STEPS)[number]["code"];
export type ProjectStepState = { done: boolean; date?: string | null; note?: string | null; by: number; at: number };

/** หลักสูตรที่ใช้รายการขั้นตอนโครงการ */
export const usesProjectSteps = (courseCode: string) => courseCode === "PRE3";

export function projectStepsView(steps: Record<string, ProjectStepState> | null | undefined) {
  const s = steps ?? {};
  const rows = PROJECT_STEPS.map((p) => ({ ...p, state: s[p.code] ?? null }));
  const doneCount = rows.filter((r) => r.state?.done).length;
  const next = rows.find((r) => !r.state?.done) ?? null;
  return { rows, doneCount, total: rows.length, next };
}

export function setProjectStep(db: DB, cohortId: number, code: string, input: { done: boolean; date?: string | null; note?: string | null }, actor: { userId: number; ip?: string | null }) {
  if (!PROJECT_STEPS.some((p) => p.code === code)) throw new RuleError("ไม่พบขั้นตอนนี้ — รีเฟรชหน้าแล้วลองใหม่");
  if (input.date && !isValidISODate(input.date)) throw new RuleError("วันที่ไม่ถูกต้อง — เลือกวันที่ใหม่หรือเว้นว่าง");
  const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get();
  if (!c) throw new RuleError("ไม่พบรุ่นนี้");
  const before = (c.projectSteps ?? {}) as Record<string, ProjectStepState>;
  const next = { ...before, [code]: { done: input.done, date: input.date || null, note: input.note?.trim() || null, by: actor.userId, at: Date.now() } };
  db.update(schema.cohorts).set({ projectSteps: next, updatedBy: actor.userId, updatedAt: new Date(), version: c.version + 1 }).where(eq(schema.cohorts.id, cohortId)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "cohort", entityId: cohortId, before: { projectStep: code, ...before[code] }, after: { projectStep: code, ...next[code] }, ip: actor.ip ?? null });
  return next;
}
