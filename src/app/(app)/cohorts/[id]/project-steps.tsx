"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setProjectStepAction } from "../actions";
import { Alert } from "@/components/ui";

type Row = { code: string; label: string; state: { done: boolean; date?: string | null; note?: string | null } | null; dateLabel: string | null };

/** รายการขั้นตอนโครงการ 7 ขั้น (สเปก 17) — ติ๊กพร้อมวันที่ (ไม่บังคับ) */
export function ProjectSteps({ cohortId, rows, canEdit, today }: { cohortId: number; rows: Row[]; canEdit: boolean; today: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");

  const save = (code: string, done: boolean, d: string | null) =>
    start(async () => {
      setError(null);
      const r = await setProjectStepAction(cohortId, code, { done, date: d });
      if (!r.ok) return setError(r.error);
      setEditing(null);
      router.refresh();
    });

  return (
    <div className="space-y-2">
      {error && <Alert tone="danger">{error}</Alert>}
      <ol className="space-y-1">
        {rows.map((r, i) => (
          <li key={r.code} className="flex flex-wrap items-center gap-2 border-b border-line py-1 last:border-0">
            <span aria-hidden className={`inline-flex size-8 items-center justify-center rounded-full font-semibold ${r.state?.done ? "bg-ok text-white" : "border border-line text-muted"}`}>{r.state?.done ? "✓" : i + 1}</span>
            <span className={r.state?.done ? "font-semibold" : ""}>{r.label}</span>
            {r.dateLabel && <span className="text-sm text-muted">· {r.dateLabel}</span>}
            {canEdit && (
              <span className="ml-auto flex flex-wrap items-center gap-2">
                {editing === r.code ? (
                  <>
                    <label className="sr-only" htmlFor={`d-${r.code}`}>วันที่ทำ (ไม่บังคับ)</label>
                    <input id={`d-${r.code}`} type="date" className="input min-h-11" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
                    <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => save(r.code, true, date || null)}>บันทึกว่าเสร็จ</button>
                    <button type="button" className="btn-ghost btn-sm" onClick={() => setEditing(null)}>ยกเลิก</button>
                  </>
                ) : r.state?.done ? (
                  <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => save(r.code, false, null)}>ยกเลิกติ๊ก</button>
                ) : (
                  <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { setDate(today); setEditing(r.code); }}>ติ๊กว่าเสร็จ</button>
                )}
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
