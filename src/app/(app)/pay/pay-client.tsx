"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Unlock } from "lucide-react";
import { Alert } from "@/components/ui";
import { createBatchAction, approveBatchAction, unlockBatchAction, cancelBatchAction, setSignedAction, saveDocSettingsAction } from "./actions";

export function CreateBatchForm({ cohorts }: { cohorts: Array<{ id: number; label: string; start: string; end: string }> }) {
  const router = useRouter();
  const [f, setF] = useState({ cohortId: "", dateFrom: "", dateTo: "", note: "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pick = (id: string) => { const c = cohorts.find((x) => String(x.id) === id); setF({ ...f, cohortId: id, dateFrom: c?.start ?? "", dateTo: c?.end ?? "" }); };
  const submit = () => start(async () => {
    setErr(null);
    if (!f.cohortId) return setErr("เลือกรุ่นก่อน");
    const r = await createBatchAction({ cohortId: Number(f.cohortId), dateFrom: f.dateFrom || null, dateTo: f.dateTo || null, note: f.note || null });
    if (!r.ok) return setErr(r.error);
    router.push(`/pay/batches/${r.data!.id}`);
  });
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">+ สร้างรอบเบิก</h2>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">รุ่น</span><select className="input w-auto" value={f.cohortId} onChange={(e) => pick(e.target.value)}><option value="">เลือกรุ่น</option>{cohorts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
        <label><span className="label">ตั้งแต่</span><input type="date" className="input w-auto" value={f.dateFrom} onChange={(e) => setF({ ...f, dateFrom: e.target.value })} /></label>
        <label><span className="label">ถึง</span><input type="date" className="input w-auto" value={f.dateTo} onChange={(e) => setF({ ...f, dateTo: e.target.value })} /></label>
        <label className="grow"><span className="label">หมายเหตุ (ไม่บังคับ)</span><input className="input" value={f.note} maxLength={200} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="เช่น เบิกเดือนตุลาคม" /></label>
        <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? "กำลังสร้าง..." : "สร้างและตรวจยอด"}</button>
      </div>
      <p className="hint">ค่าเริ่มต้น = ทั้งรุ่น · เลือกช่วงวันที่ได้ (เช่น เบิกรายเดือน)</p>
      {err && <Alert tone="danger">{err}</Alert>}
    </section>
  );
}

export function BatchActions({ id, status, canApprove, canManage, isAdmin, blockSelf, delegationNote }: { id: number; status: string; canApprove: boolean; canManage: boolean; isAdmin: boolean; blockSelf: boolean; delegationNote: string | null }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [askUnlock, setAskUnlock] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>) => start(async () => {
    setMsg(null);
    const r = await fn();
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "เรียบร้อย" } : { tone: "danger", text: r.error ?? "ทำรายการไม่สำเร็จ" });
    if (r.ok) router.refresh();
  });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {status === "draft" && canApprove && (
          <button type="button" className="btn-primary" disabled={pending || blockSelf} onClick={() => { if (confirm("อนุมัติแล้วยอดจะคงที่ และล็อกเช็คชื่อ/ผลกิจกรรมของคาบในรอบนี้ — ยืนยัน?")) run(() => approveBatchAction(id)); }}>
            <Lock size={18} aria-hidden /> {pending ? "กำลังอนุมัติ..." : "อนุมัติและล็อกคาบ"}
          </button>
        )}
        {status === "draft" && canManage && <button type="button" className="btn-ghost" disabled={pending} onClick={() => { if (confirm("ยกเลิกรอบเบิกนี้?")) run(() => cancelBatchAction(id)); }}>ยกเลิกรอบ</button>}
        {status === "approved" && isAdmin && !askUnlock && <button type="button" className="btn-ghost" onClick={() => setAskUnlock(true)}><Unlock size={18} aria-hidden /> ปลดล็อก</button>}
      </div>
      {status === "draft" && canApprove && blockSelf && <Alert tone="warn">รอบนี้มีค่าตอบแทนของคุณเอง — อนุมัติเองไม่ได้ (แยกหน้าที่) ให้หัวหน้า/รองอีกคนอนุมัติ</Alert>}
      {status === "draft" && canApprove && delegationNote && <Alert tone="info">คุณอนุมัติในฐานะผู้รับมอบอำนาจ — ระบบจะบันทึก: {delegationNote}</Alert>}
      {askUnlock && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-3">
          <label className="grow"><span className="label">เหตุผลที่ปลดล็อก (จำเป็น)</span><input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="เช่น แก้ชั่วโมงสอนจริงที่บันทึกผิด" /></label>
          <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => unlockBatchAction(id, reason))}>ยืนยันปลดล็อก</button>
          <button type="button" className="btn-ghost" onClick={() => setAskUnlock(false)}>ยกเลิก</button>
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

export function SignedToggle({ batchId, personKey, signed, disabled }: { batchId: number; personKey: string; signed: boolean; disabled: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <label className="flex min-h-11 items-center gap-2">
      <input type="checkbox" className="h-5 w-5" checked={signed} disabled={disabled || pending} onChange={(e) => start(async () => { setErr(null); const r = await setSignedAction(batchId, personKey, e.target.checked); if (!r.ok) setErr(r.error); router.refresh(); })} />
      เซ็นรับแล้ว{err && <span className="text-danger"> {err}</span>}
    </label>
  );
}

export function DocSettingsForm({ initial }: { initial: { payerName: string; corner: string; showKtbForm: boolean; intro: string; companyNote: string } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="card">
      <summary className="cursor-pointer text-lg font-semibold">ตั้งค่าเอกสารการเงิน (ผู้จ่ายเงิน · แบบ KTB)</summary>
      <div className="mt-3 space-y-3">
        <div className="flex flex-wrap gap-3">
          <label className="grow"><span className="label">ชื่อผู้จ่ายเงิน (ในวงเล็บใต้ลายเซ็น)</span><input className="input" value={f.payerName} maxLength={120} onChange={(e) => setF({ ...f, payerName: e.target.value })} /></label>
          <label><span className="label">ข้อความมุมขวาบนใบสำคัญฯ</span><input className="input" value={f.corner} maxLength={60} onChange={(e) => setF({ ...f, corner: e.target.value })} /></label>
        </div>
        <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.showKtbForm} onChange={(e) => setF({ ...f, showKtbForm: e.target.checked })} /> พิมพ์แบบแจ้งรับเงินโอน KTB คู่กับใบสำคัญรับเงิน (ค่าเริ่มต้น)</label>
        <label className="block"><span className="label">ข้อความแบบ KTB: ย่อหน้าขอรับเงิน</span><textarea className="input" rows={2} value={f.intro} maxLength={500} onChange={(e) => setF({ ...f, intro: e.target.value })} /></label>
        <label className="block"><span className="label">ข้อความแบบ KTB: หมายเหตุกรณีนิติบุคคล</span><textarea className="input" rows={2} value={f.companyNote} maxLength={500} onChange={(e) => setF({ ...f, companyNote: e.target.value })} /></label>
        <p className="hint">ชื่อหน่วยงานและ &quot;เรียน ...&quot; ดึงจาก ตั้งค่า → ตั้งค่าระบบ (ข้อมูลหน่วยงาน)</p>
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveDocSettingsAction(f); setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error }); if (r.ok) router.refresh(); })}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
      </div>
    </details>
  );
}