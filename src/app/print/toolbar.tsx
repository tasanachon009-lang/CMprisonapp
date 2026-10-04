"use client";

import { Printer, X } from "lucide-react";

export function PrintToolbar({ fontMissing }: { fontMissing: boolean }) {
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-line bg-lime-soft px-4 py-2 font-sans">
      <button className="btn-primary" onClick={() => window.print()}><Printer size={20} aria-hidden /> พิมพ์</button>
      <button className="btn-ghost" onClick={() => window.close()}><X size={20} aria-hidden /> ปิดหน้านี้</button>
      {fontMissing && (
        <p className="text-sm font-semibold text-danger">
          ยังไม่พบไฟล์ฟอนต์ TH Sarabun New (assets/fonts) — ตอนนี้แสดงด้วยฟอนต์ Sarabun แทนชั่วคราว กรุณาวางไฟล์ฟอนต์ตาม README
        </p>
      )}
    </div>
  );
}
