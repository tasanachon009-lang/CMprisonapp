"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, GraduationCap } from "lucide-react";
import { Alert } from "@/components/ui";
import { Modal } from "@/components/modal";
import { ThaiDateInput } from "@/components/thai-date-input";
import { addMedicalNoteAction, setExternalIdAction, markTaskAction, recordFollowupAction, completeEnrollmentsAction, updateIntakeAction } from "../actions";
import { recordConsentAction } from "@/app/(app)/cohorts/actions";

export function MedicalNoteForm({ enrollmentId, today, canMedical }: { enrollmentId: number; today: string; canMedical: boolean }) {
  const router = useRouter();
  const blank = { noteDate: today, kind: (canMedical ? "medical" : "mental") as "medical" | "mental", screeningResult: "", opinion: "", recommendation: "", referral: false, referralDetail: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="mt-4 rounded-2xl border border-line p-3">
      <summary className="cursor-pointer font-semibold">+ เพิ่มความเห็น</summary>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div><span className="label">วันที่</span><ThaiDateInput value={f.noteDate} onChange={(v) => setF({ ...f, noteDate: v })} max={today} /></div>
        <label><span className="label">ด้าน</span>
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as "medical" | "mental" })}>
            {canMedical && <option value="medical">ด้านการแพทย์/สุขภาพกาย</option>}
            <option value="mental">ด้านจิตวิทยา/สุขภาพจิต</option>
          </select>
        </label>
        <label className="sm:col-span-2"><span className="label">ผลคัดกรอง/ประเมินสุขภาพ</span><textarea className="input" rows={2} value={f.screeningResult} onChange={(e) => setF({ ...f, screeningResult: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">ความเห็น</span><textarea className="input" rows={3} value={f.opinion} onChange={(e) => setF({ ...f, opinion: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">ข้อแนะนำ</span><textarea className="input" rows={2} value={f.recommendation} onChange={(e) => setF({ ...f, recommendation: e.target.value })} /></label>
        <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={f.referral} onChange={(e) => setF({ ...f, referral: e.target.checked })} /> ส่งต่อ</label>
        {f.referral && <label><span className="label">ส่งต่อไปที่/รายละเอียด</span><input className="input" value={f.referralDetail} onChange={(e) => setF({ ...f, referralDetail: e.target.value })} /></label>}
      </div>
      {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
      <button className="btn-primary mt-3" disabled={pending} onClick={() => start(async () => { const r = await addMedicalNoteAction(enrollmentId, f); if (!r.ok) return setError(r.error); setError(null); setF(blank); router.refresh(); })}>บันทึกความเห็น</button>
    </details>
  );
}

export function ExternalIdForm({ enrollmentId, system, current, canEdit }: { enrollmentId: number; system: "bst" | "rt101"; current: string; canEdit: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(current);
  const [pending, start] = useTransition();
  if (!canEdit) return <span className="text-sm text-muted">เลขในระบบ: {current || "-"}</span>;
  return (
    <span className="ml-auto flex items-center gap-1">
      <input className="input min-h-9 w-40 py-1 text-sm" placeholder="เลขประจำตัวในระบบ" value={v} onChange={(e) => setV(e.target.value)} aria-label="เลขประจำตัวในระบบภายนอก" />
      {v !== current && <button className="btn-secondary btn-sm" disabled={pending} onClick={() => start(async () => { await setExternalIdAction(enrollmentId, system, v); router.refresh(); })}>บันทึก</button>}
    </span>
  );
}

export function TaskToggle({ taskId, done, overdue, canEdit, label, doneLabel = "ลงแล้ว" }: { taskId: number; done: boolean; overdue: boolean; canEdit: boolean; label?: string; doneLabel?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (done) {
    return (
      <span className="flex items-center gap-1">
        <span className="tag-ok"><CheckCircle2 size={14} aria-hidden /> {label ?? "ลงแล้ว"}</span>
        {canEdit && <button className="text-xs text-muted underline" disabled={pending} onClick={() => start(async () => { await markTaskAction(taskId, false); router.refresh(); })}>ยกเลิก</button>}
      </span>
    );
  }
  return canEdit ? (
    <button className={overdue ? "btn-danger btn-sm" : "btn-secondary btn-sm"} disabled={pending} onClick={() => start(async () => { await markTaskAction(taskId, true); router.refresh(); })}>
      {overdue ? `เลยกำหนด — ${doneLabel}` : doneLabel}
    </button>
  ) : <span className={overdue ? "tag-danger" : "tag-warn"}>{overdue ? "เลยกำหนด" : "ยังไม่ลง"}</span>;
}

export function FollowupForm({ followupId, today }: { followupId: number; today: string }) {
  const router = useRouter();
  const [f, setF] = useState({ doneDate: today, method: "phone", urineResult: "", relapse: "", occupation: "", note: "", bstRecorded: true });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-sm font-semibold text-navy">บันทึกผลติดตาม</summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div><span className="label">วันที่</span><ThaiDateInput value={f.doneDate} onChange={(v) => setF({ ...f, doneDate: v })} max={today} /></div>
        <label><span className="label">วิธี</span><select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}><option value="phone">โทร</option><option value="visit">เยี่ยม</option><option value="referral">ส่งต่อ</option></select></label>
        <label><span className="label">ผลตรวจปัสสาวะ (ถ้ามี)</span><input className="input" value={f.urineResult} onChange={(e) => setF({ ...f, urineResult: e.target.value })} /></label>
        <div className="sm:col-span-3"><span className="label">กลับไปเสพซ้ำ</span>
          <div className="flex gap-2">{[["no", "ไม่ใช่"], ["yes", "ใช่"], ["unknown", "ไม่ทราบ"]].map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, relapse: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${f.relapse === v ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>)}</div>
        </div>
        <label><span className="label">อาชีพ</span><input className="input" value={f.occupation} onChange={(e) => setF({ ...f, occupation: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">หมายเหตุ</span><input className="input" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <label className="flex items-center gap-2 sm:col-span-3"><input type="checkbox" className="h-5 w-5" checked={f.bstRecorded} onChange={(e) => setF({ ...f, bstRecorded: e.target.checked })} /> ลง บสต. แล้ว (ติ๊กแล้วงาน บสต. ครั้งนี้จะเป็น &quot;ลงแล้ว&quot;)</label>
      </div>
      {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
      <button className="btn-primary btn-sm mt-2" disabled={pending} onClick={() => start(async () => {
        const r = await recordFollowupAction(followupId, { ...f, method: f.method as "phone", relapse: f.relapse as "no" });
        if (!r.ok) return setError(r.error);
        router.refresh();
      })}>บันทึกผลติดตาม</button>
    </details>
  );
}

type O = { code: string; label: string };
export function IntakePanel({ enrollmentId, score, exclusions, intake, gaps, criteria, consentSigned, consentDate, today, canEdit }: {
  enrollmentId: number; score: number | null; exclusions: string[];
  intake: { confirmations?: string[]; drugClass?: string | null; priorityFlags?: string[] }; gaps: string[];
  criteria: { screeningMin?: number; screeningMax?: number; screeningLabel?: string; exclusions?: O[]; confirmations?: Array<O & { required?: boolean }>; drugClassLabel?: string; drugClasses?: O[]; priorityFlags?: O[] } | null;
  consentSigned: boolean; consentDate: string | null; today: string; canEdit: boolean;
}) {
  const router = useRouter();
  const [s, setS] = useState(score?.toString() ?? "");
  const [ex, setEx] = useState(exclusions);
  const [conf, setConf] = useState(intake.confirmations ?? []);
  const [dc, setDc] = useState(intake.drugClass ?? "");
  const [pf, setPf] = useState(intake.priorityFlags ?? []);
  const toggle = (arr: string[], set: (v: string[]) => void, code: string, on: boolean) => set(on ? [...arr, code] : arr.filter((c) => c !== code));
  const [cDate, setCDate] = useState(today);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const n = s === "" ? null : Number(s);
  const out = n != null && criteria?.screeningMin != null && (n < criteria.screeningMin || n > (criteria.screeningMax ?? 999));
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div>
        <h3 className="font-semibold">เกณฑ์รับเข้า</h3>
        {criteria?.screeningLabel && (
          <label className="mt-2 block"><span className="label text-sm">{criteria.screeningLabel}</span>
            <input className={`input w-32 ${out ? "input-error" : ""}`} inputMode="numeric" disabled={!canEdit} value={s} onChange={(e) => setS(e.target.value.replace(/\D/g, ""))} />
            {out && <span className="ml-2 text-sm font-semibold text-warn">นอกช่วง {criteria.screeningMin}–{criteria.screeningMax}</span>}
          </label>
        )}
        <div className="mt-2 space-y-1">
          {criteria?.exclusions?.map((x) => (
            <label key={x.code} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" disabled={!canEdit} checked={ex.includes(x.code)} onChange={(e) => setEx(e.target.checked ? [...ex, x.code] : ex.filter((c) => c !== x.code))} /> {x.label}</label>
          ))}
        </div>
        <div className="mt-2 space-y-1">
          {criteria?.confirmations?.map((x) => (
            <label key={x.code} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" disabled={!canEdit} checked={conf.includes(x.code)} onChange={(e) => toggle(conf, setConf, x.code, e.target.checked)} /> {x.label}{x.required && <span className="text-danger">*</span>}</label>
          ))}
          {criteria?.drugClasses && (
            <label className="block text-sm"><span className="label text-sm">{criteria.drugClassLabel ?? "ประวัติยาเสพติด"}</span>
              <select className="input w-auto" disabled={!canEdit} value={dc} onChange={(e) => setDc(e.target.value)}><option value="">— ไม่ระบุ —</option>{criteria.drugClasses.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}</select>
            </label>
          )}
          {criteria?.priorityFlags?.map((x) => (
            <label key={x.code} className="flex items-center gap-2 text-sm"><input type="checkbox" className="h-5 w-5" disabled={!canEdit} checked={pf.includes(x.code)} onChange={(e) => toggle(pf, setPf, x.code, e.target.checked)} /> {x.label}</label>
          ))}
        </div>
        {gaps.length > 0 && <p className="mt-2 text-sm font-semibold text-warn">ยืนยันรับเข้ายังไม่ได้: {gaps.join(", ")}{gaps.some((g) => g.includes("เลขบัตร")) ? " (เพิ่มเลขบัตรที่หน้าบุคคล)" : ""}</p>}
        {canEdit && <button className="btn-secondary btn-sm mt-2" disabled={pending} onClick={() => start(async () => { const r = await updateIntakeAction(enrollmentId, n, ex, { confirmations: conf, drugClass: dc || null, priorityFlags: pf }); setMsg(r.ok ? { tone: "ok", text: "บันทึกเกณฑ์รับเข้าแล้ว" } : { tone: "danger", text: r.error }); router.refresh(); })}>บันทึกเกณฑ์รับเข้า</button>}
      </div>
      <div>
        <h3 className="font-semibold">หลักฐานความยินยอม (PDPA)</h3>
        {consentSigned ? <p className="mt-2 tag-ok">ลงนามแล้ว {consentDate ?? ""}</p> : (
          <>
            <p className="mt-2 tag-warn">ยังไม่มีหลักฐานการลงนาม</p>
            {canEdit && (
              <div className="mt-2 flex flex-wrap items-end gap-2">
                <div className="w-56"><span className="label text-sm">วันที่ลงนาม</span><ThaiDateInput value={cDate} onChange={setCDate} max={today} /></div>
                <button className="btn-secondary btn-sm mb-1" disabled={pending} onClick={() => start(async () => { const r = await recordConsentAction(enrollmentId, cDate); setMsg(r.ok ? { tone: "ok", text: "บันทึกหลักฐานยินยอมแล้ว — ยืนยันรับเข้าได้ที่หน้ารายชื่อ" } : { tone: "danger", text: r.error }); router.refresh(); })}>บันทึกว่าลงนามแล้ว</button>
              </div>
            )}
          </>
        )}
      </div>
      {msg && <div className="md:col-span-2"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
    </div>
  );
}

export function CompleteButton({ cohortId, enrollmentId, defaultDate }: { cohortId: number; enrollmentId: number; defaultDate: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(defaultDate);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = (status: "completed" | "failed") => start(async () => {
    const r = await completeEnrollmentsAction(cohortId, [enrollmentId], status, date);
    if (!r.ok) return setError(r.error);
    if (r.data!.skipped.length) return setError(r.data!.skipped[0].reason);
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <button className="btn-secondary" onClick={() => setOpen(true)}><GraduationCap size={20} aria-hidden /> บันทึกจบหลักสูตร</button>
      <Modal open={open} onClose={() => setOpen(false)} title="บันทึกจบหลักสูตร">
        <div><span className="label">วันที่จบ</span><ThaiDateInput value={date} onChange={setDate} /></div>
        <p className="hint mt-2">&quot;ครบหลักสูตร&quot; จะสร้างกำหนดการติดตามเดือนที่ 1 3 6 12 และงาน บสต. ให้อัตโนมัติ</p>
        {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" disabled={pending} onClick={() => run("failed")}>ไม่ผ่าน</button>
          <button className="btn-primary" disabled={pending} onClick={() => run("completed")}>ครบหลักสูตร</button>
        </div>
      </Modal>
    </>
  );
}
