"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowUpCircle, Undo2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { PersonThumb } from "@/components/person-thumb";
import { ThaiDateInput } from "@/components/thai-date-input";
import { advancePhaseAction, revertPhaseAction } from "./actions";

export type MemberRow = {
  enrollmentId: number; name: string; inmateNo: string; thumb: string | null; zone: string | null;
  phaseNo: number; phaseLabel: string; since: string | null; nextCode: string | null; nextLabel: string | null; due: boolean; ahead: boolean; lastNote: string | null; missingNotes: number;
};

/** รายชื่อสมาชิกพร้อมระยะปัจจุบัน — เลือกหลายคนแล้วอนุมัติเลื่อนระยะครั้งเดียว (สเปก 22A: ทำกับหลายคนพร้อมกัน) */
export function PhaseTable({ cohortId, rows, today, canApprove }: { cohortId: number; rows: MemberRow[]; today: string; canApprove: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const chosen = rows.filter((r) => sel.has(r.enrollmentId));
  const targets = Array.from(new Set(chosen.map((r) => r.nextCode)));
  const target = targets.length === 1 ? chosen[0] : null;

  const toggle = (id: number, on: boolean) => { const s = new Set(sel); if (on) s.add(id); else s.delete(id); setSel(s); };
  const advance = () => start(async () => {
    if (!target?.nextCode) return;
    const r = await advancePhaseAction(cohortId, { enrollmentIds: chosen.map((c) => c.enrollmentId), toPhase: target.nextCode, date, note });
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: r.data!.errors.length ? "warn" : "ok", text: `เลื่อนระยะแล้ว ${r.data!.done} คน${r.data!.errors.length ? ` · ไม่สำเร็จ ${r.data!.errors.length} คน: ${r.data!.errors[0]}` : ""}` });
    setSel(new Set());
    setNote("");
    router.refresh();
  });
  const revert = (id: number) => start(async () => {
    const reason = window.prompt("เหตุผลที่ยกเลิกการเลื่อนระยะล่าสุด");
    if (!reason) return;
    const r = await revertPhaseAction(cohortId, id, reason);
    setMsg(r.ok ? { tone: "ok", text: "ยกเลิกการเลื่อนระยะล่าสุดแล้ว" } : { tone: "danger", text: r.error });
    router.refresh();
  });

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="overflow-x-auto">
        <table className="table-plain">
          <thead>
            <tr>
              {canApprove && <th className="w-10"><span className="sr-only">เลือก</span></th>}
              <th className="min-w-56">ชื่อ-สกุล</th><th>ระยะปัจจุบัน</th><th>เริ่มระยะ</th><th>สถานะ</th>{canApprove && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId}>
                {canApprove && <td>{r.nextCode && <input type="checkbox" className="h-5 w-5" checked={sel.has(r.enrollmentId)} aria-label={`เลือก ${r.name}`} onChange={(e) => toggle(r.enrollmentId, e.target.checked)} />}</td>}
                <td>
                  <div className="flex items-center gap-2">
                    <PersonThumb name={r.name} thumb={r.thumb} inmateNo={r.inmateNo} zone={r.zone} />
                    <Link href={`/enrollments/${r.enrollmentId}/book`} className="hover:underline" title="เปิดสมุดของสมาชิก">{r.name}</Link>{r.missingNotes > 0 && <span className="tag-warn">ค้างบันทึกรายเดือน {r.missingNotes}</span>}
                  </div>
                </td>
                <td><span className="tag-navy">{r.phaseLabel}</span></td>
                <td className="whitespace-nowrap">{r.since ?? "-"}{r.lastNote && <span className="block max-w-xs truncate text-sm text-muted" title={r.lastNote}>{r.lastNote}</span>}</td>
                <td>{r.due ? <span className="tag-warn">ถึงกำหนดเลื่อนเป็น {r.nextLabel}</span> : r.ahead ? <span className="tag-muted">เลื่อนก่อนกำหนด</span> : <span className="tag-ok">ตามกำหนด</span>}</td>
                {canApprove && <td className="text-right">{r.phaseNo > 1 && <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => revert(r.enrollmentId)}><Undo2 size={16} aria-hidden /> ยกเลิกล่าสุด</button>}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canApprove && chosen.length > 0 && (
        <div className="panel space-y-3 p-4">
          {target ? <p className="font-semibold">เลื่อน {chosen.length} คน เป็นระยะ {target.nextLabel}</p> : <Alert tone="warn">สมาชิกที่เลือกอยู่คนละระยะ กรุณาเลือกเฉพาะผู้ที่จะเลื่อนไประยะเดียวกัน</Alert>}
          <div className="flex flex-wrap items-end gap-3">
            <div><span className="label">วันที่เลื่อนระยะ</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
            <label className="min-w-64 flex-1"><span className="label">ผลการประเมิน / เหตุผล <span className="text-danger">*</span></span><input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
            <button type="button" className="btn-primary" disabled={pending || !target || note.trim().length < 3} onClick={advance}><ArrowUpCircle size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "อนุมัติเลื่อนระยะ"}</button>
          </div>
        </div>
      )}
    </div>
  );
}
