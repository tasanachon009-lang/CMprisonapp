import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

// ระบบใช้ภายใน LAN ไม่โหลดอะไรจากภายนอก → จำกัดทุกอย่างไว้ที่ตัวเอง
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["better-sqlite3", "@node-rs/argon2", "sharp", "exceljs"],
  experimental: {
    serverActions: { bodySizeLimit: "10mb" },
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        ],
      },
      // หน้าที่มีข้อมูลบุคคล ห้ามเบราว์เซอร์เก็บแคช (ไฟล์ JS/CSS ของระบบเก็บได้ เพื่อความเร็ว)
      { source: "/((?!_next/static|_next/image).*)", headers: [{ key: "Cache-Control", value: "no-store" }] },
    ];
  },
};

export default nextConfig;
