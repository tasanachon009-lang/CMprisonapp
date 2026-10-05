/** ข้อความของบันทึกผลหลังสอน (สเปก 22B) — ใช้ได้ทั้งฝั่งเซิร์ฟเวอร์และหน้าจอ (ไม่แตะฐานข้อมูล) */

export const OUTCOME_LABEL: Record<string, string> = { planned: "ตามแผน", partial: "บางส่วน", not_done: "ไม่ได้ทำ" };
export const PARTICIPATION_LABEL: Record<string, string> = { excellent: "ดีมาก", good: "ดี", fair: "พอใช้", needs_improvement: "ควรปรับปรุง" };
export const PARTICIPATION_FACE: Record<string, string> = { excellent: "😄", good: "🙂", fair: "😐", needs_improvement: "🙁" };

/** ชิปพิเศษ: เลือกแล้วเปิดกล่องจดหมายเวรพร้อมเติมรุ่น/คาบ */
export const SHIFT_CHIP = "มีเหตุการณ์ต้องแจ้งเวร";

/** ประกอบชิปเป็นประโยคสรุป (ผู้บันทึกแก้ได้ก่อนบันทึก) */
export function composeSummary(outcome: string, chips: string[], participation?: string | null) {
  if (outcome === "not_done") return "";
  const head = outcome === "planned" ? "ดำเนินกิจกรรมตามแผน" : "ดำเนินกิจกรรมได้บางส่วน";
  const part = participation && PARTICIPATION_LABEL[participation] ? ` ผู้เข้าอบรมมีส่วนร่วม${PARTICIPATION_LABEL[participation]}` : "";
  const body = chips.filter((c) => c !== SHIFT_CHIP);
  return `${head}${part}${body.length ? ` — ${body.join(" · ")}` : ""}`;
}
