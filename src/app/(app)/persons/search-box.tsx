"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

/** พิมพ์ 2–3 ตัวขึ้นรายชื่อทันที */
export function SearchBox({ initial, autoFocus }: { initial: string; autoFocus?: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => router.replace(q.trim().length >= 2 ? `/persons?q=${encodeURIComponent(q.trim())}` : "/persons"), 300);
    return () => clearTimeout(t);
  }, [q, router]);
  return (
    <div className="relative">
      <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted" size={22} aria-hidden />
      <input
        type="search" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={autoFocus}
        placeholder="เช่น สมชาย หรือ 69-014" aria-label="ค้นหาบุคคล"
        className="input min-h-14 rounded-full pl-12 text-lg"
      />
    </div>
  );
}
