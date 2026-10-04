"use client";

import { useRef, useState } from "react";
import { Avatar } from "./avatar";

/**
 * รูปย่อ 32×32 ติดชื่อเสมอ (กันผิดคนจากชื่อซ้ำ) — กดค้าง/ชี้ค้าง เพื่อดูรูปใหญ่ + เลขประจำตัว + แดน
 */
export function PersonThumb({ name, thumb, photo, inmateNo, zone, size = 32 }: { name: string; thumb: string | null; photo?: string | null; inmateNo: string; zone?: string | null; size?: number }) {
  const [show, setShow] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parts = name.replace(/^(นาย|นางสาว|นาง)/, "").split(" ");
  const start = () => { timer.current = setTimeout(() => setShow(true), 350); };
  const stop = () => { if (timer.current) clearTimeout(timer.current); setShow(false); };
  return (
    <span className="relative inline-block" onMouseEnter={start} onMouseLeave={stop} onTouchStart={start} onTouchEnd={stop} onContextMenu={(e) => e.preventDefault()}>
      <Avatar first={parts[0] ?? ""} last={parts[1] ?? ""} src={thumb} size={size} color="var(--lime)" />
      {show && (
        <span className="absolute left-10 top-0 z-50 w-56 rounded-2xl border border-line bg-white p-3 shadow-xl">
          {photo || thumb ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo ?? thumb!} alt={name} className="aspect-[4/5] w-full rounded-xl object-cover" />
          ) : (
            <span className="flex aspect-[4/5] w-full items-center justify-center rounded-xl bg-lime-soft text-muted">ไม่มีรูปถ่าย</span>
          )}
          <span className="mt-2 block font-semibold">{name}</span>
          <span className="block text-sm text-muted">เลขประจำตัว {inmateNo}{zone ? ` · ${zone}` : ""}</span>
        </span>
      )}
    </span>
  );
}
