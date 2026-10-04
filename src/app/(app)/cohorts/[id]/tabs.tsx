"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** แท็บของหน้ารุ่น (สเปก 4.1) — แท็บของขั้นถัดไปแสดงเป็นสีจางพร้อมบอกว่าจะเปิดเมื่อใด */
export function CohortTabs({ id, isFast }: { id: number; isFast: boolean }) {
  const path = usePathname();
  const base = `/cohorts/${id}`;
  const tabs: Array<{ href?: string; label: string; soon?: string }> = [
    { href: base, label: "ภาพรวม" },
    { href: `${base}/roster`, label: "รายชื่อ" },
    { href: `${base}/attendance`, label: "เช็คชื่อ" },
    { href: `${base}/schedule`, label: "ตารางกิจกรรม" },
    { label: "แบบประเมิน", soon: "ขั้นที่ 2" },
    { label: "สถานพยาบาล", soon: "ขั้นที่ 2" },
    ...(isFast ? [{ label: "ชุมชนบำบัด", soon: "ขั้นที่ 5" }] : []),
    { label: "ค่าตอบแทน", soon: "ขั้นที่ 3" },
    { label: "งบประมาณ", soon: "ขั้นที่ 3" },
    { label: "รายงาน", soon: "ขั้นที่ 2" },
  ];
  return (
    <nav aria-label="แท็บของรุ่น" className="no-print -mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
      {tabs.map((t) => {
        if (!t.href) {
          return (
            <span key={t.label} title={`จะเปิดใช้ใน${t.soon}`} className="inline-flex min-h-11 cursor-not-allowed items-center whitespace-nowrap px-4 text-muted/60">
              {t.label}
            </span>
          );
        }
        const active = t.href === base ? path === base : path.startsWith(t.href);
        return (
          <Link key={t.href} href={t.href} aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center whitespace-nowrap border-b-[3px] px-4 font-semibold ${active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}>
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
