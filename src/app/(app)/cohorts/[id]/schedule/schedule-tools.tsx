"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Replace, GripVertical } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { formatThaiDate } from "@/lib/thai-date";
import { addSessionAction, replaceStaffAction, updateSessionAction, setDutyAction } from "./actions";
import type { TopicOpt } from "./schedule-client";

type PersonOpt = { key: string; label: string; userId: number | null; instructorId: number | null };

/** เพิ่มคาบในรุ่น */
export function AddSessionButton({ cohortId, topics, locations, defaultDate }: { cohortId: number; topics: TopicOpt[]; locations: string[]; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date: defaultDate, startTime: "09:00", endTime: "11:00", hours: "2", topicId: "", title: "", location: locations[0] ?? "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pickTopic = (id: string) => {
    const t = topics.find((x) => String(x.id) === id);
    setF({ ...f, topicId: id, hours: t?.standardHours ? String(t.standardHours) : f.hours });
  };
  return (
    <>
      <button className="btn-secondary" onClick={() => { setOpen(true); setMsg(null); }}><Plus size={20} aria-hidden /> เพิ่มคาบ</button>
      <Modal open={open} onClose={() => setOpen(false)} title="เพิ่มคาบในตาราง">
        {open && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div><span className="label">วันที่</span><ThaiDateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
              <label><span className="label">หัวข้อ (จากคลังหัวข้อ)</span><select className="input" value={f.topicId} onChange={(e) => pickTopic(e.target.value)}><option value="">— กิจกรรมอื่น (พิมพ์ชื่อ) —</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              {!f.topicId && <label className="sm:col-span-2"><span className="label">ชื่อกิจกรรม</span><input className="input" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></label>}
              <label><span className="label">เริ่ม</span><input className="input" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
              <label><span className="label">สิ้นสุด</span><input className="input" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
              <label><span className="label">ชั่วโมงที่นับ</span><input className="input" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
              <label><span className="label">สถานที่</span><input className="input" list="add-loc" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /><datalist id="add-loc">{locations.map((l) => <option key={l} value={l} />)}</datalist></label>
            </div>
            {msg && <Alert tone="danger">{msg}</Alert>}
            <button className="btn-primary" disabled={pending} onClick={() => start(async () => {
              const r = await addSessionAction(cohortId, { date: f.date, startTime: f.startTime, endTime: f.endTime, hours: Number(f.hours), topicId: f.topicId ? Number(f.topicId) : null, title: f.title || undefined, location: f.location || null });
              if (!r.ok) return setMsg(r.error);
              setOpen(false); router.refresh();
            })}>เพิ่มคาบ</button>
          </div>
        )}
      </Modal>
    </>
  );
}

/** "เปลี่ยน ก. เป็น ข. ทุกคาบตั้งแต่ ... ถึง ..." (สเปก 11.4) */
export function ReplaceStaffButton({ cohortId, people, dateFrom, dateTo }: { cohortId: number; people: PersonOpt[]; dateFrom: string; dateTo: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ from: "", to: "", dateFrom, dateTo, scope: "cohort" as "cohort" | "all" });
  const [result, setResult] = useState<{ tone: "ok" | "danger" | "warn"; text: string; lines: string[] } | null>(null);
  const [pending, start] = useTransition();
  const person = (k: string) => { const p = people.find((x) => x.key === k); return p ? { userId: p.userId, instructorId: p.instructorId } : {}; };
  return (
    <>
      <button className="btn-ghost" onClick={() => { setOpen(true); setResult(null); }}><Replace size={20} aria-hidden /> เปลี่ยนวิทยากรเป็นช่วง</button>
      <Modal open={open} onClose={() => setOpen(false)} title="เปลี่ยนวิทยากรเป็นช่วงวันที่">
        {open && (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">เปลี่ยนจาก</span><select className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })}><option value="">— เลือก —</option>{people.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
              <label><span className="label">เป็น</span><select className="input" value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })}><option value="">— เลือก —</option>{people.filter((p) => p.key !== f.from).map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}</select></label>
              <div><span className="label">ตั้งแต่</span><ThaiDateInput value={f.dateFrom} onChange={(v) => setF({ ...f, dateFrom: v })} /></div>
              <div><span className="label">ถึง</span><ThaiDateInput value={f.dateTo} onChange={(v) => setF({ ...f, dateTo: v })} /></div>
              <label className="sm:col-span-2"><span className="label">ขอบเขต</span><select className="input" value={f.scope} onChange={(e) => setF({ ...f, scope: e.target.value as "cohort" })}><option value="cohort">เฉพาะรุ่นนี้</option><option value="all">ทุกรุ่นทุกหลักสูตร</option></select></label>
            </div>
            <p className="hint">ไม่เปลี่ยนคาบที่ล็อก ยกเลิก หรือรุ่นที่ปิดแล้ว</p>
            {result && <Alert tone={result.tone}><p>{result.text}</p>{result.lines.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm">{result.lines.slice(0, 10).map((l) => <li key={l}>{l}</li>)}</ul>}</Alert>}
            <button className="btn-primary" disabled={pending || !f.from || !f.to} onClick={() => start(async () => {
              const r = await replaceStaffAction({ from: person(f.from), to: person(f.to), dateFrom: f.dateFrom, dateTo: f.dateTo, cohortId: f.scope === "cohort" ? cohortId : null });
              if (!r.ok) return setResult({ tone: "danger", text: r.error, lines: [] });
              const d = r.data!;
              setResult({
                tone: d.conflicts.length || d.skipped.length ? "warn" : "ok",
                text: `เปลี่ยนแล้ว ${d.replaced} คาบ${d.skipped.length ? ` · ข้าม ${d.skipped.length} คาบ` : ""}${d.conflicts.length ? ` · คนใหม่สอนซ้อน ${d.conflicts.length} คาบ` : ""}`,
                lines: [...d.skipped.map((x) => `ข้าม: ${formatThaiDate(x.date)} ${x.title} — ${x.reason}`), ...d.conflicts.map((c) => `ซ้อน: ${c}`)],
              });
              router.refresh();
            })}>เปลี่ยน</button>
          </div>
        )}
      </Modal>
    </>
  );
}

/** ปฏิทินรายสัปดาห์ — ลากการ์ดคาบไปวางวันอื่นเพื่อย้าย (คงเวลาเดิม) */
export function WeekBoard({ cohortId, days, cards, editable }: { cohortId: number; days: Array<{ date: string; label: string; isToday: boolean; inCohort: boolean }>; cards: Array<{ id: number; date: string; movable: boolean; node: React.ReactNode }>; editable: boolean }) {
  const router = useRouter();
  const [over, setOver] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const move = (id: number, date: string) => start(async () => {
    let r = await updateSessionAction(cohortId, id, { date });
    if (!r.ok && r.code === "conflict" && window.confirm(`${r.error}\n\nยืนยันการย้ายคาบ`)) r = await updateSessionAction(cohortId, id, { date }, true);
    setMsg(r.ok ? { tone: "ok", text: `ย้ายไป ${formatThaiDate(date)} แล้ว` } : { tone: "danger", text: r.error });
    router.refresh();
  });
  return (
    <div className="space-y-2">
      {editable && <p className="hint">ลากการ์ดคาบไปวางวันอื่นเพื่อย้าย หรือใช้ปุ่ม &quot;แก้คาบ / วิทยากร&quot;</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(180px, 1fr))`, overflowX: "auto" }}>
        {days.map((d) => (
          <section
            key={d.date}
            onDragOver={(e) => { if (editable && d.inCohort) { e.preventDefault(); setOver(d.date); } }}
            onDragLeave={() => setOver((o) => (o === d.date ? null : o))}
            onDrop={(e) => { e.preventDefault(); setOver(null); const id = Number(e.dataTransfer.getData("text/session")); const card = cards.find((c) => c.id === id); if (id && card && card.date !== d.date) move(id, d.date); }}
            className={`min-h-48 rounded-2xl border p-2 ${over === d.date ? "border-navy bg-lime-soft" : d.inCohort ? "border-line bg-white" : "border-dashed border-line bg-cream/50"} ${d.isToday ? "ring-2 ring-navy" : ""}`}
            aria-label={d.label}
          >
            <h3 className="mb-2 text-sm font-semibold">{d.label}</h3>
            <ul className="space-y-2">
              {cards.filter((c) => c.date === d.date).map((c) => (
                <li key={c.id} draggable={editable && c.movable && !pending} onDragStart={(e) => e.dataTransfer.setData("text/session", String(c.id))} className={`rounded-xl bg-cream p-2 text-sm ${editable && c.movable ? "cursor-grab" : ""}`}>
                  {editable && c.movable && <GripVertical size={14} className="float-right text-muted" aria-hidden />}
                  {c.node}
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/** ผู้รับผิดชอบประจำวัน (สเปก 22B) — เลือกจากเจ้าหน้าที่หลัก · ดูอย่างเดียวเมื่อไม่มีสิทธิ์ */
export function DutySelect({ cohortId, date, userId, people, editable, compact }: { cohortId: number; date: string; userId: number | null; people: Array<{ id: number; name: string }>; editable: boolean; compact?: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const name = people.find((p) => p.id === userId)?.name ?? "ยังไม่กำหนด";
  if (!editable) return <p className="text-sm">ผู้รับผิดชอบประจำวัน: <b>{name}</b></p>;
  return (
    <label className={`flex flex-wrap items-center gap-2 text-sm ${compact ? "" : "mt-1"}`}>
      <span>{compact ? formatThaiDate(date) : "ผู้รับผิดชอบประจำวัน"}</span>
      <select className="input min-h-11 w-auto py-1" value={userId ?? ""} disabled={pending} aria-label={`ผู้รับผิดชอบประจำวัน ${formatThaiDate(date)}`}
        onChange={(e) => start(async () => { setErr(null); const r = await setDutyAction(cohortId, date, Number(e.target.value)); if (!r.ok) setErr(r.error); router.refresh(); })}>
        {userId == null && <option value="">ยังไม่กำหนด</option>}
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </select>
      {err && <span className="text-danger">{err}</span>}
    </label>
  );
}