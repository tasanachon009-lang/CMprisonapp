"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** เมนูย่อยของแท็บชุมชนบำบัด — หน้าที่ไม่มีสิทธิ์ถูกซ่อน */
export function TcSubNav({ cohortId, show }: { cohortId: number; show: { house: boolean; teams: boolean; tools: boolean; summaryOnly: boolean } }) {
  const path = usePathname();
  const base = `/cohorts/${cohortId}/tc`;
  const items = [
    { href: base, label: "ระยะการบำบัด", hidden: false },
    { href: `${base}/house`, label: "ผังบ้านและตำแหน่ง", hidden: !show.house },
    { href: `${base}/teams`, label: "ทีมงาน", hidden: !show.teams },
    { href: `${base}/tools`, label: "เครื่องมือบ้านและวินัย", hidden: !show.tools },
  ].filter((i) => !i.hidden);
  if (items.length < 2) return null;
  return (
    <nav aria-label="เมนูชุมชนบำบัด" className="no-print mb-4 flex flex-wrap gap-2">
      {items.map((i) => {
        const active = i.href === base ? path === base : path.startsWith(i.href);
        return <Link key={i.href} href={i.href} aria-current={active ? "page" : undefined} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${active ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{i.label}</Link>;
      })}
    </nav>
  );
}
