"use client";

import { useEffect, useRef, useState } from "react";
import { HelpCircle } from "lucide-react";

/** สเปก 4.3A: คำอธิบาย/วิธีใช้อยู่ในปุ่ม (?) ไม่แปะบนฟอร์ม — กดเปิด/ปิดได้ (ใช้ได้บนแท็บเล็ต) */
export function HelpButton({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <span ref={ref} className="no-print relative inline-flex">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="วิธีใช้" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted hover:bg-lime-soft">
        <HelpCircle size={22} aria-hidden />
      </button>
      {open && (
        <span role="note" className="absolute left-0 top-full z-30 mt-1 block w-80 max-w-[calc(100vw-2rem)] rounded-2xl border border-line bg-white p-4 text-base font-normal leading-relaxed text-ink shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}
