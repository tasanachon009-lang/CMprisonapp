"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { THAI_MONTHS, addDays, formatThaiDate, parseThaiInput, todayISO, weekdayOf } from "@/lib/thai-date";

const pad = (n: number) => String(n).padStart(2, "0");
const toInput = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${Number(iso.slice(0, 4)) + 543}` : "");

/**
 * ช่องวันที่แบบ พ.ศ. — พิมพ์ "5/10/2569" หรือกดเลือกจากปฏิทิน
 * ส่งค่าไปเซิร์ฟเวอร์เป็น ค.ศ. 'YYYY-MM-DD' ผ่าน hidden input
 */
export function ThaiDateInput({
  name, id, defaultValue = "", value: controlled, onChange, required, min, max, className = "",
}: {
  name?: string; id?: string; defaultValue?: string; value?: string; onChange?: (iso: string) => void;
  required?: boolean; min?: string; max?: string; className?: string;
}) {
  const [iso, setIso] = useState(controlled ?? defaultValue);
  const [text, setText] = useState(toInput(controlled ?? defaultValue));
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState(() => (controlled || defaultValue || todayISO()).slice(0, 7));
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (controlled !== undefined && controlled !== iso) {
      setIso(controlled);
      setText(toInput(controlled));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controlled]);

  useEffect(() => {
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const commit = (v: string) => {
    if (min && v < min) return setError(`ต้องไม่ก่อน ${formatThaiDate(min)}`);
    if (max && v > max) return setError(`ต้องไม่หลัง ${formatThaiDate(max)}`);
    setError(null);
    setIso(v);
    setText(toInput(v));
    setView(v.slice(0, 7));
    onChange?.(v);
  };

  const onBlur = () => {
    if (!text.trim()) {
      setIso("");
      onChange?.("");
      setError(required ? "กรุณาใส่วันที่" : null);
      return;
    }
    const v = parseThaiInput(text);
    if (!v) setError("รูปแบบวันที่ไม่ถูกต้อง พิมพ์เป็น วัน/เดือน/ปี พ.ศ. เช่น 5/10/2569");
    else commit(v);
  };

  const [vy, vm] = view.split("-").map(Number);
  const first = `${vy}-${pad(vm)}-01`;
  const lead = weekdayOf(first);
  const daysInMonth = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
  const today = todayISO();
  const shift = (n: number) => {
    const d = new Date(Date.UTC(vy, vm - 1 + n, 1));
    setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      <div className="flex gap-2">
        <input
          id={id} type="text" inputMode="numeric" placeholder="วว/ดด/ปปปป (พ.ศ.)" value={text}
          onChange={(e) => setText(e.target.value)} onBlur={onBlur}
          className={`input ${error ? "input-error" : ""}`} aria-invalid={!!error} required={required}
        />
        <button type="button" className="btn-ghost shrink-0 px-3" onClick={() => setOpen(!open)} aria-label="เลือกจากปฏิทิน" aria-expanded={open}>
          <CalendarDays size={20} />
        </button>
      </div>
      {name && <input type="hidden" name={name} value={iso} />}
      {iso && !error && <p className="hint">{formatThaiDate(iso, "full")}</p>}
      {error && <p className="error-text">{error}</p>}
      {open && (
        <div className="absolute z-50 mt-2 w-80 rounded-2xl border border-line bg-white p-3 shadow-xl" role="dialog" aria-label="ปฏิทิน">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" className="rounded-full p-2 hover:bg-lime-soft" onClick={() => shift(-1)} aria-label="เดือนก่อน"><ChevronLeft size={20} /></button>
            <p className="font-semibold">{THAI_MONTHS[vm - 1]} {vy + 543}</p>
            <button type="button" className="rounded-full p-2 hover:bg-lime-soft" onClick={() => shift(1)} aria-label="เดือนถัดไป"><ChevronRight size={20} /></button>
          </div>
          <div className="grid grid-cols-7 text-center text-sm">
            {["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"].map((d) => <span key={d} className="py-1 text-muted">{d}</span>)}
            {Array.from({ length: lead }).map((_, i) => <span key={`l${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = addDays(first, i);
              const sel = d === iso;
              const disabled = (min && d < min) || (max && d > max);
              return (
                <button
                  key={d} type="button" disabled={!!disabled}
                  onClick={() => { commit(d); setOpen(false); }}
                  className={`m-0.5 h-9 rounded-full ${sel ? "bg-ink text-white" : d === today ? "border border-navy" : "hover:bg-lime"} disabled:opacity-30`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <button type="button" className="btn-ghost btn-sm mt-2 w-full" onClick={() => { commit(today); setOpen(false); }}>วันนี้</button>
        </div>
      )}
    </div>
  );
}
