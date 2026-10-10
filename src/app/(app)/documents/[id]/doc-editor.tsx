"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock, Save, Trash2, Unlock } from "lucide-react";
import { updateDocumentAction, setDocumentStatusAction, deleteDocumentAction } from "../actions";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Alert } from "@/components/ui";

type Form = { docNo: string; docDate: string; subject: string; toLine: string; refs: string; attachments: string; body: string; signerName: string; signerTitle: string };

/** แก้ข้อความเอกสารก่อนพิมพ์ — เนื้อความ 1 บรรทัด = 1 ย่อหน้า · วันที่เว้นว่างได้ (ลงด้วยมือ) */
export function DocEditor(p: { id: number; kind: "memo" | "letter" | "order"; today: string; readOnly: boolean; locked: boolean; backHref: string; initial: Form & { version: number } }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [f, setF] = useState<Form>(p.initial);
  const [dirty, setDirty] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setDirty(true); setMsg(null); };
  const ro = p.readOnly || p.locked;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return setMsg({ tone: "danger", text: r.error! });
      setMsg({ tone: "ok", text: okText });
      setDirty(false);
      if (after) after(); else router.refresh();
    });
  const save = () => run(() => updateDocumentAction(p.id, f, p.initial.version), "บันทึกแล้ว");

  const text = (k: keyof Form, label: string, o: { ph?: string; req?: boolean } = {}) => (
    <div><label className="label" htmlFor={`doc-${k}`}>{label} {o.req && <span className="text-danger">*</span>}</label><input id={`doc-${k}`} className="input" value={f[k]} placeholder={o.ph} onChange={(e) => set(k, e.target.value)} /></div>
  );
  const area = (k: keyof Form, label: string, rows: number, hint?: string) => (
    <div><label className="label" htmlFor={`doc-${k}`}>{label}</label><textarea id={`doc-${k}`} className="input" rows={rows} value={f[k]} onChange={(e) => set(k, e.target.value)} />{hint && <p className="mt-1 text-sm text-muted">{hint}</p>}</div>
  );

  return (
    <div className="space-y-4">
      {p.locked && <Alert tone="ok">เอกสารนี้ล็อกแล้ว (ฉบับที่ใช้จริง)</Alert>}
      <fieldset disabled={ro} className="card space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {text("docNo", p.kind === "order" ? "คำสั่งที่ (เช่น 123/2569)" : "ที่ (เลขที่หนังสือ)", { ph: "เว้นว่างไว้เติมด้วยมือได้" })}
          <div>
            <span className="label">{p.kind === "order" ? "สั่ง ณ วันที่" : "วันที่"} <span className="font-normal text-muted">(เว้นว่างได้)</span></span>
            <div className="flex items-center gap-2">
              <ThaiDateInput key={f.docDate === "" ? "empty" : "set"} value={f.docDate} onChange={(v) => set("docDate", v)} />
              {f.docDate && <button type="button" className="btn-ghost btn-sm" onClick={() => set("docDate", "")}>ไม่ใส่วันที่</button>}
            </div>
          </div>
        </div>
        {text("subject", "เรื่อง", { req: true })}
        {p.kind !== "order" && text("toLine", "เรียน", { ph: p.kind === "letter" ? "ชื่อหรือตำแหน่งผู้รับ" : undefined })}
        {p.kind === "letter" && (
          <div className="grid gap-4 sm:grid-cols-2">
            {area("refs", "อ้างถึง (ถ้ามี)", 2, "บรรทัดละ 1 รายการ")}
            {area("attachments", "สิ่งที่ส่งมาด้วย (ถ้ามี)", 2, "บรรทัดละ 1 รายการ เช่น กำหนดการ จำนวน 1 ฉบับ")}
          </div>
        )}
        {area("body", "เนื้อความ", 14, "ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่ (เข้าย่อหน้าให้อัตโนมัติ) · บรรทัดที่ขึ้นต้นด้วย \"1. \" จัดเป็นรายการ")}
        <div className="grid gap-4 sm:grid-cols-2">
          {text("signerName", "ชื่อผู้ลงนาม (ในวงเล็บ)", { ph: "เว้นว่าง = เส้นประให้เขียน" })}
          {text("signerTitle", "ตำแหน่งผู้ลงนาม")}
        </div>
      </fieldset>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {dirty && !ro && <p className="text-sm text-warn">มีการแก้ไขที่ยังไม่บันทึก — กดบันทึกก่อนพิมพ์ มิฉะนั้นฉบับพิมพ์จะเป็นข้อความเดิม</p>}
      <div className="flex flex-wrap items-center justify-end gap-3">
        {!p.readOnly && !p.locked && (confirmDelete ? (
          <span className="mr-auto flex flex-wrap items-center gap-2">
            <span className="text-danger">ยืนยันการลบเอกสารฉบับนี้</span>
            <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => deleteDocumentAction(p.id), "ลบแล้ว", () => router.push(p.backHref))}>ยืนยันลบ</button>
            <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>ไม่ลบ</button>
          </span>
        ) : <button type="button" className="btn-ghost mr-auto" onClick={() => setConfirmDelete(true)}><Trash2 size={20} aria-hidden /> ลบ</button>)}
        <a href={p.backHref} className="btn-ghost">กลับ</a>
        {!p.readOnly && (p.locked
          ? <button type="button" className="btn-ghost" disabled={pending} onClick={() => run(() => setDocumentStatusAction(p.id, "draft"), "ปลดล็อกแล้ว")}><Unlock size={20} aria-hidden /> ปลดล็อกเพื่อแก้ไข</button>
          : <>
              <button type="button" className="btn-ghost" disabled={pending || dirty} title={dirty ? "บันทึกก่อนจึงจะล็อกได้" : undefined} onClick={() => run(() => setDocumentStatusAction(p.id, "final"), "ล็อกแล้ว")}><Lock size={20} aria-hidden /> ล็อกเป็นฉบับจริง</button>
              <button type="button" className="btn-primary" disabled={pending} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>
            </>)}
      </div>
    </div>
  );
}
