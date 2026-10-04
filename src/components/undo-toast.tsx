"use client";

import { useEffect, useState } from "react";
import { Undo2, X } from "lucide-react";

/** แถบ "บันทึกแล้ว" พร้อมปุ่มเลิกทำ 10 วินาที (สเปก 4.3) */
export function UndoToast({ message, onUndo, onClose, seconds = 10 }: { message: string; onUndo?: () => void; onClose: () => void; seconds?: number }) {
  const [left, setLeft] = useState(seconds);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    if (left <= 0) onClose();
  }, [left, onClose]);
  return (
    <div role="status" className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-full bg-ink py-2 pl-5 pr-2 text-white shadow-lg">
      <span>{message}</span>
      {onUndo && (
        <button onClick={onUndo} className="inline-flex min-h-9 items-center gap-1 rounded-full bg-lime px-3 font-semibold text-ink">
          <Undo2 size={18} aria-hidden /> เลิกทำ ({left})
        </button>
      )}
      <button onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="ปิด"><X size={18} /></button>
    </div>
  );
}
