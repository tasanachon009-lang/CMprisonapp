"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Plus, Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import type { Band, Item } from "@/lib/assessments/scoring";
import { saveFormVersion } from "../actions";

export function FormEditor({ formId, kind, method, items: initItems, bands: initBands, today }: { formId: number; kind: string; method: string; items: Item[]; bands: Band[] | null; today: string }) {
  const router = useRouter();
  const [items, setItems] = useState(initItems);
  const [bands, setBands] = useState(initBands);
  const [from, setFrom] = useState(today);
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const setItem = (i: number, patch: Partial<Item>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const [bulk, setBulk] = useState("");
  const bulkLines = bulk.split(/\r?\n/).map((l) => l.replace(/^\s*[0-9๐-๙]+\s*[.)]\s*/, "").trim()).filter(Boolean);
  // ใส่เฉพาะข้อความ — ข้อกลับคะแนน/เฉลย/กลุ่มของแต่ละข้อคงเดิม · ยังไม่บันทึกจนกว่าจะกด "บันทึกเป็นเวอร์ชันใหม่"
  const applyBulk = () => { setItems(items.map((x, j) => (bulkLines[j] ? { ...x, text: bulkLines[j].slice(0, 1000) } : x))); setMsg({ tone: "ok", text: `ใส่ข้อความแล้ว ${Math.min(bulkLines.length, items.length)} ข้อ ตรวจแล้วกดบันทึกเป็นเวอร์ชันใหม่` }); };
  return (
    <section className="card space-y-4">
      <h3 className="text-lg">ข้อคำถาม</h3>
      {/* วางข้อความหลายข้อพร้อมกัน (เช่น คัดลอกจากไฟล์คู่มือของหน่วยงาน): 1 บรรทัด = 1 ข้อ ตามลำดับ */}
      <details className="rounded-xl border border-line p-3">
        <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold">วางข้อความหลายข้อพร้อมกัน</summary>
        <div className="mt-2 space-y-2">
          <textarea className="input" rows={8} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="ข้อความข้อคำถาม บรรทัดละ 1 ข้อ" placeholder={"บรรทัดละ 1 ข้อ เรียงตามลำดับข้อ\nเลขข้อนำหน้า (เช่น 1. หรือ 1) ) ระบบตัดออกให้"} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn-secondary" disabled={bulkLines.length === 0} onClick={applyBulk}>ใส่ลงข้อ 1–{Math.min(bulkLines.length, items.length)}</button>
            <span className={`text-sm ${bulkLines.length && bulkLines.length !== items.length ? "font-semibold text-warn" : "text-muted"}`}>วางแล้ว {bulkLines.length} บรรทัด · แบบนี้มี {items.length} ข้อ{bulkLines.length > items.length ? " (บรรทัดที่เกินจะไม่ถูกใช้)" : ""}</span>
          </div>
        </div>
      </details>
      <div className="space-y-2">
        {items.map((it, i) => (
          <div key={it.no} className="grid gap-2 rounded-xl bg-cream p-2 sm:grid-cols-12">
            <span className="self-center font-semibold sm:col-span-1">{it.group ? `${it.group} ` : ""}{it.no > 100 ? it.no % 100 : it.no}</span>
            <input className="input sm:col-span-7" value={it.text} onChange={(e) => setItem(i, { text: e.target.value })} aria-label={`ข้อความข้อ ${it.no}`} />
            <input className="input sm:col-span-2" placeholder="คำอธิบาย (?)" value={it.help ?? ""} onChange={(e) => setItem(i, { help: e.target.value || undefined })} aria-label={`คำอธิบายข้อ ${it.no}`} />
            <span className="flex items-center gap-2 text-sm sm:col-span-2">
              {method === "correct" && <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.correct} onChange={(e) => setItem(i, { correct: e.target.checked })} /> เฉลย=ถูก</label>}
              {method === "sum" && kind === "items" && <label className="flex items-center gap-1"><input type="checkbox" checked={!!it.reverse} onChange={(e) => setItem(i, { reverse: e.target.checked })} /> กลับคะแนน</label>}
            </span>
          </div>
        ))}
      </div>
      {bands && (
        <>
          <h3 className="text-lg">เกณฑ์แปลผล</h3>
          <div className="space-y-2">
            {bands.map((b, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input className="input w-20" inputMode="numeric" value={b.min} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, min: Number(e.target.value) || 0 } : x)))} aria-label="ต่ำสุด" />
                <span>–</span>
                <input className="input w-20" inputMode="numeric" value={b.max} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, max: Number(e.target.value) || 0 } : x)))} aria-label="สูงสุด" />
                <input className="input flex-1" value={b.label} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="ผล" />
                <select className="input w-36" value={b.tone} onChange={(e) => setBands(bands.map((x, j) => (j === i ? { ...x, tone: e.target.value as Band["tone"] } : x)))}><option value="ok">เขียว (ปกติ)</option><option value="warn">เหลือง</option><option value="danger">แดง (เสี่ยง)</option></select>
                <button className="rounded-full p-2 hover:bg-danger/10" aria-label="ลบช่วง" onClick={() => setBands(bands.filter((_, j) => j !== i))}><Trash2 size={16} /></button>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => setBands([...bands, { min: 0, max: 0, label: "", tone: "ok" }])}><Plus size={16} aria-hidden /> เพิ่มช่วง</button>
          </div>
        </>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div><span className="label">เริ่มใช้ตั้งแต่</span><ThaiDateInput value={from} onChange={setFrom} /></div>
        <label><span className="label">หมายเหตุการแก้ไข</span><input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="เช่น ใส่ข้อความตามคู่มือปี 2569" /></label>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
        const r = await saveFormVersion(formId, items, bands, from, note);
        setMsg(r.ok ? { tone: "ok", text: `บันทึกเป็นเวอร์ชัน ${r.data!.version} แล้ว` } : { tone: "danger", text: r.error });
        if (r.ok) router.refresh();
      })}><Save size={20} aria-hidden /> บันทึกเป็นเวอร์ชันใหม่</button>
    </section>
  );
}
