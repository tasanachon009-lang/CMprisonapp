"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveTemplateAction, resetTemplateAction } from "../../documents/actions";
import { Alert } from "@/components/ui";

type T = { subject: string; toLine: string; body: string };

export function TemplateEditor(p: { code: string; name: string; kindLabel: string; customized: boolean; showTo: boolean; known: string[]; initial: T; defaults: T }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState<T>(p.initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const set = (k: keyof T, v: string) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };
  // ตัวแปรที่พิมพ์ผิด → เตือนทันที (ไม่ห้ามบันทึก)
  const unknown = useMemo(() => Array.from(new Set(Array.from(`${f.subject}\n${f.toLine}\n${f.body}`.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g), (m) => m[1]).filter((k) => !p.known.includes(k)))), [f, p.known]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: okText } : { tone: "danger", text: r.error! });
      if (r.ok) router.refresh();
    });

  return (
    <section className="card space-y-3">
      <h2 className="text-xl">{p.name} <span className="tag-muted ml-1 align-middle text-sm">{p.kindLabel}</span> {p.customized && <span className="tag-navy ml-1 align-middle text-sm">แก้แล้ว</span>}</h2>
      <div><label className="label" htmlFor={`${p.code}-s`}>เรื่อง</label><input id={`${p.code}-s`} className="input" value={f.subject} onChange={(e) => set("subject", e.target.value)} /></div>
      {p.showTo && <div><label className="label" htmlFor={`${p.code}-t`}>เรียน</label><input id={`${p.code}-t`} className="input" value={f.toLine} onChange={(e) => set("toLine", e.target.value)} /></div>}
      <div><label className="label" htmlFor={`${p.code}-b`}>เนื้อความ</label><textarea id={`${p.code}-b`} className="input" rows={10} value={f.body} onChange={(e) => set("body", e.target.value)} /></div>
      {unknown.length > 0 && <Alert tone="warn">ตัวแปรที่ระบบไม่รู้จัก: {unknown.map((k) => `{{${k}}}`).join(", ")} — ตรวจตัวสะกดกับรายการด้านบน</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-primary" disabled={pending} onClick={() => run(() => saveTemplateAction(p.code, f), "บันทึกแม่แบบแล้ว — มีผลกับเอกสารที่สร้างใหม่")}>บันทึกแม่แบบ</button>
        {p.customized && <button type="button" className="btn-ghost" disabled={pending} onClick={() => { setF(p.defaults); run(() => resetTemplateAction(p.code), "คืนค่าเริ่มต้นแล้ว"); }}>คืนค่าเริ่มต้น</button>}
      </div>
    </section>
  );
}
