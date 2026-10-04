"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";

/** กล่องโต้ตอบ (ใช้ <dialog> ของเบราว์เซอร์ — กด Esc ปิดได้) */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} className={`m-auto w-[calc(100%-2rem)] ${wide ? "max-w-3xl" : "max-w-lg"} rounded-[28px] border border-line p-0 backdrop:bg-ink/40 backdrop:backdrop-blur-sm`}>
      <div className="p-6">
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 className="text-xl">{title}</h2>
          <button onClick={onClose} className="rounded-full p-2 hover:bg-lime-soft" aria-label="ปิด"><X size={20} /></button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
