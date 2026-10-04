import type { Metadata } from "next";
// ฟอนต์ฝังในโปรเจกต์ (ไม่โหลดจากอินเทอร์เน็ต)
import "@fontsource/sarabun/400.css";
import "@fontsource/sarabun/500.css";
import "@fontsource/sarabun/600.css";
import "@fontsource/sarabun/700.css";
import "@fontsource/ibm-plex-sans-thai/600.css";
import "@fontsource/ibm-plex-sans-thai/700.css";
import "@fontsource/space-grotesk/latin-500.css";
import "@fontsource/space-grotesk/latin-700.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ระบบสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด",
  description: "ระบบบริหารงานสถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด เรือนจำกลางเชียงใหม่",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full">{children}</body>
    </html>
  );
}
