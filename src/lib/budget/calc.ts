/**
 * คำนวณงบประมาณ (สเปก 13) — ฟังก์ชันล้วน · เงินเป็นสตางค์ (จำนวนเต็ม) · ห้ามทศนิยมลอยตัว
 * จำนวน (qty) รับทศนิยมได้ไม่เกิน 2 ตำแหน่ง (เช่น 1.5 ชม.) คำนวณด้วยจำนวนเต็ม (BigInt) แล้วปัดครั้งเดียวแบบปัดครึ่งขึ้น
 */

export const BUDGET_CATEGORIES = { compensation: "ค่าตอบแทน", operating: "ค่าใช้สอย", materials: "ค่าวัสดุ" } as const;
export type BudgetCategory = keyof typeof BUDGET_CATEGORIES;
export const categoryOf = (item: string): BudgetCategory => {
  const c = item.split(".")[0];
  if (!(c in BUDGET_CATEGORIES)) throw new Error(`รหัสรายการงบไม่ถูกต้อง: ${item}`);
  return c as BudgetCategory;
};

export type Factor = { qty: number; unit: string };

const B100 = BigInt(100), B2 = BigInt(2);

/** จำนวน → หน่วยร้อย (จำนวนเต็ม) · เกิน 2 ตำแหน่ง/ติดลบ/ไม่ใช่ตัวเลข = ผิด */
function toHundredths(q: number): bigint {
  if (!Number.isFinite(q) || q < 0) throw new Error("จำนวนต้องเป็นตัวเลขตั้งแต่ 0 ขึ้นไป");
  const s = q.toFixed(6);
  const [i, f = ""] = s.split(".");
  if (/[1-9]/.test(f.slice(2))) throw new Error("จำนวนใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง");
  return BigInt(i) * B100 + BigInt((f + "00").slice(0, 2));
}

/** ยอดของรายการ = หน่วย(สตางค์) × จำนวน × ... — ปัดครึ่งขึ้นเป็นสตางค์ครั้งเดียว */
export function lineAmount(unitSatang: number, factors: Factor[]): number {
  if (!Number.isSafeInteger(unitSatang) || unitSatang < 0) throw new Error("ราคาต่อหน่วยต้องเป็นสตางค์จำนวนเต็ม");
  let num = BigInt(unitSatang);
  let den = BigInt(1);
  for (const f of factors) { num *= toHundredths(f.qty); den *= B100; }
  const v = (num * B2 + den) / (den * B2); // ปัดครึ่งขึ้น
  if (v > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error("ยอดเงินมากเกินไป");
  return Number(v);
}

/** สูตรที่อ่านได้: "600 × 15 ชม. × 1 คน = 9,000 บาท" */
export function lineFormula(unitSatang: number, factors: Factor[]) {
  const b = (s: number) => (s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });
  return `${b(unitSatang)} บาท${factors.map((f) => ` × ${f.qty.toLocaleString("th-TH")} ${f.unit}`).join("")} = ${b(lineAmount(unitSatang, factors))} บาท`;
}

// ───────── แม่แบบงบของหลักสูตร ─────────

export type TemplateFactor = { qty?: number; var?: "people" | "speakers"; unit: string };
export type BudgetTemplate = { perSpeaker: number; lines: Array<{ item: string; unitSatang: number; factors: TemplateFactor[] }> };

/** ใส่จำนวนคน → รายการงบพร้อมยอด (วิทยากร = ปัดขึ้น จำนวนคน / perSpeaker) */
export function applyTemplate(t: BudgetTemplate, people: number) {
  if (!Number.isInteger(people) || people <= 0) throw new Error("จำนวนคนต้องเป็นจำนวนเต็มมากกว่า 0");
  const speakers = Math.max(1, Math.ceil(people / Math.max(1, t.perSpeaker)));
  return t.lines.map((l) => {
    const factors: Factor[] = l.factors.map((f) => ({ qty: f.var === "people" ? people : f.var === "speakers" ? speakers : f.qty ?? 0, unit: f.unit }));
    return { item: l.item, unitSatang: l.unitSatang, factors, amountSatang: lineAmount(l.unitSatang, factors) };
  });
}

// ───────── สถานะงบของรุ่น ─────────

export type BLine = { id: number; allocationId: number; item: string; amountSatang: number };
export type BExpense = { allocationId: number; kind: "expense" | "refund"; item: string | null; amountSatang: number };
export type BAlloc = { id: number; flexible: boolean };
export type BAck = { allocationId: number; category: string; overSatang: number };
/** ค่าวิทยากรจากรอบเบิกที่ "อนุมัติแล้ว" เท่านั้น แยกภายใน/ภายนอก */
export type BComp = { internalSatang: number; externalSatang: number };

export type CatStatus = {
  category: BudgetCategory; budget: number; spent: number; remaining: number;
  /** ok = ไม่เกิน · yellow = เกินหมวดแต่ถัวได้ · red = ห้ามถัว/เกินทั้งแหล่งเงิน (ต้องผู้ดูแลยืนยัน) */
  level: "ok" | "yellow" | "red"; over: number; confirmed: boolean; borrowFrom: BudgetCategory[];
};
export type AllocStatus = { allocationId: number; flexible: boolean; budget: number; spent: number; refunded: number; remaining: number; categories: CatStatus[] };

/**
 * กระจายค่าวิทยากรที่อนุมัติแล้วลงบรรทัดงบ: ภายใน → speaker_internal, ภายนอก → speaker_external
 * (ไม่มีบรรทัดตรงประเภท → ใช้บรรทัดค่าวิทยากรอื่น · หลายบรรทัด = เติมตามลำดับ ส่วนเกินลงบรรทัดสุดท้าย · ไม่มีเลย = ไม่มีงบรองรับ)
 */
export function attributeCompensation(lines: BLine[], comp: BComp) {
  const out = new Map<number, number>(); // allocationId → สตางค์
  const lineUse = new Map<number, number>();
  let unbudgeted = 0;
  const speakerLines = lines.filter((l) => l.item === "compensation.speaker_internal" || l.item === "compensation.speaker_external");
  const spread = (amount: number, preferred: string) => {
    if (amount <= 0) return;
    const pool = speakerLines.filter((l) => l.item === preferred);
    const targets = pool.length ? pool : speakerLines;
    if (!targets.length) { unbudgeted += amount; return; }
    let rest = amount;
    targets.forEach((l, i) => {
      const take = i === targets.length - 1 ? rest : Math.min(rest, Math.max(0, l.amountSatang - (lineUse.get(l.id) ?? 0)));
      lineUse.set(l.id, (lineUse.get(l.id) ?? 0) + take);
      out.set(l.allocationId, (out.get(l.allocationId) ?? 0) + take);
      rest -= take;
    });
  };
  spread(comp.internalSatang, "compensation.speaker_internal");
  spread(comp.externalSatang, "compensation.speaker_external");
  return { byAllocation: out, unbudgeted };
}

export function cohortBudgetStatus(allocs: BAlloc[], lines: BLine[], expenses: BExpense[], comp: BComp, acks: BAck[]): { allocations: AllocStatus[]; unbudgetedCompensation: number } {
  const { byAllocation: compBy, unbudgeted } = attributeCompensation(lines, comp);
  const ids = Array.from(new Set([...lines.map((l) => l.allocationId), ...expenses.map((e) => e.allocationId), ...compBy.keys()]));
  const allocations = ids.map((id): AllocStatus => {
    const flexible = allocs.find((a) => a.id === id)?.flexible ?? false;
    const cats = (Object.keys(BUDGET_CATEGORIES) as BudgetCategory[]).map((category) => {
      const budget = lines.filter((l) => l.allocationId === id && categoryOf(l.item) === category).reduce((a, l) => a + l.amountSatang, 0);
      const spent = expenses.filter((e) => e.allocationId === id && e.kind === "expense" && e.item && categoryOf(e.item) === category).reduce((a, e) => a + e.amountSatang, 0)
        + (category === "compensation" ? compBy.get(id) ?? 0 : 0);
      return { category, budget, spent, remaining: budget - spent, over: Math.max(0, spent - budget) };
    }).filter((c) => c.budget || c.spent);
    const budget = cats.reduce((a, c) => a + c.budget, 0);
    const spent = cats.reduce((a, c) => a + c.spent, 0);
    const refunded = expenses.filter((e) => e.allocationId === id && e.kind === "refund").reduce((a, e) => a + e.amountSatang, 0);
    // ถัวได้เฉพาะเมื่อยอดรวมทุกหมวดของแหล่งเงินนี้ยังไม่เกินงบ (คืนเงินเหลือบันทึกได้ไม่เกินยอดคงเหลือ — ตรวจตอนบันทึก)
    const totalOver = spent > budget;
    const categories = cats.map((c): CatStatus => {
      const level: CatStatus["level"] = c.over === 0 ? "ok" : flexible && !totalOver ? "yellow" : "red";
      const ackMax = Math.max(0, ...acks.filter((a) => a.allocationId === id && a.category === c.category).map((a) => a.overSatang));
      return { ...c, level, confirmed: level === "red" && c.over > 0 && ackMax >= c.over, borrowFrom: level === "yellow" ? cats.filter((x) => x.remaining > 0 && x.category !== c.category).map((x) => x.category) : [] };
    });
    return { allocationId: id, flexible, budget, spent, refunded, remaining: budget - spent - refunded, categories };
  });
  return { allocations, unbudgetedCompensation: unbudgeted };
}

/** ต้องให้ผู้ดูแลยืนยันหรือไม่ (มีหมวดสีแดงที่ยังไม่ยืนยัน หรือค่าวิทยากรไม่มีงบรองรับ) */
export function needsConfirmation(s: ReturnType<typeof cohortBudgetStatus>) {
  return s.unbudgetedCompensation > 0 || s.allocations.some((a) => a.categories.some((c) => c.level === "red" && c.over > 0 && !c.confirmed));
}
