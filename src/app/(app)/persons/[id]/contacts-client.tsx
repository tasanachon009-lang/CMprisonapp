"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { UndoToast } from "@/components/undo-toast";
import { saveContactAction, deleteContactAction, restoreContactAction } from "@/app/(app)/enrollments/actions";
import { sendShiftMessage } from "@/app/(app)/inbox/actions";

type Contact = { id: number; kind: string; name: string | null; relation: string | null; phone: string | null; address: string | null; note: string | null };
const KIND: Record<string, string> = { relative: "ญาติ/ผู้ติดต่อ", address_after_release: "ที่อยู่หลังปล่อย", health_unit: "หน่วยบริการสาธารณสุขใกล้บ้าน" };

export function ContactsEditor({ personId, contacts, canEdit }: { personId: number; contacts: Contact[]; canEdit: boolean }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [undo, setUndo] = useState<number | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card">
      <div className="flex items-center gap-2">
        <h2 className="mr-auto text-xl">ข้อมูลติดต่อ</h2>
        {canEdit && <button className="btn-ghost btn-sm" onClick={() => { setError(null); setEdit({ kind: "relative" }); }}><Plus size={16} aria-hidden /> เพิ่ม</button>}
      </div>
      {contacts.length === 0 ? <p className="mt-2 text-muted">ยังไม่มีข้อมูลญาติ/ที่อยู่หลังปล่อย/หน่วยบริการใกล้บ้าน</p> : (
        <ul className="mt-3 grid gap-2 md:grid-cols-2">
          {contacts.map((c) => (
            <li key={c.id} className="rounded-2xl bg-cream p-3">
              <p className="text-sm text-muted">{KIND[c.kind]}</p>
              <p className="font-medium">{c.name}{c.relation ? ` (${c.relation})` : ""}</p>
              {c.phone && <p>โทร {c.phone}</p>}
              {c.address && <p className="text-sm">{c.address}</p>}
              {c.note && <p className="text-sm text-muted">{c.note}</p>}
              {canEdit && (
                <div className="mt-1 flex gap-1">
                  <button className="rounded-full p-2 hover:bg-lime" aria-label="แก้ไข" onClick={() => { setError(null); setEdit(c); }}><Pencil size={16} /></button>
                  <button className="rounded-full p-2 hover:bg-danger/10" aria-label="ลบ" onClick={() => start(async () => { if (!confirm("ลบรายการนี้?")) return; const r = await deleteContactAction(c.id); if (r.ok) { setUndo(c.id); router.refresh(); } })}><Trash2 size={16} /></button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? "แก้ไขข้อมูลติดต่อ" : "เพิ่มข้อมูลติดต่อ"}>
        {edit && (
          <div className="space-y-3">
            <label className="block"><span className="label">ประเภท</span><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value })}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block"><span className="label">{edit.kind === "health_unit" ? "ชื่อหน่วยบริการ" : "ชื่อ"}</span><input className="input" value={edit.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            {edit.kind === "relative" && <label className="block"><span className="label">ความสัมพันธ์</span><input className="input" list="rel" value={edit.relation ?? ""} onChange={(e) => setEdit({ ...edit, relation: e.target.value })} /><datalist id="rel">{["บิดา", "มารดา", "คู่สมรส", "บุตร", "พี่น้อง", "ญาติ"].map((r) => <option key={r} value={r} />)}</datalist></label>}
            <label className="block"><span className="label">เบอร์โทร</span><input className="input" inputMode="tel" value={edit.phone ?? ""} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
            <label className="block"><span className="label">ที่อยู่</span><textarea className="input" rows={2} value={edit.address ?? ""} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
            <label className="block"><span className="label">หมายเหตุ</span><input className="input" value={edit.note ?? ""} onChange={(e) => setEdit({ ...edit, note: e.target.value })} /></label>
            {error && <Alert tone="danger">{error}</Alert>}
            <div className="flex justify-end gap-2">
              <button className="btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button>
              <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
                const r = await saveContactAction(edit.id ?? null, { personId, kind: edit.kind as "relative", name: edit.name || null, relation: edit.relation || null, phone: edit.phone || null, address: edit.address || null, note: edit.note || null });
                if (!r.ok) return setError(r.error);
                setEdit(null);
                router.refresh();
              })}>บันทึก</button>
            </div>
          </div>
        )}
      </Modal>
      {undo && <UndoToast message="ลบแล้ว" onUndo={() => { const id = undo; setUndo(null); void restoreContactAction(id).then(() => router.refresh()); }} onClose={() => setUndo(null)} />}
    </section>
  );
}

/** ส่งเวรเกี่ยวกับบุคคลนี้ (ผูกกับผู้ต้องขัง) */
export function HandoffButton({ personId, name }: { personId: number; name: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ level: "important" as "normal" | "important" | "red", body: "", healthRelated: false, needsAction: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-ghost" onClick={() => setOpen(true)}><Send size={20} aria-hidden /> ส่งเวรเรื่องคนนี้</button>
      <Modal open={open} onClose={() => setOpen(false)} title={`ส่งเวร: ${name}`}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([["normal", "ปกติ"], ["important", "สำคัญ"], ["red", "สีแดง"]] as const).map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, level: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${f.level === v ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>)}
          </div>
          <textarea className="input" rows={3} placeholder="เช่น ฝากติดตามอาการ" value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} autoFocus />
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.healthRelated} onChange={(e) => setF({ ...f, healthRelated: e.target.checked })} /> เป็นเรื่องสุขภาพ (ปิดบังจากผู้ไม่มีสิทธิ์)</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.needsAction} onChange={(e) => setF({ ...f, needsAction: e.target.checked })} /> ต้องติดตาม</label>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={pending || !f.body.trim()} onClick={() => start(async () => {
              const r = await sendShiftMessage({ ...f, personId, recipientType: "next_shift", recipientUserId: null, dueDate: null });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              setF({ ...f, body: "" });
              router.refresh();
            })}>ส่งถึงผลัดถัดไป</button>
          </div>
        </div>
      </Modal>
    </>
  );
}
