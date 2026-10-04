"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { sendShiftMessage, ackShiftMessage, resolveShiftMessage } from "./actions";

export function Compose({ staff, canHealth, today }: { staff: Array<{ id: number; name: string }>; canHealth: boolean; today: string }) {
  const router = useRouter();
  const blank = { level: "normal" as "normal" | "important" | "red", body: "", healthRelated: false, recipientType: "next_shift" as "next_shift" | "all" | "user", recipientUserId: "", needsAction: false, dueDate: "" };
  const [f, setF] = useState(blank);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="card" open={false}>
      <summary className="cursor-pointer text-lg font-semibold">✍️ เขียนข้อความส่งเวร</summary>
      <div className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {([["normal", "ปกติ"], ["important", "สำคัญ"], ["red", "สีแดง (ผู้รับต้องรับทราบก่อนใช้งานเมนูอื่น)"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => setF({ ...f, level: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${f.level === v ? (v === "red" ? "border-danger bg-danger text-white" : v === "important" ? "border-warn-bg bg-warn-bg text-ink" : "border-ink bg-ink text-white") : "border-line bg-white"}`}>{l}</button>
          ))}
        </div>
        <textarea className="input" rows={3} placeholder="เช่น ฝากติดตามนาย ข. มีอาการซึม" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} />
        <div className="grid gap-3 sm:grid-cols-2">
          <label><span className="label">ผู้รับ</span>
            <select className="input" value={f.recipientType} onChange={(e) => setF({ ...f, recipientType: e.target.value as "all" })}>
              <option value="next_shift">ผลัดถัดไป (เจ้าหน้าที่หลัก/สถานพยาบาล)</option><option value="all">ทุกคน</option><option value="user">รายบุคคล</option>
            </select>
          </label>
          {f.recipientType === "user" && (
            <label><span className="label">ส่งถึง</span><select className="input" value={f.recipientUserId} onChange={(e) => setF({ ...f, recipientUserId: e.target.value })}><option value="">— เลือก —</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          )}
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.healthRelated} onChange={(e) => setF({ ...f, healthRelated: e.target.checked })} /> เป็นเรื่องสุขภาพ (คนที่ไม่มีสิทธิ์จะเห็นแค่ &quot;มีเรื่องสุขภาพ — ติดต่อพยาบาล&quot;)</label>
        {!canHealth && f.healthRelated && <p className="hint">คุณจะยังเห็นข้อความที่ตัวเองเขียน</p>}
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.needsAction} onChange={(e) => setF({ ...f, needsAction: e.target.checked })} /> เป็นเรื่องที่ต้องติดตาม (ผู้รับกด &quot;ดำเนินการแล้ว&quot; + ผล)</label>
        {f.needsAction && <div className="w-64"><span className="label">กำหนดภายใน</span><ThaiDateInput value={f.dueDate} onChange={(v) => setF({ ...f, dueDate: v })} min={today} /></div>}
        <p className="hint">ผูกกับผู้ต้องขังได้จากหน้าบุคคล (ปุ่ม &quot;ส่งเวร&quot;)</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button className="btn-primary" disabled={pending || !f.body.trim()} onClick={() => start(async () => {
          const r = await sendShiftMessage({ ...f, personId: null, recipientUserId: f.recipientUserId ? Number(f.recipientUserId) : null, dueDate: f.dueDate || null });
          if (!r.ok) return setMsg({ tone: "danger", text: r.error });
          setMsg({ tone: "ok", text: "ส่งแล้ว" });
          setF(blank);
          router.refresh();
        })}><Send size={20} aria-hidden /> ส่งข้อความ</button>
      </div>
    </details>
  );
}

export function AckButton({ id }: { id: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await ackShiftMessage(id); router.refresh(); })}><CheckCheck size={18} aria-hidden /> รับทราบภารกิจ</button>;
}

export function ResolveForm({ id }: { id: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button className="btn-secondary btn-sm" onClick={() => setOpen(true)}>ดำเนินการแล้ว…</button>;
  return (
    <span className="flex w-full flex-wrap items-center gap-2">
      <input className="input flex-1" placeholder="ผลการดำเนินการ" value={text} onChange={(e) => setText(e.target.value)} autoFocus />
      <button className="btn-primary btn-sm" disabled={pending || !text.trim()} onClick={() => start(async () => { const r = await resolveShiftMessage(id, text); if (!r.ok) return setErr(r.error); router.refresh(); })}>ปิดเรื่อง</button>
      {err && <span className="text-sm text-danger">{err}</span>}
    </span>
  );
}
