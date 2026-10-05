"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { savePrintOffsetsAction } from "./actions";

type O = { dx: number; dy: number };
type Forms = { ktb: O; voucher: O; report: O };

export function OffsetsForm({ initial, labels }: { initial: Forms; labels: Record<keyof Forms, string> }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const nudge = (k: keyof Forms, axis: "dx" | "dy", d: number) => setF({ ...f, [k]: { ...f[k], [axis]: Math.round((f[k][axis] + d) * 10) / 10 } });
  return (
    <div className="space-y-4">
      {(Object.keys(labels) as Array<keyof Forms>).map((k) => (
        <section key={k} className="card space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-xl">{labels[k]}</h2>
            <a href={`/api/print-test?form=${k}`} target="_blank" className="btn-ghost btn-sm">พิมพ์ใบทดสอบ (ค่าที่บันทึกแล้ว)</a>
          </div>
          {([["dx", "ซ้าย ← → ขวา", "เลื่อนไปทางขวา = บวก"], ["dy", "บน ↑ ↓ ล่าง", "เลื่อนลง = บวก"]] as const).map(([axis, label, hint]) => (
            <div key={axis} className="flex flex-wrap items-center gap-2">
              <span className="w-32 font-medium">{label}</span>
              <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(k, axis, -0.5)} aria-label={`${labels[k]} ${label} ลด 0.5 มม.`}>−0.5</button>
              <input type="number" step="0.1" min={-15} max={15} className="input w-24 py-1 text-center" value={f[k][axis]} onChange={(e) => setF({ ...f, [k]: { ...f[k], [axis]: Number(e.target.value) || 0 } })} aria-label={`${labels[k]} ${label} (มม.)`} />
              <button type="button" className="btn-ghost btn-sm" onClick={() => nudge(k, axis, 0.5)} aria-label={`${labels[k]} ${label} เพิ่ม 0.5 มม.`}>+0.5</button>
              <span className="text-sm text-muted">มม. · {hint}</span>
            </div>
          ))}
        </section>
      ))}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await savePrintOffsetsAction(f); setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error }); if (r.ok) router.refresh(); })}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
        <button type="button" className="btn-ghost" onClick={() => setF({ ktb: { dx: 0, dy: 0 }, voucher: { dx: 0, dy: 0 }, report: { dx: 0, dy: 0 } })}>คืนค่า 0 ทั้งหมด</button>
      </div>
    </div>
  );
}
