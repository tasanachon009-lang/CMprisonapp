"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import { saveTopicChipsAction, saveReportChoicesAction } from "../pay-actions";

const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

/** ชิป "สิ่งที่ได้" ของแต่ละหัวข้อ (สเปก 22B) — 1 บรรทัด = 1 ชิป */
export function TopicChipsEditor({ topics }: { topics: Array<{ id: number; name: string; chips: string[]; draft: boolean }> }) {
  return (
    <ul className="space-y-2">
      {topics.map((t) => <TopicChipsRow key={t.id} t={t} />)}
    </ul>
  );
}

function TopicChipsRow({ t }: { t: { id: number; name: string; chips: string[]; draft: boolean } }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(t.chips.join("\n"));
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveTopicChipsAction(t.id, lines(text));
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) { setOpen(false); router.refresh(); }
  });
  return (
    <li className="rounded-2xl border border-line bg-white px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{t.name}</span>
        {t.draft && <span className="tag-warn" title="ระบบร่างจากชื่อหัวข้อ — ตรวจกับจุดประสงค์การเรียนรู้ในคู่มือ">ร่าง</span>}
        <span className="flex flex-wrap gap-1">{t.chips.map((c) => <span key={c} className="rounded-full bg-cream px-2 py-0.5 text-sm">{c}</span>)}</span>
        <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setOpen(!open)}>{open ? "ปิด" : "แก้ชิป"}</button>
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <label className="block"><span className="label">1 บรรทัด = 1 ชิป (สูงสุด 20)</span><textarea className="input" rows={6} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>{pending ? "กำลังบันทึก..." : t.draft ? "บันทึก (ตรวจแล้ว)" : "บันทึก"}</button>
        </div>
      )}
      {msg && <div className="mt-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </li>
  );
}

/** ชิปทั่วไป (ทุกหัวข้อ) + เหตุผลสำเร็จรูปของ "บางส่วน" / "ไม่ได้ทำ" */
export function ReportChoicesEditor({ generalChips, reasons }: { generalChips: string[]; reasons: { partial: string[]; not_done: string[] } }) {
  const router = useRouter();
  const [g, setG] = useState(generalChips.join("\n"));
  const [p, setP] = useState(reasons.partial.join("\n"));
  const [n, setN] = useState(reasons.not_done.join("\n"));
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveReportChoicesAction({ generalChips: lines(g), reasons: { partial: lines(p), not_done: lines(n) } });
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label className="block"><span className="label">ชิปทั่วไป (ทุกหัวข้อ)</span><textarea className="input" rows={5} value={g} onChange={(e) => setG(e.target.value)} /></label>
        <label className="block"><span className="label">เหตุผล &quot;ทำได้บางส่วน&quot;</span><textarea className="input" rows={5} value={p} onChange={(e) => setP(e.target.value)} /></label>
        <label className="block"><span className="label">เหตุผล &quot;ไม่ได้ทำ&quot;</span><textarea className="input" rows={5} value={n} onChange={(e) => setN(e.target.value)} /></label>
      </div>
      <p className="hint">1 บรรทัด = 1 รายการ · ชิป &quot;มีเหตุการณ์ต้องแจ้งเวร&quot; และเหตุผล &quot;อื่นๆ (พิมพ์เอง)&quot; มีให้เสมอ</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className="btn-primary" disabled={pending} onClick={save}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button>
    </div>
  );
}
