"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { createWeeklyAction, saveWeeklyTextsAction, approveWeeklyAction, unapproveWeeklyAction } from "./actions";

export function CreateWeekly({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-end gap-2">
      <label><span className="label">สัปดาห์ที่มีวันที่</span><input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></label>
      <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await createWeeklyAction(date); if (!r.ok) return setErr(r.error); router.push(`/reports/weekly/${r.data!.id}`); })}>{pending ? "กำลังรวบรวม..." : "สร้าง/อัปเดตร่าง"}</button>
      {err && <Alert tone="danger">{err}</Alert>}
    </div>
  );
}

export function WeeklyEditor({ id, status, initial, monday }: { id: number; status: string; initial: { issues: string; nextPlan: string; note: string }; monday: string }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? { tone: "ok", text: r.message ?? "เรียบร้อย" } : { tone: "danger", text: r.error ?? "ไม่สำเร็จ" }); if (r.ok) router.refresh(); });
  if (status === "approved") {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className="grow"><span className="label">ยกเลิกการอนุมัติเพื่อแก้ไข — เหตุผล</span><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" className="btn-ghost" disabled={pending || !reason.trim()} onClick={() => run(() => unapproveWeeklyAction(id, reason))}>ยกเลิกการอนุมัติ</button>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </div>
    );
  }
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">แก้ข้อความก่อนอนุมัติ</h2>
      <label className="block"><span className="label">5. ปัญหา อุปสรรค ข้อเสนอแนะ (ระบบรวบรวมจากผลกิจกรรมให้แล้ว แก้เพิ่มได้)</span><textarea className="input" rows={5} value={f.issues} maxLength={5000} onChange={(e) => setF({ ...f, issues: e.target.value })} /></label>
      <label className="block"><span className="label">6. แผนสัปดาห์หน้า</span><textarea className="input" rows={5} value={f.nextPlan} maxLength={5000} onChange={(e) => setF({ ...f, nextPlan: e.target.value })} /></label>
      <label className="block"><span className="label">หมายเหตุ (ไม่บังคับ)</span><textarea className="input" rows={2} value={f.note} maxLength={2000} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => saveWeeklyTextsAction(id, { issues: f.issues || null, nextPlan: f.nextPlan || null, note: f.note || null }))}>บันทึกข้อความ</button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => createWeeklyAction(monday))}>รวบรวมตัวเลขใหม่</button>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => { if (confirm("อนุมัติรายงาน? ตัวเลข ณ ตอนนี้จะคงที่")) run(async () => { const s = await saveWeeklyTextsAction(id, { issues: f.issues || null, nextPlan: f.nextPlan || null, note: f.note || null }); return s.ok ? approveWeeklyAction(id) : s; }); }}>บันทึกและอนุมัติ</button>
      </div>
    </section>
  );
}
