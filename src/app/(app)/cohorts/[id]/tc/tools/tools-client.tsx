"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { createRecordAction, closeRecordAction, deleteRecordAction, suggestToolAction } from "./actions";

type Opt = { value: string; label: string };
type Kind = "tool" | "cardinal" | "violation" | "reward";
const KIND_LABEL: Record<Kind, string> = { tool: "เครื่องมือบ้าน", cardinal: "ละเมิดกฎ 5 ข้อใหญ่", violation: "ความผิดวินัย", reward: "รางวัล/สิทธิพิเศษ" };
const TIMED: Record<string, number> = { shot_down: 3, le: 3 };
const plusDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** ฟอร์มบันทึก 1 งานหลักต่อครั้ง: เลือกประเภท → สมาชิก → รายการ → พฤติกรรม (ช่องเฉพาะของแต่ละเครื่องมือขึ้นเมื่อเลือก) */
export function RecordForm({ cohortId, today, members, options, topics, prefill }: {
  cohortId: number; today: string; members: Opt[]; options: Record<Kind, Opt[]>; topics: Opt[];
  prefill?: { enrollmentId: number; behavior: string; topic: string | null; noteId: number; date: string } | null;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind>(prefill ? "tool" : "tool");
  const [enrollmentId, setEnrollmentId] = useState(prefill ? String(prefill.enrollmentId) : "");
  const [code, setCode] = useState("");
  const [date, setDate] = useState(prefill?.date ?? today);
  const [behavior, setBehavior] = useState(prefill?.behavior ?? "");
  const [topic, setTopic] = useState(prefill?.topic ?? "");
  const [level, setLevel] = useState("minor");
  const [observer, setObserver] = useState("");
  const [endDate, setEndDate] = useState("");
  const [requester, setRequester] = useState("");
  const [when, setWhen] = useState("");
  const [advisers, setAdvisers] = useState(["", "", "", ""]);
  const [hint, setHint] = useState<{ code: string; repeat: number } | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  // แนะนำเครื่องมือขั้นถัดไปเมื่อเลือกสมาชิก + เรื่อง (ผิดซ้ำเรื่องเดิม)
  useEffect(() => {
    if (kind !== "tool" || !enrollmentId || !topic) { setHint(null); return; }
    let live = true;
    suggestToolAction(cohortId, Number(enrollmentId), topic).then((r) => { if (live && r.ok) setHint(r.data!); });
    return () => { live = false; };
  }, [cohortId, kind, enrollmentId, topic]);

  const timed = kind === "tool" && code in TIMED;
  const hair = kind === "tool" && code === "hair_cut";
  const save = () => start(async () => {
    const r = await createRecordAction(cohortId, {
      enrollmentId: Number(enrollmentId), kind, code, recordDate: date, behavior, topic: kind === "reward" ? null : topic || null, level: kind === "violation" ? level : null,
      observer: kind === "tool" ? observer : null, startDate: timed ? date : null, endDate: timed ? endDate || plusDays(date, TIMED[code]) : null,
      haircut: hair ? { requester, when, advisers: advisers.filter((a) => a.trim()) } : null, sourceNoteId: prefill?.noteId ?? null,
    });
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: "ok", text: "บันทึกแล้ว" });
    setBehavior(""); setCode(""); setObserver(""); setRequester(""); setWhen(""); setAdvisers(["", "", "", ""]); setEndDate("");
    router.replace(`/cohorts/${cohortId}/tc/tools`);
    router.refresh();
  });
  const hintLabel = hint ? options.tool.find((o) => o.value === hint.code)?.label ?? hint.code : null;

  return (
    <div className="space-y-4">
      {prefill && <Alert tone="info">สร้างจากบันทึกพฤติกรรมวันที่ {prefill.date}</Alert>}
      <div role="radiogroup" aria-label="ประเภทรายการ" className="flex flex-wrap gap-2">
        {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => { setKind(k); setCode(""); }} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${kind === k ? (k === "cardinal" ? "bg-danger text-white" : "bg-ink text-white") : "border border-line bg-white hover:bg-lime-soft"}`}>{KIND_LABEL[k]}</button>
        ))}
      </div>
      {kind === "cardinal" && <Alert tone="danger">การละเมิดกฎ 5 ข้อใหญ่จะแจ้งผู้ดูแลระบบทันทีเมื่อบันทึก</Alert>}
      <div className="grid gap-3 sm:grid-cols-6">
        <label className="sm:col-span-3"><span className="label">สมาชิก <span className="text-danger">*</span></span>
          <select className="input" value={enrollmentId} onChange={(e) => setEnrollmentId(e.target.value)}><option value="">— เลือก —</option>{members.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}</select>
        </label>
        <div className="sm:col-span-3"><span className="label">วันที่</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
        {kind !== "reward" && (
          <label className="sm:col-span-3"><span className="label">เรื่อง</span>
            <select className="input" value={topic} onChange={(e) => setTopic(e.target.value)}><option value="">— ไม่ระบุ —</option>{topics.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select>
          </label>
        )}
        <label className="sm:col-span-3"><span className="label">{kind === "tool" ? "เครื่องมือ" : kind === "cardinal" ? "กฎที่ละเมิด" : kind === "violation" ? "ประเภทความผิด" : "รางวัล/สิทธิพิเศษ"} <span className="text-danger">*</span></span>
          <select className="input" value={code} onChange={(e) => setCode(e.target.value)}><option value="">— เลือก —</option>{options[kind].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          {kind === "tool" && hint && hintLabel && <span className="hint">{hint.repeat > 0 ? `เคยใช้เครื่องมือกับเรื่องนี้ ${hint.repeat} ครั้ง · ` : ""}ขั้นที่แนะนำ: <button type="button" className="font-semibold underline" onClick={() => setCode(hint.code)}>{hintLabel}</button></span>}
        </label>
        {kind === "violation" && (
          <label className="sm:col-span-3"><span className="label">ระดับ</span>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value)}><option value="minor">เล็กน้อย</option><option value="moderate">ปานกลาง</option><option value="serious">ร้ายแรง</option></select>
          </label>
        )}
        <label className="sm:col-span-6"><span className="label">{kind === "reward" ? "เหตุที่ให้" : "พฤติกรรมที่พบ"} <span className="text-danger">*</span></span><textarea className="input" rows={2} maxLength={2000} value={behavior} onChange={(e) => setBehavior(e.target.value)} /></label>
        {kind === "tool" && <label className="sm:col-span-3"><span className="label">ผู้สังเกตการณ์</span><input className="input" maxLength={200} value={observer} onChange={(e) => setObserver(e.target.value)} /></label>}
        {timed && <div className="sm:col-span-3"><span className="label">วันครบกำหนดปลด</span><ThaiDateInput value={endDate || plusDays(date, TIMED[code])} onChange={setEndDate} /></div>}
        {hair && (
          <fieldset className="space-y-3 rounded-2xl border border-line p-3 sm:col-span-6">
            <legend className="px-1 font-semibold">ใบร้องขอ Hair cut</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label><span className="label">ผู้ขอ <span className="text-danger">*</span></span><input className="input" maxLength={100} value={requester} onChange={(e) => setRequester(e.target.value)} /></label>
              <label><span className="label">เกิดขึ้นเมื่อใด</span><input className="input" maxLength={200} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
            </div>
            <div className="grid gap-3 sm:grid-cols-4">
              {advisers.map((a, i) => <label key={i}><span className="label">ผู้ให้คำแนะนำ {i + 1}{i < 3 && <span className="text-danger"> *</span>}</span><input className="input" maxLength={100} value={a} onChange={(e) => setAdvisers(advisers.map((x, j) => (j === i ? e.target.value : x)))} /></label>)}
            </div>
          </fieldset>
        )}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className="btn-primary" disabled={pending || !enrollmentId || !code || behavior.trim().length < 3} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>
    </div>
  );
}

/** ปุ่มปลดเครื่องมือ / ปิดเรื่อง พร้อมผลลัพธ์ และปุ่มลบรายการที่บันทึกผิด */
export function RowActions({ cohortId, id, open, today, closeLabel }: { cohortId: number; id: number; open: boolean; today: string; closeLabel: string }) {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [date, setDate] = useState(today);
  const [outcome, setOutcome] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-1">
        {open && <button type="button" className="btn-secondary btn-sm" onClick={() => setShow(!show)}>{closeLabel}</button>}
        <button type="button" className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { const reason = window.prompt("เหตุผลที่ลบรายการนี้"); if (!reason) return; start(async () => { const r = await deleteRecordAction(cohortId, id, reason); if (!r.ok) setErr(r.error); else router.refresh(); }); }}>ลบ</button>
      </div>
      {show && (
        <div className="space-y-2 rounded-xl bg-cream p-2 text-left">
          <ThaiDateInput value={date} onChange={setDate} max={today} />
          <input className="input" placeholder="ผลลัพธ์" aria-label="ผลลัพธ์" maxLength={1000} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
          <button type="button" className="btn-primary btn-sm" disabled={pending || outcome.trim().length < 3} onClick={() => start(async () => { const r = await closeRecordAction(cohortId, id, { date, outcome }); if (!r.ok) setErr(r.error); else { setShow(false); router.refresh(); } })}>ยืนยัน</button>
        </div>
      )}
      {err && <p className="text-sm text-danger">{err}</p>}
    </div>
  );
}
