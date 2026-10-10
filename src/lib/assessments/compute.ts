import {
  scoreItems, scoreSingle, scoreDepression, scoreFitness, scoreCondition,
  type Item, type ItemsScoring, type SingleScoring, type DepressionAnswers, type FitnessAnswers, type ConditionAnswers, type Result,
} from "./scoring";

/** คิดผลตามชนิดแบบประเมิน — ใช้ทั้งหน้าจอ (แสดงทันที) และเซิร์ฟเวอร์ (บันทึกจริง) */
export function computeResult(kind: string, items: Item[], scoring: Record<string, unknown>, answers: unknown): Result {
  switch (kind) {
    case "items":
      return scoreItems(items, scoring as unknown as ItemsScoring, (answers ?? {}) as Record<string, number>);
    case "single":
      return scoreSingle(scoring as unknown as SingleScoring, (answers as { value?: number } | null)?.value);
    case "depression":
      return scoreDepression((answers ?? { q2: [null, null] }) as DepressionAnswers);
    case "fitness":
      return scoreFitness((answers ?? {}) as FitnessAnswers);
    case "condition":
      return scoreCondition((answers ?? {}) as ConditionAnswers);
    default:
      return { total: null, level: null, tone: null, details: {}, alerts: [], errors: [`ไม่รู้จักชนิดแบบประเมิน ${kind}`] };
  }
}

export const ROUND_LABEL: Record<string, string> = { pre: "ก่อนเรียน", post: "หลังเรียน", monthly: "รายเดือน" };
export const CATEGORY_LABEL: Record<string, string> = {
  knowledge: "ความรู้", attitude: "ทัศนคติ", behavior: "พฤติกรรม", motivation: "แรงจูงใจ", self_esteem: "ความภาคภูมิใจในตนเอง", status_review: "ทบทวนสถานภาพ", stress: "ความเครียด", satisfaction: "ความพึงพอใจ",
  health_mental: "สุขภาพจิต", health_physical: "สุขภาพกาย", fitness: "สมรรถภาพร่างกาย",
};
