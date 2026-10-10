"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, Wand2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { saveGeneralAction, saveMonthlyNoteAction, addOpinionAction, updateOpinionAction, deleteOpinionAction } from "./actions";

type Msg = { tone: "ok" | "danger"; text: string } | null;

/** ส่วนที่ 1 ข้อ 3: ข้อมูลเกี่ยวข้อง (ข้อความยาว 2 ช่อง) */
export function GeneralForm({ enrollmentId, initial, version, canEdit }: { enrollmentId: number; initial: { housingBefore: string; familyBond: string }; version: number; canEdit: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveGeneralAction(enrollmentId, f, version);
    setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="space-y-3">
      <label className="block"><span className="label">สภาพที่อยู่อาศัยก่อนต้องโทษ</span><textarea className="input" rows={3} maxLength={5000} readOnly={!canEdit} value={f.housingBefore} onChange={(e) => setF({ ...f, housingBefore: e.target.value })} /></label>
      <label className="block"><span className="label">ความผูกพันในครอบครัว</span><textarea className="input" rows={3} maxLength={5000} readOnly={!canEdit} value={f.familyBond} onChange={(e) => setF({ ...f, familyBond: e.target.value })} /></label>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {canEdit && <button type="button" className="btn-primary" disabled={pending} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>}
    </div>
  );
}

export type MonthView = { period: string; label: string; text: string; noteDate: string; version: number | null; author: string | null; helper: string[]; summary: string };

/** ส่วนที่ 3: 1 บันทึกต่อเดือน พร้อมข้อมูลช่วยเขียนและปุ่ม "แทรกสรุป" */
export function MonthlyNote({ enrollmentId, m, today, canEdit }: { enrollmentId: number; m: MonthView; today: string; canEdit: boolean }) {
  const router = useRouter();
  const [text, setText] = useState(m.text);
  const [date, setDate] = useState(m.noteDate || today);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveMonthlyNoteAction(enrollmentId, { period: m.period, text, noteDate: date }, m.version ?? undefined);
    setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="rounded-2xl border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-lg font-semibold">{m.label}</h3>
        {m.version != null ? <span className="tag-ok">บันทึกแล้ว</span> : <span className="tag-warn">ยังไม่บันทึก</span>}
        {m.author && <span className="text-sm text-muted">ผู้บันทึก {m.author}</span>}
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-3">
        <div className="space-y-2 lg:col-span-2">
          <textarea className="input" rows={5} maxLength={5000} readOnly={!canEdit} aria-label={`บันทึกความก้าวหน้า ${m.label}`} value={text} onChange={(e) => setText(e.target.value)} />
          {canEdit && (
            <div className="flex flex-wrap items-end gap-3">
              <div><span className="label">วันที่บันทึก</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
              {m.summary && <button type="button" className="btn-secondary" onClick={() => setText(text ? `${text}\n${m.summary}` : m.summary)}><Wand2 size={18} aria-hidden /> แทรกสรุป</button>}
              <button type="button" className="btn-primary" disabled={pending || text.trim().length < 3} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>
            </div>
          )}
          {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        </div>
        <div className="rounded-xl bg-cream p-3 text-sm">
          <p className="font-semibold">ข้อมูลของเดือนนี้</p>
          {m.helper.length ? <ul className="mt-1 space-y-1">{m.helper.map((h) => <li key={h}>{h}</li>)}</ul> : <p className="text-muted">ยังไม่มีข้อมูล</p>}
        </div>
      </div>
    </div>
  );
}

export type OpinionView = { id: number; text: string; noteDate: string; dateLabel: string; author: string; mine: boolean };

/** ส่วนที่ 4: ความเห็นของที่ปรึกษา — เขียนได้หลายครั้ง แสดงล่าสุดก่อน · แก้/ลบได้เฉพาะของตน (หรือผู้ดูแล) */
export function Opinions({ enrollmentId, list, today, canEdit, isAdmin }: { enrollmentId: number; list: OpinionView[]; today: string; canEdit: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [date, setDate] = useState(today);
  const [edit, setEdit] = useState<{ id: number; text: string; noteDate: string } | null>(null);
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error ?? "ไม่สำเร็จ" });
    if (r.ok) { after?.(); router.refresh(); }
  });
  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="space-y-2">
          <textarea className="input" rows={3} maxLength={5000} aria-label="ความเห็นของที่ปรึกษา" value={text} onChange={(e) => setText(e.target.value)} />
          <div className="flex flex-wrap items-end gap-3">
            <div><span className="label">วันที่</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
            <button type="button" className="btn-primary" disabled={pending || text.trim().length < 3} onClick={() => run(() => addOpinionAction(enrollmentId, { text, noteDate: date }), () => setText(""))}><Save size={20} aria-hidden /> เพิ่มความเห็น</button>
          </div>
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {list.length === 0 ? <p className="text-muted">ยังไม่มีความเห็น</p> : (
        <ul className="space-y-3">
          {list.map((o) => (
            <li key={o.id} className="rounded-2xl border border-line p-4">
              <p className="text-sm text-muted">{o.dateLabel} · ที่ปรึกษา {o.author}</p>
              {edit?.id === o.id ? (
                <div className="mt-2 space-y-2">
                  <textarea className="input" rows={3} maxLength={5000} aria-label="แก้ความเห็น" value={edit.text} onChange={(e) => setEdit({ ...edit, text: e.target.value })} />
                  <div className="flex flex-wrap items-end gap-2">
                    <ThaiDateInput value={edit.noteDate} onChange={(v) => setEdit({ ...edit, noteDate: v })} max={today} />
                    <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => updateOpinionAction(enrollmentId, o.id, { text: edit.text, noteDate: edit.noteDate }), () => setEdit(null))}>บันทึก</button>
                    <button type="button" className="btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
                  </div>
                </div>
              ) : <p className="mt-1 whitespace-pre-wrap">{o.text}</p>}
              {canEdit && (o.mine || isAdmin) && edit?.id !== o.id && (
                <div className="mt-2 flex gap-2">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => setEdit({ id: o.id, text: o.text, noteDate: o.noteDate })}>แก้ไข</button>
                  <button type="button" className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { if (confirm("ยืนยันการลบความเห็นนี้")) run(() => deleteOpinionAction(enrollmentId, o.id)); }}><Trash2 size={16} aria-hidden /> ลบ</button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
