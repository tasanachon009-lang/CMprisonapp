/** จำกัดจำนวนครั้งต่อช่วงเวลา (ในหน่วยความจำ — พอสำหรับเครื่องเดียวใน LAN) */
const buckets = new Map<string, number[]>();

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(key, list);
    return false;
  }
  list.push(now);
  buckets.set(key, list);
  return true;
}
