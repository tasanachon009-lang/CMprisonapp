"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui";
import { PersonThumb } from "@/components/person-thumb";
import { ThaiDateInput } from "@/components/thai-date-input";
import { assignAction, saveTeamReviewAction } from "./actions";

type Opt = { value: string; label: string };
export type HouseRow = { enrollmentId: number; name: string; inmateNo: string; thumb: string | null; zone: string | null; position: string; team: string | null; counselor: string | null; mentor: string | null; teamOverdue: boolean };
type Kind = "position" | "team" | "counselor" | "mentor";
const KIND_LABEL: Record<Kind, string> = { position: "ตำแหน่ง", team: "ทีมงาน", counselor: "ที่ปรึกษา", mentor: "พี่เลี้ยง (อส.รจ.)" };

/** ตารางสมาชิก: เลือกหลายคนแล้วกำหนด ตำแหน่ง / ทีม / ที่ปรึกษา / พี่เลี้ยง ครั้งเดียว (สเปก 22A) */
export function AssignTable({ cohortId, rows, today, canEdit, options, kinds }: { cohortId: number; rows: HouseRow[]; today: string; canEdit: boolean; options: Record<"position" | "team" | "counselor", Opt[]>; kinds: Kind[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [kind, setKind] = useState<Kind>(kinds[0]);
  const [value, setValue] = useState("");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const toggle = (id: number, on: boolean) => { const s = new Set(sel); if (on) s.add(id); else s.delete(id); setSel(s); };
  const needReason = kind === "position";
  const save = () => start(async () => {
    const r = await assignAction(cohortId, { enrollmentIds: Array.from(sel), kind, value, date, reason });
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: r.data!.errors.length ? "warn" : "ok", text: `บันทึกแล้ว ${r.data!.done} คน${r.data!.errors.length ? ` · ไม่สำเร็จ ${r.data!.errors.length} คน: ${r.data!.errors[0]}` : ""}` });
    setSel(new Set());
    setReason("");
    router.refresh();
  });
  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="overflow-x-auto">
        <table className="table-plain">
          <thead>
            <tr>
              {canEdit && <th className="w-10"><input type="checkbox" className="h-5 w-5" aria-label="เลือกทั้งหมด" checked={rows.length > 0 && sel.size === rows.length} onChange={(e) => setSel(e.target.checked ? new Set(rows.map((r) => r.enrollmentId)) : new Set())} /></th>}
              <th className="min-w-56">ชื่อ-สกุล</th><th>ตำแหน่ง</th><th>ทีมงาน</th><th>ที่ปรึกษา</th><th>พี่เลี้ยง</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId}>
                {canEdit && <td><input type="checkbox" className="h-5 w-5" checked={sel.has(r.enrollmentId)} aria-label={`เลือก ${r.name}`} onChange={(e) => toggle(r.enrollmentId, e.target.checked)} /></td>}
                <td><div className="flex items-center gap-2"><PersonThumb name={r.name} thumb={r.thumb} inmateNo={r.inmateNo} zone={r.zone} /><Link href={`/enrollments/${r.enrollmentId}/book`} className="hover:underline">{r.name}</Link></div></td>
                <td><span className="tag-navy">{r.position}</span></td>
                <td>{r.team ?? <span className="text-muted">ยังไม่กำหนด</span>}{r.teamOverdue && <span className="tag-warn ml-1">เกิน 2 เดือน</span>}</td>
                <td>{r.counselor ?? <span className="text-muted">ยังไม่กำหนด</span>}</td>
                <td>{r.mentor ?? <span className="text-muted">ยังไม่กำหนด</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && sel.size > 0 && (
        <div className="panel space-y-3 p-4">
          <p className="font-semibold">กำหนดให้สมาชิก {sel.size} คน</p>
          <div className="flex flex-wrap items-end gap-3">
            <label><span className="label">รายการ</span>
              <select className="input" value={kind} onChange={(e) => { setKind(e.target.value as Kind); setValue(""); }}>{kinds.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select>
            </label>
            <label className="min-w-56"><span className="label">{KIND_LABEL[kind]}</span>
              {kind === "mentor"
                ? <input className="input" value={value} maxLength={100} onChange={(e) => setValue(e.target.value)} />
                : <select className="input" value={value} onChange={(e) => setValue(e.target.value)}><option value="">— เลือก —</option>{options[kind].map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
            </label>
            <div><span className="label">วันที่เริ่ม</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
            <label className="min-w-64 flex-1"><span className="label">เหตุผล{needReason && <span className="text-danger"> *</span>}</span><input className="input" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} /></label>
            <button type="button" className="btn-primary" disabled={pending || !value.trim() || (needReason && reason.trim().length < 3)} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>
          </div>
        </div>
      )}
    </div>
  );
}

/** ประเมินทีมงานรายสัปดาห์ */
export function TeamReviewForm({ cohortId, teams, weekStart, weekLabel }: { cohortId: number; teams: Opt[]; weekStart: string; weekLabel: string }) {
  const router = useRouter();
  const [team, setTeam] = useState(teams[0]?.value ?? "");
  const [rating, setRating] = useState("");
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await saveTeamReviewAction(cohortId, { team, weekStart, rating, note });
    setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) { setNote(""); setRating(""); router.refresh(); }
  });
  return (
    <div className="space-y-3">
      <p className="text-muted">สัปดาห์ {weekLabel}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label><span className="label">ทีมงาน</span><select className="input" value={team} onChange={(e) => setTeam(e.target.value)}>{teams.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></label>
        <div role="radiogroup" aria-label="ผลการประเมิน" className="flex flex-wrap gap-2">
          {([["excellent", "ดีมาก"], ["good", "ดี"], ["fair", "พอใช้"], ["needs_improvement", "ควรปรับปรุง"]] as const).map(([v, l]) => (
            <button key={v} type="button" role="radio" aria-checked={rating === v} onClick={() => setRating(v)} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${rating === v ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{l}</button>
          ))}
        </div>
        <label className="min-w-64 flex-1"><span className="label">หมายเหตุ</span><input className="input" value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} /></label>
        <button type="button" className="btn-primary" disabled={pending || !team || !rating} onClick={save}><Save size={20} aria-hidden /> บันทึก</button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
