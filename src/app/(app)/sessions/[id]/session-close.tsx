"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Mic, MicOff } from "lucide-react";
import { Alert } from "@/components/ui";
import { clearDraft } from "@/app/(app)/drafts";
import { composeSummary, PARTICIPATION_FACE, SHIFT_CHIP } from "@/lib/session-report-text";
import { AttendanceForm, type Row } from "./attendance-form";
import { saveAttendanceAction, saveSessionReportAction, createMakeupAction } from "../actions";

/** สร้างคาบชดเชยให้ผู้ติดเหตุราชทัณฑ์ (สเปก 9) — ผูกกับคาบเดิม วิทยากรเดิม */
export function MakeupButton({ sessionId, date, startTime, endTime, hours, location }: { sessionId: number; date: string; startTime: string; endTime: string; hours: number; location: string | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ date, startTime, endTime, hours: String(hours), location: location ?? "" });
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!open) return <button type="button" className="btn-secondary btn-sm" onClick={() => setOpen(true)}>สร้างคาบชดเชย</button>;
  const submit = () => start(async () => {
    setErr(null);
    const r = await createMakeupAction(sessionId, { date: f.date, startTime: f.startTime, endTime: f.endTime, hours: Number(f.hours), location: f.location || null });
    if (!r.ok) return setErr(r.error);
    router.push(`/sessions/${r.data!.id}`);
  });
  return (
    <div className="mt-2 space-y-2 rounded-2xl border border-line bg-white p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">วันที่</span><input type="date" className="input w-auto" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span className="label">เริ่ม</span><input type="time" className="input w-auto" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
        <label><span className="label">สิ้นสุด</span><input type="time" className="input w-auto" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
        <label><span className="label">ชั่วโมง</span><input className="input w-20" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
        <label><span className="label">สถานที่</span><input className="input w-auto" value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /></label>
      </div>
      <p className="hint">ผู้เข้าร่วม = ผู้ที่ติดเหตุราชทัณฑ์ในคาบนี้</p>
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pending} onClick={submit}>{pending ? "กำลังสร้าง..." : "สร้างคาบชดเชย"}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button></div>
    </div>
  );
}

type StaffRow = { id: number; name: string; external: boolean; didTeach: boolean; actualHours: number | null };
type Outcome = "planned" | "partial" | "not_done";
type Report = { outcome: Outcome; reason: string; participation: string; summary: string; issues: string; chips: string[]; source: "direct" | "paper_copy" };

const OUTCOMES: Array<[Outcome, string, string]> = [["planned", "✅", "ตามแผน"], ["partial", "◐", "บางส่วน"], ["not_done", "✕", "ไม่ได้ทำ"]];
const PARTICIPATION: Array<[string, string]> = [["excellent", "ดีมาก"], ["good", "ดี"], ["fair", "พอใช้"], ["needs_improvement", "ควรปรับปรุง"]];
const OTHER = "__other";

/**
 * พิมพ์ด้วยเสียง — เฉพาะเบราว์เซอร์ที่รู้จำเสียงในเครื่องได้ (processLocally) เท่านั้น
 * ไม่ใช้บริการรู้จำเสียงบนอินเทอร์เน็ต (เครือข่ายเรือนจำออกได้เฉพาะ api.line.me และเสียงอาจมีข้อมูลผู้ต้องขัง)
 */
type LocalRecognition = { lang: string; continuous: boolean; interimResults: boolean; processLocally?: boolean; start(): void; stop(): void; onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> & { length: number } }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecognitionCtor = { new (): LocalRecognition; available?: (o: { langs: string[]; processLocally: boolean }) => Promise<string> };
function useLocalDictation(onText: (t: string) => void) {
  const [supported, setSupported] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<LocalRecognition | null>(null);
  useEffect(() => {
    const Ctor = (globalThis as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition;
    if (!Ctor?.available) return;
    Ctor.available({ langs: ["th-TH"], processLocally: true }).then((s) => setSupported(s === "available"), () => setSupported(false));
  }, []);
  const toggle = () => {
    if (on) { rec.current?.stop(); return; }
    const Ctor = (globalThis as unknown as { SpeechRecognition?: RecognitionCtor }).SpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = "th-TH"; r.continuous = true; r.interimResults = false; r.processLocally = true;
    r.onresult = (e) => { const last = e.results[e.results.length - 1]; if (last?.[0]) onText(last[0].transcript); };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return { supported, on, toggle };
}

/**
 * หน้า "คาบของฉัน" (สเปก 22B): เช็คชื่อ + ผลกิจกรรม 3 ขั้น (กดอย่างเดียวได้ ≤ 1 นาที) + สอนจริง → ปุ่มเดียว "บันทึกและปิดคาบ"
 */
export function SessionCloseForm({ sessionId, attendance, staff, hours, initial, started, closed, proxyHint, hasExternal, chips, reasons, canShift }: {
  sessionId: number;
  attendance: { rows: Row[]; loadedVersion: number; canNote: boolean } | null;
  staff: StaffRow[]; hours: number; initial: Report | null; started: boolean; closed: boolean; proxyHint: boolean; hasExternal: boolean;
  chips: { topic: string[]; general: string[]; draft: boolean };
  reasons: { partial: string[]; not_done: string[] };
  canShift: boolean;
}) {
  const router = useRouter();
  const att = useRef<{ rows: Row[]; version: number } | null>(null);
  const onRowsChange = useCallback((rows: Row[], version: number) => { att.current = { rows, version }; }, []);
  const [r, setR] = useState<Report>(initial ?? { outcome: "planned", reason: "", participation: "", summary: "", issues: "", chips: [], source: "direct" });
  // เหตุผล: เลือกจากรายการ หรือ "อื่นๆ" พิมพ์เอง
  const presetOf = (o: Outcome) => (o === "partial" ? reasons.partial : o === "not_done" ? reasons.not_done : []);
  const [reasonPick, setReasonPick] = useState(() => (initial?.reason ? (presetOf(initial.outcome).includes(initial.reason) ? initial.reason : OTHER) : ""));
  const [reasonOther, setReasonOther] = useState(() => (initial?.reason && !presetOf(initial.outcome).includes(initial.reason) ? initial.reason : ""));
  // สรุปประกอบจากชิปอัตโนมัติ จนกว่าผู้บันทึกจะแก้เอง
  const [touched, setTouched] = useState(!!initial?.summary && initial.summary !== composeSummary(initial.outcome, initial.chips, initial.participation));
  const [st, setSt] = useState(staff);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dictation = useLocalDictation((t) => { setTouched(true); setR((x) => ({ ...x, summary: `${x.summary}${x.summary ? " " : ""}${t}`.slice(0, 500) })); });

  const update = (patch: Partial<Report>) => setR((x) => {
    const next = { ...x, ...patch };
    return touched ? next : { ...next, summary: composeSummary(next.outcome, next.chips, next.participation) };
  });
  const toggleChip = (c: string) => update({ chips: r.chips.includes(c) ? r.chips.filter((x) => x !== c) : [...r.chips, c] });
  const reason = reasonPick === OTHER ? reasonOther.trim() : reasonPick;

  const save = () => start(async () => {
    setMsg(null);
    if (r.outcome !== "planned" && !reason) return setMsg({ tone: "danger", text: r.outcome === "not_done" ? "เลือกเหตุผลที่ไม่ได้ทำกิจกรรม (หรือ \"อื่นๆ\" แล้วพิมพ์)" : "เลือกเหตุผลที่ทำได้บางส่วน (หรือ \"อื่นๆ\" แล้วพิมพ์)" });
    // 1) เช็คชื่อ (ถ้ามี)
    if (attendance && att.current && r.outcome !== "not_done") {
      const rows = att.current.rows;
      const missing = rows.find((x) => x.status === "corrections" && !x.correctionsType);
      if (missing) return setMsg({ tone: "danger", text: `กรุณาระบุประเภทเหตุราชทัณฑ์ของ ${missing.name}` });
      const noReason = rows.find((x) => x.status === "corrections" && x.correctionsType === "other" && !x.note?.trim());
      if (noReason) return setMsg({ tone: "danger", text: `"เบิกตัวอื่นๆ" ต้องระบุเหตุในหมายเหตุ — ${noReason.name}` });
      const a = await saveAttendanceAction(sessionId, rows.map((x) => ({ enrollmentId: x.enrollmentId, status: x.status, correctionsType: x.correctionsType, note: x.note })), att.current.version);
      if (!a.ok) return setMsg({ tone: "danger", text: `เช็คชื่อ: ${a.error}` });
      void clearDraft(`attendance:${sessionId}`);
    }
    // 2) ผลกิจกรรม + สอนจริง → ปิดคาบ
    const res = await saveSessionReportAction(sessionId, {
      outcome: r.outcome, reason: reason || null, participation: (r.participation || null) as never, summary: r.summary || null, issues: r.issues || null,
      staff: st.map((x) => ({ staffId: x.id, didTeach: x.didTeach, actualHours: x.actualHours })), chips: r.chips, source: r.source,
    });
    if (!res.ok) return setMsg({ tone: "danger", text: res.error });
    // ชิป "มีเหตุการณ์ต้องแจ้งเวร" → เปิดกล่องจดหมายเวรพร้อมเติมรุ่น/คาบ
    if (r.chips.includes(SHIFT_CHIP) && canShift) return router.push(`/inbox?session=${sessionId}`);
    setMsg({ tone: "ok", text: res.message ?? "บันทึกแล้ว" });
    router.refresh();
  });

  const chipBtn = (c: string, special = false) => {
    const on = r.chips.includes(c);
    return (
      <button key={c} type="button" aria-pressed={on} onClick={() => toggleChip(c)}
        className={`min-h-11 rounded-full border px-3 text-left text-sm font-medium ${on ? (special ? "border-danger bg-danger text-white" : "border-navy bg-navy text-white") : special ? "border-danger/50 bg-white text-danger" : "border-line bg-white hover:bg-lime-soft"}`}>
        {on ? "✓ " : ""}{c}
      </button>
    );
  };

  return (
    <div className="space-y-6 pb-28">
      {attendance && (
        <section>
          <h2 className="mb-2 text-xl">เช็คชื่อ</h2>
          <AttendanceForm sessionId={sessionId} rows={attendance.rows} loadedVersion={attendance.loadedVersion} readOnly={false} canNote={attendance.canNote} embedded onRowsChange={onRowsChange} />
        </section>
      )}

      <section className="card space-y-5">
        <h2 className="text-xl">ผลกิจกรรม</h2>
        {!started && <Alert tone="info">ยังไม่ถึงเวลาเริ่มคาบ</Alert>}
        {proxyHint && <Alert tone="info">ผู้บันทึกไม่อยู่ในรายชื่อผู้สอน รายการนี้จะบันทึกเป็น &quot;บันทึกแทนผู้สอน&quot;</Alert>}

        <div>
          <p className="label">1. ดำเนินการ</p>
          <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="ผลการทำกิจกรรม">
            {OUTCOMES.map(([v, icon, l]) => (
              <button key={v} type="button" role="radio" aria-checked={r.outcome === v} onClick={() => { update({ outcome: v }); setReasonPick(""); setReasonOther(""); }}
                className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 text-lg font-semibold ${r.outcome === v ? (v === "not_done" ? "border-danger bg-danger text-white" : v === "partial" ? "border-warn-bg bg-warn-bg text-ink" : "border-ok bg-ok text-white") : "border-line bg-white"}`}>
                <span aria-hidden className="text-2xl leading-none">{icon}</span>{l}
              </button>
            ))}
          </div>
          {r.outcome !== "planned" && (
            <div className="mt-3">
              <p className="label">เหตุผล</p>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="เหตุผล">
                {[...presetOf(r.outcome), OTHER].map((x) => (
                  <button key={x} type="button" role="radio" aria-checked={reasonPick === x} onClick={() => setReasonPick(x)}
                    className={`min-h-11 rounded-full border px-3 text-sm font-medium ${reasonPick === x ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{x === OTHER ? "อื่นๆ (พิมพ์เอง)" : x}</button>
                ))}
              </div>
              {reasonPick === OTHER && <input className="input mt-2" value={reasonOther} maxLength={300} onChange={(e) => setReasonOther(e.target.value)} placeholder="พิมพ์เหตุผล" aria-label="เหตุผลอื่นๆ" />}
            </div>
          )}
        </div>

        {r.outcome !== "not_done" && (
          <>
            <div>
              <p className="label">2. การมีส่วนร่วม</p>
              <div className="grid grid-cols-4 gap-2" role="radiogroup" aria-label="การมีส่วนร่วม">
                {PARTICIPATION.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={r.participation === v} onClick={() => update({ participation: r.participation === v ? "" : v })}
                    className={`flex min-h-16 flex-col items-center justify-center rounded-2xl border-2 text-sm font-semibold ${r.participation === v ? "border-navy bg-navy/10" : "border-line bg-white"}`}>
                    <span aria-hidden className="text-3xl leading-none">{PARTICIPATION_FACE[v]}</span>{l}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="label">3. สิ่งที่ได้ (กดเลือก ไม่ต้องพิมพ์ — เลือกได้หลายอัน)</p>
              {chips.topic.length > 0 && <div className="flex flex-wrap gap-2">{chips.topic.map((c) => chipBtn(c))}</div>}
              <div className="mt-2 flex flex-wrap gap-2">{chips.general.map((c) => chipBtn(c))}{chipBtn(SHIFT_CHIP, true)}</div>
              {r.chips.includes(SHIFT_CHIP) && <p className="hint mt-1">{canShift ? "ระบบจะเปิดกล่องจดหมายเวรหลังบันทึก" : "กรุณาแจ้งเจ้าหน้าที่หลักเพื่อบันทึกในกล่องจดหมายเวร"}</p>}
            </div>

            <label className="block">
              <span className="label flex items-center gap-2">สรุป (ระบบประกอบจากที่เลือกให้ — แก้ได้ ไม่บังคับ)
                {dictation.supported && (
                  <button type="button" onClick={dictation.toggle} className={`inline-flex min-h-11 min-w-11 items-center justify-center rounded-full border ${dictation.on ? "border-danger bg-danger text-white" : "border-line bg-white"}`} aria-label={dictation.on ? "หยุดพิมพ์ด้วยเสียง" : "พิมพ์ด้วยเสียง"}>
                    {dictation.on ? <MicOff size={18} /> : <Mic size={18} />}
                  </button>
                )}
              </span>
              <textarea className="input" rows={2} maxLength={500} value={r.summary} onChange={(e) => { setTouched(true); setR({ ...r, summary: e.target.value }); }} />
            </label>
            {touched && <button type="button" className="btn-ghost btn-sm" onClick={() => { setTouched(false); setR({ ...r, summary: composeSummary(r.outcome, r.chips, r.participation) }); }}>ประกอบสรุปจากที่เลือกใหม่</button>}
            <label className="block"><span className="label">ปัญหา / ข้อเสนอแนะ (ถ้ามี)</span><textarea className="input" rows={2} maxLength={1000} value={r.issues} onChange={(e) => setR({ ...r, issues: e.target.value })} /></label>
          </>
        )}

        {r.outcome !== "not_done" && st.length > 0 && (
          <div>
            <span className="label">สอนจริง (ไม่แก้ = สอนตามตาราง {hours} ชม.)</span>
            <ul className="space-y-2">
              {st.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-cream px-3 py-2">
                  <span className="font-medium">{x.name}</span>
                  <span className={x.external ? "tag-orange" : "tag-navy"}>{x.external ? "ภายนอก" : "ภายใน"}</span>
                  <label className="ml-auto flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={x.didTeach} onChange={(e) => setSt(st.map((y) => (y.id === x.id ? { ...y, didTeach: e.target.checked } : y)))} /> สอนจริง</label>
                  {x.didTeach && (
                    <label className="flex items-center gap-1 text-sm">ชั่วโมง
                      <input className="input min-h-11 w-20 py-1" inputMode="decimal" value={x.actualHours ?? hours} onChange={(e) => setSt(st.map((y) => (y.id === x.id ? { ...y, actualHours: Number(e.target.value) || null } : y)))} aria-label={`ชั่วโมงสอนจริงของ ${x.name}`} />
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <p className="hint">เปลี่ยนตัวผู้สอนได้ที่ตารางของรุ่น</p>
          </div>
        )}
        {hasExternal && (
          <label className="flex min-h-11 items-center gap-2">
            <input type="checkbox" className="h-5 w-5" checked={r.source === "paper_copy"} onChange={(e) => setR({ ...r, source: e.target.checked ? "paper_copy" : "direct" })} />
            คัดลอกจากใบบันทึกของวิทยากร (เก็บใบที่วิทยากรเซ็นไว้ที่แฟ้ม)
          </label>
        )}
        {chips.draft && <p className="hint">ข้อความสำเร็จรูปของหัวข้อนี้ยังเป็นชุดร่าง</p>}
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      </section>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3">
          {closed && <span className="mr-auto tag-ok">ปิดคาบแล้ว — แก้แล้วกดบันทึกซ้ำได้</span>}
          <button className="btn-primary" disabled={pending || !started} onClick={save}><CheckCheck size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : closed ? "บันทึกการแก้ไข" : "บันทึกและปิดคาบ"}</button>
        </div>
      </div>
    </div>
  );
}
