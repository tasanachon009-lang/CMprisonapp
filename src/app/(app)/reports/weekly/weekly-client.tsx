"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { formatThaiDate } from "@/lib/thai-date";
import { createWeeklyAction, createMonthlyAction, saveWeeklyTextsAction, approveWeeklyAction, unapproveWeeklyAction } from "./actions";

export function CreateWeekly({ today }: { today: string }) {
  const router = useRouter();
  const [date, setDate] = useState(today);
  const [month, setMonth] = useState(today.slice(0, 7));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (fn: () => Promise<{ ok: boolean; error?: string; data?: { id: number } }>) => start(async () => { const r = await fn(); if (!r.ok) return setErr(r.error ?? "สร้างรายงานไม่สำเร็จ กรุณาลองอีกครั้ง"); router.push(`/reports/weekly/${r.data!.id}`); });
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">รายงานประจำสัปดาห์ — สัปดาห์ที่มีวันที่</span><input type="date" className="input w-auto" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <button type="button" className="btn-primary" disabled={pending} onClick={() => go(() => createWeeklyAction(date))}>สร้าง / เปิดร่าง</button>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">รายงานประจำเดือน — เดือน</span><input type="month" className="input w-auto" value={month} onChange={(e) => setMonth(e.target.value)} /></label>
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => go(() => createMonthlyAction(month))}>สร้าง / เปิดร่าง</button>
      </div>
      {err && <div className="md:col-span-2"><Alert tone="danger">{err}</Alert></div>}
    </div>
  );
}

type Unrecorded = { sessionId: number | null; date: string; time: string; title: string; cohort: string };

export function WeeklyEditor({ id, status, initial, kind, period, unrecorded }: { id: number; status: string; initial: { issues: string; nextPlan: string; note: string }; kind: "weekly" | "monthly"; period: string; unrecorded: Unrecorded[] }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [reason, setReason] = useState("");
  const [ack, setAck] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => { const r = await fn(); setMsg(r.ok ? { tone: "ok", text: r.message ?? "เรียบร้อย" } : { tone: "danger", text: r.error ?? "ไม่สำเร็จ กรุณาลองอีกครั้ง" }); if (r.ok) router.refresh(); });
  const word = kind === "monthly" ? "เดือน" : "สัปดาห์";
  if (status === "approved") {
    return (
      <section className="card flex flex-wrap items-end gap-2">
        <label className="grow"><span className="label">ยกเลิกการอนุมัติเพื่อแก้ไข — เหตุผล</span><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} /></label>
        <button type="button" className="btn-ghost" disabled={pending || !reason.trim()} onClick={() => run(() => unapproveWeeklyAction(id, reason))}>ยกเลิกการอนุมัติ</button>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </section>
    );
  }
  // สเปก 18.2B: เตือนให้บันทึกผลให้ครบก่อนอนุมัติ พร้อมลิงก์ไปบันทึก — รายการนี้ไม่ลงในรายงานที่เสนอ
  const byCohort = Array.from(new Set(unrecorded.map((u) => u.cohort))).map((c) => ({ cohort: c, items: unrecorded.filter((u) => u.cohort === c) }));
  const approve = () => run(async () => {
    const s = await saveWeeklyTextsAction(id, { issues: f.issues || null, nextPlan: f.nextPlan || null, note: f.note || null });
    return s.ok ? approveWeeklyAction(id, ack) : s;
  });
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ตรวจแก้และอนุมัติ</h2>
      <label className="block"><span className="label">ปัญหา อุปสรรค และข้อเสนอแนะ (บรรทัดละ 1 เรื่อง)</span><textarea className="input" rows={4} value={f.issues} maxLength={5000} onChange={(e) => setF({ ...f, issues: e.target.value })} /></label>
      <label className="block"><span className="label">แผน{word}ถัดไป (บรรทัดละ 1 เรื่อง)</span><textarea className="input" rows={4} value={f.nextPlan} maxLength={5000} onChange={(e) => setF({ ...f, nextPlan: e.target.value })} /></label>
      <label className="block"><span className="label">หมายเหตุ (ไม่บังคับ)</span><textarea className="input" rows={2} value={f.note} maxLength={2000} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {unrecorded.length > 0 && (
        <div className="space-y-2 rounded-2xl border border-warn/60 bg-warn/10 p-4">
          <p className="font-semibold">ยังไม่ได้บันทึกผล {unrecorded.length} คาบ — กรุณาบันทึกผลให้ครบก่อนอนุมัติ</p>
          {byCohort.map((g) => (
            <details key={g.cohort}>
              <summary className="flex min-h-11 cursor-pointer items-center">{g.cohort}: {g.items.length} คาบ</summary>
              <ul className="space-y-1 pl-4">
                {g.items.map((u, i) => (
                  <li key={i}>
                    {u.sessionId
                      ? <Link href={`/sessions/${u.sessionId}`} target="_blank" className="inline-flex min-h-11 items-center underline">{formatThaiDate(u.date)} {u.time} {u.title} — บันทึกผล</Link>
                      : <span>{formatThaiDate(u.date)} {u.time} {u.title}</span>}
                  </li>
                ))}
              </ul>
            </details>
          ))}
          <p className="text-sm text-muted">บันทึกผลแล้วกด &quot;รวบรวมตัวเลขใหม่&quot; · รายงานที่เสนอจะแสดงเพียงจำนวนคาบต่อรุ่น</p>
          <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> ยืนยันการเสนอรายงานทั้งที่ยังบันทึกผลไม่ครบ</label>
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run(() => saveWeeklyTextsAction(id, { issues: f.issues || null, nextPlan: f.nextPlan || null, note: f.note || null }))}>บันทึกข้อความ</button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => (kind === "monthly" ? createMonthlyAction(period) : createWeeklyAction(period)))}>รวบรวมตัวเลขใหม่</button>
        <button type="button" className="btn-primary" disabled={pending || (unrecorded.length > 0 && !ack)} onClick={() => { if (confirm("ยืนยันการอนุมัติรายงาน ตัวเลข ณ ขณะนี้จะคงที่")) approve(); }}>อนุมัติ</button>
      </div>
    </section>
  );
}
