"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { History } from "lucide-react";

const KEY = "rehab.lastCohort";

/** จำรุ่นล่าสุดที่ใช้ (เฉพาะเครื่องนี้ — ใช้เพื่อความสะดวกเท่านั้น) */
export function RememberCohort({ id, label }: { id: number; label: string }) {
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify({ id, label }));
    } catch {
      /* ไม่มี localStorage — ข้าม */
    }
  }, [id, label]);
  return null;
}

export function LastCohortLink() {
  const [last, setLast] = useState<{ id: number; label: string } | null>(null);
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (v) setLast(JSON.parse(v));
    } catch {
      /* ข้าม */
    }
  }, []);
  if (!last) return null;
  return (
    <Link href={`/cohorts/${last.id}`} className="btn-secondary">
      <History size={20} aria-hidden /> กลับไปรุ่นล่าสุด: {last.label}
    </Link>
  );
}
