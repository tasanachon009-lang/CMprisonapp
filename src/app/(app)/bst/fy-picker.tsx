import Link from "next/link";

/** เลือกปีงบประมาณ (ปีปัจจุบันและย้อนหลัง 2 ปี) */
export function FyPicker({ fy, current }: { fy: number; current: number }) {
  return (
    <span className="flex gap-1">
      {[current - 2, current - 1, current].map((y) => (
        <Link key={y} href={`?fy=${y}`} className={`inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold ${y === fy ? "bg-navy text-white" : "border border-line bg-white"}`}>ปีงบ {y}</Link>
      ))}
    </span>
  );
}
