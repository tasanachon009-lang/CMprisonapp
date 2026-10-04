import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";

/** พื้นหลังหน้าเข้าระบบ: ไล่เฉดมะนาว→ครีม พร้อมรูปทรงตกแต่ง (สเปก 4.4) */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  const db = getDb();
  const orgName = getSetting(db, "org.name", "เรือนจำกลางเชียงใหม่");
  const unitName = getSetting(db, "org.unitName", "สถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด");
  const demo = getSetting(db, "app.isDemoData", false);
  return (
    <div className="relative min-h-screen overflow-hidden bg-gradient-to-b from-lime via-lime-soft to-cream">
      <Decor />
      <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-8 sm:px-8">
        <header className="mb-8 text-center">
          <p className="tag-muted mx-auto mb-3 bg-white/70">{orgName}</p>
          <h1 className="text-3xl sm:text-4xl">{unitName}</h1>
          {demo && <p className="tag-warn mx-auto mt-3">ข้อมูลตัวอย่าง (ข้อมูลปลอม) — ไม่ใช่ข้อมูลจริง</p>}
        </header>
        <main className="flex flex-1 flex-col items-center">{children}</main>
      </div>
    </div>
  );
}

function Decor() {
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 h-full w-full" preserveAspectRatio="none">
      <circle cx="8%" cy="85%" r="140" fill="var(--periwinkle)" opacity="0.25" />
      <circle cx="92%" cy="12%" r="110" fill="var(--periwinkle)" opacity="0.2" />
      <circle cx="96%" cy="90%" r="70" fill="var(--lime)" opacity="0.9" />
      <path d="M0 40 Q 120 0 240 40 T 480 40" stroke="var(--navy)" strokeOpacity="0.08" strokeWidth="2" fill="none" />
    </svg>
  );
}
