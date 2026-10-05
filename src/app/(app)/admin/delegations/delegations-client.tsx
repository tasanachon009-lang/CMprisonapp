"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { createDelegationAction, revokeDelegationAction } from "./actions";

export function DelegationForm({ people, scopes, today }: { people: Array<{ id: number; name: string }>; scopes: Array<[string, string]>; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ toUserId: "", scopes: ["pay"] as string[], startDate: today, endDate: today, reason: "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const submit = () => start(async () => {
    setMsg(null);
    if (!f.toUserId) return setMsg({ tone: "danger", text: "เลือกผู้รับมอบอำนาจก่อน" });
    const r = await createDelegationAction({ toUserId: Number(f.toUserId), scopes: f.scopes, startDate: f.startDate, endDate: f.endDate, reason: f.reason || null });
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "มอบอำนาจแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">+ มอบอำนาจ</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">ผู้รับมอบอำนาจ (กลุ่ม A)</span><select className="input w-auto" value={f.toUserId} onChange={(e) => setF({ ...f, toUserId: e.target.value })}><option value="">เลือก</option>{people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label><span className="label">ตั้งแต่</span><input type="date" className="input w-auto" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></label>
        <label><span className="label">ถึง</span><input type="date" className="input w-auto" value={f.endDate} onChange={(e) => setF({ ...f, endDate: e.target.value })} /></label>
      </div>
      <fieldset className="flex flex-wrap gap-3">
        <legend className="label">ขอบเขต</legend>
        {scopes.map(([k, l]) => (
          <label key={k} className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={f.scopes.includes(k)} onChange={(e) => setF({ ...f, scopes: e.target.checked ? [...f.scopes, k] : f.scopes.filter((x) => x !== k) })} /> {l}
          </label>
        ))}
      </fieldset>
      <label className="block"><span className="label">เหตุผล (เช่น ลาพักร้อน/ไปราชการ)</span><input className="input" value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} /></label>
      <p className="hint">ผู้รับมอบอำนาจอนุมัติค่าตอบแทนที่มียอดของตัวเองไม่ได้ · งานที่ต้องยืนยัน 2 คน (กู้คืน ลบถาวร เปลี่ยนผู้ดูแล) มอบไม่ได้</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? "กำลังบันทึก..." : "มอบอำนาจ"}</button>
    </section>
  );
}

export function RevokeButton({ id }: { id: number }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="flex items-center gap-2">
      <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => { if (confirm("ยกเลิกการมอบอำนาจนี้ก่อนกำหนด?")) start(async () => { const r = await revokeDelegationAction(id); if (!r.ok) setErr(r.error); router.refresh(); }); }}>ยกเลิกก่อนกำหนด</button>
      {err && <span className="text-sm text-danger">{err}</span>}
    </span>
  );
}
