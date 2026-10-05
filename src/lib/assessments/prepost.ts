import type { Item, Option } from "./scoring";
import type { PrePostRow } from "@/components/prepost-chart";

/** คะแนนเต็มของแบบ (ใช้เป็นสเกลกราฟ) — แบบที่ไม่มีคะแนนรวมเป็นตัวเลข (สภาวะกาย/จิต สมรรถภาพ) คืน null */
export function maxScore(kind: string, items: Item[], scoring: Record<string, unknown>): number | null {
  const options = (scoring.options as Option[] | undefined) ?? [];
  const top = options.length ? Math.max(...options.map((o) => o.value)) : 0;
  if (kind === "single") return top || null;
  if (kind === "depression") return 27; // คะแนน 9Q
  if (kind !== "items") return null;
  if (scoring.method === "correct") return items.length;
  return top * items.reduce((s, it) => s + (it.weight ?? 1), 0) || null;
}

type ResultRow = { r: { enrollmentId: number; round: string; total: number | null }; f: { id: number; shortName: string; kind: string; sortOrder: number } };

/**
 * กราฟก่อน-หลังรายบุคคล: 1 การลงทะเบียน = 1 ชุด (ไม่รวม/ไม่ลากข้ามการต้องโทษหรือหลักสูตร — สเปก 10.1, 22B)
 * maxOf: คะแนนเต็มของแต่ละแบบ (formId → max)
 */
export function individualPrePost(results: ResultRow[], enrollmentId: number, maxOf: Map<number, number | null>): PrePostRow[] {
  const mine = results.filter((x) => x.r.enrollmentId === enrollmentId && (x.r.round === "pre" || x.r.round === "post") && x.r.total != null);
  const forms = Array.from(new Map(mine.map((x) => [x.f.id, x.f])).values()).sort((a, b) => a.sortOrder - b.sortOrder);
  return forms
    .map((f) => {
      const pre = mine.find((x) => x.f.id === f.id && x.r.round === "pre")?.r.total ?? null;
      const post = mine.find((x) => x.f.id === f.id && x.r.round === "post")?.r.total ?? null;
      const max = maxOf.get(f.id) ?? null;
      return max ? { label: f.shortName, max, pre, post, preN: pre == null ? 0 : 1, postN: post == null ? 0 : 1 } : null;
    })
    .filter((x): x is PrePostRow => x !== null);
}
