"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Copy, Send } from "lucide-react";
import { Alert } from "@/components/ui";
import { saveLineSettingsAction, sendLineTestAction } from "./actions";

export function LineSettingsForm({ initial }: { initial: { enabled: boolean; sendTime: string; weeklyOnFriday: boolean; weeklyReportSummary: boolean } }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const check = (k: "enabled" | "weeklyOnFriday" | "weeklyReportSummary", label: string) => (
    <label className="flex min-h-11 items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.checked })} /> {label}</label>
  );
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ตั้งค่าการส่ง</h2>
      {check("enabled", "เปิดการส่ง LINE อัตโนมัติ (ตารางวันทำการถัดไป + แจ้งเปลี่ยนแปลง)")}
      <label className="flex items-center gap-2"><span>เวลาส่งทุกวันทำการ</span><input type="time" className="input w-auto" value={f.sendTime} onChange={(e) => setF({ ...f, sendTime: e.target.value })} /></label>
      {check("weeklyOnFriday", "วันศุกร์ส่งตารางสัปดาห์หน้าเพิ่ม")}
      {check("weeklyReportSummary", "อนุมัติรายงานประจำสัปดาห์แล้ว ส่ง \"สรุปตัวเลข\" ทาง LINE (ไม่มีชื่อบุคคล)")}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await saveLineSettingsAction(f); setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error }); if (r.ok) router.refresh(); })}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
    </section>
  );
}

export function TestButtons() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (k: "ping" | "tomorrow") => start(async () => { const r = await sendLineTestAction(k); setMsg(r.ok ? { tone: "ok", text: r.message ?? "ส่งแล้ว" } : { tone: "danger", text: r.error }); router.refresh(); });
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary" disabled={pending} onClick={() => run("ping")}><Send size={18} aria-hidden /> ส่งข้อความทดสอบ</button>
        <button type="button" className="btn-ghost" disabled={pending} onClick={() => { if (confirm("ส่งตารางวันทำการถัดไปถึงทุกคนที่เพิ่มเพื่อนตอนนี้?")) run("tomorrow"); }}>ส่งตารางวันทำการถัดไปตอนนี้</button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

export function CopyText({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost btn-sm" onClick={() => navigator.clipboard?.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 2000); })}>
      <Copy size={16} aria-hidden /> {done ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
    </button>
  );
}
