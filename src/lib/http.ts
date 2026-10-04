/**
 * ป้องกัน CSRF สำหรับ Route Handler ที่รับ POST (Server Action ตรวจให้อยู่แล้ว)
 * — ต้องมี Origin ตรงกับ Host ของเว็บเอง
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
