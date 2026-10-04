import { NextResponse, type NextRequest } from "next/server";

/**
 * ด่านแรก (ตรวจแบบเร็วจาก cookie เท่านั้น) — ทุกหน้า/ทุก action ยังตรวจสิทธิ์จริงที่เซิร์ฟเวอร์อีกชั้น
 * ไม่มี cookie เครื่อง → /device, ไม่มี cookie เซสชัน → /login
 */
const PUBLIC = ["/device", "/login", "/forbidden"];

export function proxy(req: NextRequest) {
  const path = req.nextUrl.pathname;
  if (PUBLIC.some((p) => path === p || path.startsWith(p + "/"))) return NextResponse.next();
  const hasDevice = req.cookies.has("rh_dev");
  const hasSession = req.cookies.has("rh_sess");
  if (path.startsWith("/api/")) {
    if (path.startsWith("/api/files/user/") || path === "/api/health") return NextResponse.next(); // ตรวจในตัว route / ไม่มีข้อมูล
    if (!hasSession) return NextResponse.json({ error: "ต้องเข้าสู่ระบบ" }, { status: 401 });
    return NextResponse.next();
  }
  if (!hasDevice) return NextResponse.redirect(new URL("/device", req.url));
  if (!hasSession && path !== "/change-password" && path !== "/lock") return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|fonts/).*)"],
};
