"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Search, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { Modal } from "@/components/modal";
import { PersonThumb } from "@/components/person-thumb";
import { ThaiDateInput } from "@/components/thai-date-input";
import { checkInmateNos, recordReleaseAction, cancelReleaseAction, type ReleaseCandidate } from "./actions";

export function ReleaseForm({ reasons, today }: { reasons: Array<{ code: string; label: string }>; today: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [cands, setCands] = useState<ReleaseCandidate[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [summary, setSummary] = useState<Array<{ inmateNo: string; name: string; actions: string[] }> | null>(null);
  const [pending, start] = useTransition();

  const check = () => start(async () => {
    setError(null);
    setSummary(null);
    const r = await checkInmateNos(text);
    if (!r.ok) return setError(r.error);
    setCands(r.data!);
    setSelected(new Set(r.data!.filter((c) => c.found && !c.alreadyReleased).map((c) => c.incarcerationId!)));
  });

  const submit = () => start(async () => {
    setError(null);
    const r = await recordReleaseAction([...selected], date, reason, note);
    setConfirming(false);
    if (!r.ok) return setError(r.error);
    setSummary(r.data!.summary);
    setCands(null);
    setText("");
    setSelected(new Set());
    router.refresh();
  });

  return (
    <section className="card space-y-4">
      <div>
        <label htmlFor="nos" className="label">1. วางเลขประจำตัว (หลายเลขได้ — ขึ้นบรรทัดใหม่/เว้นวรรค/จุลภาค)</label>
        <textarea id="nos" rows={4} className="input font-mono" value={text} onChange={(e) => setText(e.target.value)} placeholder={"69-01410\n69-01411"} />
        <button className="btn-secondary mt-2" onClick={check} disabled={pending || !text.trim()}><Search size={20} aria-hidden /> ตรวจรายชื่อ</button>
      </div>

      {cands && (
        <div>
          <p className="label">2. ตรวจชื่อและรูปให้ถูกคน</p>
          <ul className="panel divide-y divide-line">
            {cands.map((c) => (
              <li key={c.inmateNo} className="flex flex-wrap items-center gap-3 px-3 py-2">
                {c.found ? (
                  <>
                    <input type="checkbox" className="h-5 w-5" disabled={!!c.alreadyReleased} checked={selected.has(c.incarcerationId!)} aria-label={`เลือก ${c.name}`}
                      onChange={(e) => { const s = new Set(selected); if (e.target.checked) s.add(c.incarcerationId!); else s.delete(c.incarcerationId!); setSelected(s); }} />
                    <PersonThumb name={c.name!} thumb={c.thumb ?? null} inmateNo={c.inmateNo} zone={c.zone} />
                    <span className="font-medium">{c.name}</span>
                    <span className="font-mono text-muted">{c.inmateNo}</span>
                    {c.ongoing?.map((o) => <span key={o} className="tag-warn">กำลังอบรม {o}</span>)}
                    {c.alreadyReleased && <span className="tag-muted">บันทึกออกแล้ว ({c.alreadyReleased})</span>}
                  </>
                ) : (
                  <span className="text-danger">ไม่พบเลข <b className="font-mono">{c.inmateNo}</b> ในระบบ — ตรวจว่าพิมพ์ถูก</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {cands && selected.size > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div><span className="label">3. วันที่ออกจากเรือนจำ</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
          <label><span className="label">เหตุผล</span>
            <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">— เลือก —</option>
              {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
            </select>
          </label>
          <label><span className="label">หมายเหตุ</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <div className="sm:col-span-3"><button className="btn-primary" disabled={!reason || !date || pending} onClick={() => setConfirming(true)}>บันทึกออกจากเรือนจำ {selected.size} คน</button></div>
        </div>
      )}

      {error && <Alert tone="danger">{error}</Alert>}
      {summary && (
        <Alert tone="ok">
          <p className="flex items-center gap-2 font-semibold"><CheckCircle2 size={20} aria-hidden /> บันทึกแล้ว — สิ่งที่ระบบทำให้:</p>
          <ul className="mt-2 list-disc pl-6">
            {summary.map((s) => <li key={s.inmateNo}><b>{s.name}</b> ({s.inmateNo}): {s.actions.join(" · ")}</li>)}
          </ul>
        </Alert>
      )}

      <Modal open={confirming} onClose={() => setConfirming(false)} title="ยืนยันการบันทึก">
        <p>บันทึกว่า <b>{selected.size} คน</b> ออกจากเรือนจำเมื่อ <b>{date}</b> เหตุผล <b>{reasons.find((r) => r.code === reason)?.label}</b></p>
        <p className="mt-2 text-sm text-muted">ผู้ที่กำลังอบรมจะเปลี่ยนเป็น &quot;ออกก่อนกำหนด&quot; และถูกตัดออกจากการเช็คชื่อตั้งแต่วันนั้น (ยกเลิกภายหลังได้ ระบบย้อนให้)</p>
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setConfirming(false)}>ยกเลิก</button><button className="btn-primary" disabled={pending} onClick={submit}>ยืนยัน</button></div>
      </Modal>
    </section>
  );
}

export function CancelReleaseButton({ eventId, label }: { eventId: number; label: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}><Undo2 size={16} aria-hidden /> ยกเลิก</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`ยกเลิกบันทึกออกของ ${label}`}>
        <p className="text-sm text-muted">ระบบจะคืนสถานะการอบรมและผลเช็คชื่อที่ถูกตัดไปให้</p>
        <label className="mt-3 block"><span className="label">เหตุผลการยกเลิก</span><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {msg && <div className="mt-2"><Alert tone="danger">{msg}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>ปิด</button>
          <button className="btn-danger" disabled={!reason.trim() || pending} onClick={() => start(async () => { const r = await cancelReleaseAction(eventId, reason); if (!r.ok) return setMsg(r.error); setOpen(false); router.refresh(); })}>ยืนยันยกเลิก</button>
        </div>
      </Modal>
    </>
  );
}
