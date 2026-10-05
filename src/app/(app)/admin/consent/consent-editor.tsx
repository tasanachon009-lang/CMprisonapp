"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, RotateCcw } from "lucide-react";
import { Alert } from "@/components/ui";
import { fillConsent, CONSENT_LIMITS } from "@/lib/consent-text";
import { saveConsentText } from "../actions";

export function ConsentEditor({ initialTitle, initialParagraphs, isDefault, org, unit }: { initialTitle: string; initialParagraphs: string[]; isDefault: boolean; org: string; unit: string }) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [paras, setParas] = useState(initialParagraphs);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const done = (r: { ok: boolean; error?: string; message?: string }) => {
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error! });
    if (r.ok) router.refresh();
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="card space-y-3">
        <h2 className="text-xl">แก้ข้อความ {isDefault && <span className="tag-muted ml-1 align-middle text-sm">ข้อความเริ่มต้น</span>}</h2>
        <p className="hint">ใช้ <code>{"{org}"}</code> = ชื่อเรือนจำ และ <code>{"{unit}"}</code> = ชื่อหน่วย (ระบบเติมจากตั้งค่าหน่วยงานให้) · ชื่อผู้ต้องขัง เลขประจำตัว ช่องยินยอม/ไม่ยินยอม และช่องลงชื่อ ระบบใส่ให้เอง</p>
        <label className="block"><span className="label">ชื่อแบบฟอร์ม</span><input className="input" value={title} maxLength={CONSENT_LIMITS.titleMax} onChange={(e) => setTitle(e.target.value)} /></label>
        {paras.map((p, i) => (
          <div key={i}>
            <div className="flex items-center justify-between">
              <span className="label">ย่อหน้าที่ {i + 1}</span>
              {paras.length > 1 && <button type="button" className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm text-danger hover:bg-danger/10" onClick={() => setParas(paras.filter((_, j) => j !== i))} aria-label={`ลบย่อหน้าที่ ${i + 1}`}><Trash2 size={16} aria-hidden /> ลบ</button>}
            </div>
            <textarea className="input" rows={4} maxLength={CONSENT_LIMITS.paragraphMax} value={p} onChange={(e) => setParas(paras.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`ย่อหน้าที่ ${i + 1}`} />
          </div>
        ))}
        {paras.length < CONSENT_LIMITS.paragraphs && <button type="button" className="btn-ghost btn-sm" onClick={() => setParas([...paras, ""])}><Plus size={16} aria-hidden /> เพิ่มย่อหน้า</button>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        <div className="flex flex-wrap gap-2">
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => done(await saveConsentText({ title, paragraphs: paras })))}><Save size={20} aria-hidden /> บันทึก</button>
          {!isDefault && (
            <button className="btn-ghost" disabled={pending} onClick={() => { if (confirm("กลับเป็นข้อความเริ่มต้นของระบบ?")) start(async () => { const r = await saveConsentText({ reset: true }); done(r); if (r.ok) window.location.reload(); }); }}>
              <RotateCcw size={18} aria-hidden /> กลับเป็นข้อความเริ่มต้น
            </button>
          )}
        </div>
      </section>

      <section className="card">
        <h2 className="text-xl">ตัวอย่างเมื่อพิมพ์</h2>
        <div className="mt-3 rounded-2xl border border-line bg-white p-4 leading-relaxed">
          <p className="text-center font-bold">{fillConsent(title, org, unit)}</p>
          <p className="mt-3">ข้าพเจ้า ............................................ เลขประจำตัวผู้ต้องขัง ....................</p>
          {paras.filter((p) => p.trim()).map((p, i) => <p key={i} className="mt-2 indent-10">{fillConsent(p, org, unit)}</p>)}
          <p className="mt-3">☐ ยินยอม &nbsp;&nbsp; ☐ ไม่ยินยอม เนื่องจาก ........................</p>
          <p className="mt-4 text-right">ลงชื่อ .............................. ผู้ให้ความยินยอม</p>
          <p className="text-right">ลงชื่อ .............................. เจ้าหน้าที่ผู้รับเอกสาร</p>
        </div>
        {(!org || !unit) && <p className="hint mt-2">ยังไม่ได้ตั้งชื่อเรือนจำ/ชื่อหน่วย — ตั้งได้ที่ ตั้งค่า → ตั้งค่าระบบ</p>}
      </section>
    </div>
  );
}
