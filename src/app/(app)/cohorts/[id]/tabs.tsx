"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** แท็บของหน้ารุ่น (สเปก 4.1) — แท็บของขั้นถัดไปแสดงเป็นสีจาง / แท็บที่ไม่มีสิทธิ์ถูกซ่อน */
export function CohortTabs({ id, isFast, isPre3, show }: { id: number; isFast: boolean; isPre3?: boolean; show: { candidates?: boolean; assessments: boolean; health: boolean; reports: boolean; pay: boolean; budget: boolean; docs?: boolean } }) {
  const path = usePathname();
  const base = `/cohorts/${id}`;
  const tabs: Array<{ href?: string; label: string; soon?: string; hidden?: boolean }> = [
    { href: base, label: "ภาพรวม" },
    { href: `${base}/roster`, label: "รายชื่อ" },
    { href: `${base}/candidates`, label: "รายชื่อแนะนำ", hidden: !isPre3 || !show.candidates },
    { href: `${base}/attendance`, label: "เช็คชื่อ" },
    { href: `${base}/schedule`, label: "ตารางกิจกรรม" },
    { href: `${base}/assessments`, label: "แบบประเมิน", hidden: !show.assessments },
    { href: `${base}/health`, label: "สถานพยาบาล", hidden: !show.health },
    ...(isFast ? [{ label: "ชุมชนบำบัด", soon: "ขั้นที่ 5" }] : []),
    { href: `/pay?cohort=${id}`, label: "ค่าตอบแทน", hidden: !show.pay },
    { href: `${base}/budget`, label: "งบประมาณ", hidden: !show.budget },
    { href: `${base}/documents`, label: "เอกสาร", hidden: !show.docs },
    { href: `${base}/report`, label: "รายงาน", hidden: !show.reports },
  ];
  return (
    <nav aria-label="แท็บของรุ่น" className="no-print -mx-1 flex gap-1 overflow-x-auto border-b border-line pb-px">
      {tabs.filter((t) => !t.hidden).map((t) => {
        if (!t.href) {
          return <span key={t.label} title={`จะเปิดใช้ใน${t.soon}`} className="inline-flex min-h-11 cursor-not-allowed items-center whitespace-nowrap px-4 text-muted/60">{t.label}</span>;
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
