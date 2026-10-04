/** จำกัดจำนวนครั้งต่อช่วงเวลา (ในหน่วยความจำ — พอสำหรับเครื่องเดียวใน LAN) */
const buckets = new Map<string, number[]>();

function recent(key: string, windowMs: number) {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  buckets.set(key, list);
  return list;
}

/** นับทุกครั้งที่เรียก (ใช้กับงานที่ต้องจำกัดความถี่ทั้งหมด เช่น OTP) */
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const list = recent(key, windowMs);
  if (list.length >= max) return false;
  list.push(Date.now());
  return true;
}

/** ถูกจำกัดอยู่หรือไม่ — คืนจำนวนนาทีที่ต้องรอ (0 = ไม่ถูกจำกัด) · ใช้คู่กับ recordFailure (นับเฉพาะครั้งที่ผิด) */
export function failureLockMinutes(key: string, max: number, windowMs: number): number {
  const list = recent(key, windowMs);
  if (list.length < max) return 0;
  return Math.max(1, Math.ceil((list[0] + windowMs - Date.now()) / 60000));
}

export function recordFailure(key: string) {
  buckets.set(key, [...(buckets.get(key) ?? []), Date.now()]);
}

export function clearFailures(key: string) {
  buckets.delete(key);
}
