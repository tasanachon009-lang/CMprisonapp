"use client";

import { useCallback, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { clearDraft } from "@/app/(app)/drafts";
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
      <p className="hint">ผู้เข้าร่วม = เฉพาะคนที่ติดเหตุราชทัณฑ์ในคาบนี้ · วิทยากรเดิม (แก้ได้ที่ตาราง) · ค่าตอบแทนคาบชดเชยเป็นไปตามตั้งค่า</p>
      {err && <Alert tone="danger">{err}</Alert>}
      <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pending} onClick={submit}>{pending ? "กำลังสร้าง..." : "สร้างคาบชดเชย"}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button></div>
    </div>
  );
}

type StaffRow = { id: number; name: string; external: boolean; didTeach: boolean; actualHours: number | null };
type Report = { outcome: "planned" | "partial" | "not_done"; reason: string; participation: string; summary: string; issues: string };

const OUTCOMES: Array<[Report["outcome"], string]> = [["planned", "ตามแผน"], ["partial", "บางส่วน"], ["not_done", "ไม่ได้ทำ"]];
const PARTICIPATION: Array<[string, string]> = [["excellent", "ดีมาก"], ["good", "ดี"], ["fair", "พอใช้"], ["needs_improvement", "ควรปรับปรุง"]];

/**
 * หน้า "คาบของฉัน" (สเปก 22B): เช็คชื่อ + ผลกิจกรรม + สอนจริง → ปุ่ม "บันทึกและปิดคาบ" ปุ่มเดียว (≤ 30 วินาที)
 */
export function SessionCloseForm({ sessionId, attendance, staff, hours, initial, started, closed, proxyHint }: {
  sessionId: number;
  attendance: { rows: Row[]; loadedVersion: number; canNote: boolean } | null;
  staff: StaffRow[]; hours: number; initial: Report | null; started: boolean; closed: boolean; proxyHint: boolean;
}) {
  const router = useRouter();
  const att = useRef<{ rows: Row[]; version: number } | null>(null);
  const onRowsChange = useCallback((rows: Row[], version: number) => { att.current = { rows, version }; }, []);
  const [r, setR] = useState<Report>(initial ?? { outcome: "planned", reason: "", participation: "good", summary: "", issues: "" });
  const [st, setSt] = useState(staff);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () => start(async () => {
    setMsg(null);
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
      outcome: r.outcome, reason: r.reason || null, participation: (r.participation || null) as never, summary: r.summary || null, issues: r.issues || null,
      staff: st.map((x) => ({ staffId: x.id, didTeach: x.didTeach, actualHours: x.actualHours })),
    });
    if (!res.ok) return setMsg({ tone: "danger", text: res.error });
    setMsg({ tone: "ok", text: res.message ?? "บันทึกแล้ว" });
    router.refresh();
  });

  return (
    <div className="space-y-6 pb-28">
      {attendance && (
        <section>
          <h2 className="mb-2 text-xl">1. เช็คชื่อ</h2>
          <AttendanceForm sessionId={sessionId} rows={attendance.rows} loadedVersion={attendance.loadedVersion} readOnly={false} canNote={attendance.canNote} embedded onRowsChange={onRowsChange} />
        </section>
      )}

      <section className="card space-y-4">
        <h2 className="text-xl">{attendance ? "2. " : ""}ผลกิจกรรม</h2>
        {!started && <Alert tone="info">ยังไม่ถึงเวลาเริ่มคาบ — เช็คชื่อและบันทึกผลได้ตั้งแต่เวลาเริ่มของวันสอน</Alert>}
        {proxyHint && <Alert tone="info">คุณไม่ได้อยู่ในรายชื่อผู้สอน — บันทึกครั้งนี้จะเป็น &quot;บันทึกแทนผู้สอน&quot; (ระบบเก็บผู้สอนและผู้บันทึกแยกกัน)</Alert>}
        <div>
          <span className="label">ทำกิจกรรมได้</span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ผลการทำกิจกรรม">
            {OUTCOMES.map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={r.outcome === v} onClick={() => setR({ ...r, outcome: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${r.outcome === v ? (v === "not_done" ? "border-danger bg-danger text-white" : "border-ink bg-ink text-white") : "border-line bg-white"}`}>{l}</button>
            ))}
          </div>
        </div>
        {r.outcome !== "planned" && (
          <label className="block"><span className="label">เหตุผล (จำเป็น)</span><input className="input" value={r.reason} onChange={(e) => setR({ ...r, reason: e.target.value })} placeholder={r.outcome === "not_done" ? "เช่น เรือนจำงดกิจกรรม / วิทยากรไม่มา" : "เช่น เวลาไม่พอ"} /></label>
        )}
        {r.outcome !== "not_done" && (
          <>
            <div>
              <span className="label">การมีส่วนร่วมของผู้เข้าอบรม</span>
              <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="การมีส่วนร่วม">
                {PARTICIPATION.map(([v, l]) => (
                  <button key={v} type="button" role="radio" aria-checked={r.participation === v} onClick={() => setR({ ...r, participation: v })} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${r.participation === v ? "border-navy bg-navy text-white" : "border-line bg-white"}`}>{l}</button>
                ))}
              </div>
            </div>
            <label className="block"><span className="label">สรุป 1–2 บรรทัด</span><textarea className="input" rows={2} maxLength={500} value={r.summary} onChange={(e) => setR({ ...r, summary: e.target.value })} /></label>
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
            <p className="hint">เปลี่ยนตัวผู้สอน: แก้ที่ตารางของรุ่น (ปุ่ม &quot;แก้คาบ / วิทยากร&quot;) — ค่าตอบแทนคิดจากการสอนจริงนี้</p>
          </div>
        )}
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
