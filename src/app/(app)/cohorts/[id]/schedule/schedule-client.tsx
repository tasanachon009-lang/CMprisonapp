"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, AlertTriangle, Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { addStaffAction, removeStaffAction, setStaffRoleAction, updateSessionAction, cancelSessionAction } from "./actions";
import { setInviteStatusAction } from "../../../sessions/actions";
import { setSessionSplitAction } from "../../../pay/actions";
import { ThaiDateInput } from "@/components/thai-date-input";

export type StaffView = { id: number; userId: number | null; instructorId?: number | null; unregistered?: boolean; name: string; external: boolean; role: string | null; conflicts: string[]; invite?: string; inviteWarn?: boolean; inviteText?: string;
  /** ยอดค่าตอบแทน (สตางค์) ของคนนี้ในคาบ — null = เบิกไม่ได้ (ดู payNote) · undefined = ไม่แสดง */
  amount?: number | null; payNote?: string | null; shareRatio?: number | null };
type SplitInfo = { override: "full" | "equal" | "ratio" | null; note: string | null; topicDefault: string; locked: boolean };
const SPLIT_OPTS: Array<["" | "full" | "equal" | "ratio", string]> = [["", "ตามหัวข้อ"], ["full", "คนละเต็ม"], ["equal", "หารเท่ากัน"], ["ratio", "กำหนดสัดส่วน"]];
const fmtBaht = (s: number) => `${(s / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`;

const INVITE: Array<[string, string]> = [["none", "ยังไม่เชิญ"], ["sent", "ส่งหนังสือแล้ว"], ["accepted", "ตอบรับ"], ["declined", "ปฏิเสธ"], ["confirmed", "ยืนยันวันสอน"]];
const INVITE_LABEL = Object.fromEntries(INVITE);
type ExternalOpt = { id: number; name: string; org: string | null; ready: boolean };
type SessionView = { id: number; title: string; startTime: string; endTime: string; hours: number; category: string | null; status: string; date?: string; location?: string | null; topicId?: number | null; checked?: boolean; split?: SplitInfo };
export type TopicOpt = { id: number; name: string; standardHours: number | null };

const ROLE: Record<string, string> = { lead: "หลัก", co: "ร่วม" };

/** รายชื่อวิทยากรบนการ์ดคาบ: ทุกชื่อ + ป้ายใน/นอก + บทบาท + เตือนชนเวลา */
export function StaffNames({ staff }: { staff: StaffView[] }) {
  if (!staff.length) return <span className="tag-warn">ยังไม่ระบุผู้รับผิดชอบ</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {staff.map((x) => (
        <span key={x.id} className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-sm ${x.conflicts.length ? "border-danger bg-danger/5" : "border-line bg-white"}`} title={x.conflicts.join("\n") || undefined}>
          {x.conflicts.length > 0 && <AlertTriangle size={14} className="text-danger" aria-label="สอนซ้อนเวลา" />}
          {x.name}
          <span className={x.external ? "tag-orange px-1.5 py-0 text-xs" : "tag-navy px-1.5 py-0 text-xs"}>{x.external ? "นอก" : "ใน"}</span>
          {x.role && <span className="text-xs text-muted">({ROLE[x.role]})</span>}
          {x.inviteWarn && <span className="tag-warn px-1.5 py-0 text-xs" title="อีกไม่เกิน 14 วันจะถึงวันสอน แต่ยังไม่ตอบรับ/ยืนยัน">{INVITE_LABEL[x.invite ?? "none"]}</span>}
        </span>
      ))}
    </span>
  );
}

/** กดการ์ดคาบ → แก้รายชื่อวิทยากร (เพิ่ม/เอาออก/บทบาท) */
export function SessionStaffEditor({ cohortId, session, staff, options, externals = [], max, editable, lockedReason, topics = [], locations = [], label, canSplit = false, showPay = false }: {
  cohortId: number; session: SessionView; staff: StaffView[]; options: Array<{ id: number; name: string }>; externals?: ExternalOpt[]; max: number | null; editable: boolean; lockedReason: string | null;
  topics?: TopicOpt[]; locations?: string[]; label?: string; canSplit?: boolean; showPay?: boolean;
}) {
  const [tab, setTab] = useState<"staff" | "details">("staff");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<"internal" | "external">("internal");
  const [userId, setUserId] = useState("");
  const [extName, setExtName] = useState("");
  const [extId, setExtId] = useState("");
  const [role, setRole] = useState<"" | "lead" | "co">("");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [conflictAsk, setConflictAsk] = useState(false);
  const [pending, start] = useTransition();
  const full = max != null && staff.length >= max;
  const taken = new Set(staff.map((x) => x.userId));
  const available = options.filter((o) => !taken.has(o.id));
  const takenExt = new Set(staff.map((x) => x.instructorId));
  const availableExt = externals.filter((o) => !takenExt.has(o.id));

  const add = (ack = false) => start(async () => {
    const input = kind === "internal" ? { userId: userId ? Number(userId) : null } : extId ? { instructorId: Number(extId) } : { externalName: extName };
    const r = await addStaffAction(cohortId, session.id, { ...input, role: role || null }, ack);
    if (!r.ok) {
      setConflictAsk(r.code === "conflict");
      return setMsg({ tone: r.code === "conflict" ? "warn" : "danger", text: r.error });
    }
    setConflictAsk(false);
    setMsg({ tone: "ok", text: r.message ?? "เพิ่มแล้ว" });
    setUserId(""); setExtName(""); setExtId(""); setRole("");
    router.refresh();
  });
  const remove = (id: number) => start(async () => {
    const r = await removeStaffAction(cohortId, id);
    setMsg(r.ok ? { tone: "ok", text: "เอาออกแล้ว" } : { tone: "danger", text: r.error });
    router.refresh();
  });
  const changeInvite = (id: number, v: string) => start(async () => {
    const r = await setInviteStatusAction(id, v);
    setMsg(r.ok ? { tone: "ok", text: "บันทึกสถานะการเชิญแล้ว" } : { tone: "danger", text: r.error });
    router.refresh();
  });
  // ข้อความไม่มีข้อมูลผู้ต้องขัง — คัดลอกไปส่ง LINE/อีเมลให้วิทยากรเอง
  const copyText = (text: string) => {
    navigator.clipboard?.writeText(text).then(() => setMsg({ tone: "ok", text: "คัดลอกข้อความแล้ว" }), () => setMsg({ tone: "warn", text: text }));
  };
  const changeRole = (id: number, v: string) => start(async () => {
    const r = await setStaffRoleAction(cohortId, id, v === "lead" || v === "co" ? v : null);
    if (!r.ok) setMsg({ tone: "danger", text: r.error });
    router.refresh();
  });

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg(null); setConflictAsk(false); setTab("staff"); }} className="btn-ghost btn-sm mt-2" aria-label={`แก้วิทยากรคาบ ${session.title}`}>
        <Pencil size={16} aria-hidden /> {label ?? (editable ? "แก้คาบ / วิทยากร" : "ดูวิทยากร")}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={session.title}>
        {/* สร้างเนื้อหาเฉพาะตอนเปิด — หน้าตารางมีหลายสิบคาบ */}
        {open && editable && session.date && (
          <div className="mb-3 flex gap-2" role="tablist">
            {([["staff", "วิทยากร"], ["details", "รายละเอียดคาบ (วัน เวลา สถานที่)"]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${tab === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>
            ))}
          </div>
        )}
        {open && tab === "details" && session.date && <SessionDetailsForm cohortId={cohortId} session={session} topics={topics} locations={locations} onDone={() => { setOpen(false); router.refresh(); }} />}
        {open && tab === "staff" && <>
        <p className="text-sm text-muted">{session.startTime}–{session.endTime} · {session.hours} ชม.{session.category ? ` · ${session.category}` : ""} · {max == null ? "ทั้งทีม (ไม่จำกัดจำนวน)" : `สูงสุด ${max} คน`}</p>
        {lockedReason && <div className="mt-3"><Alert tone="info">{lockedReason}</Alert></div>}
        <ul className="mt-3 space-y-2">
          {staff.map((x) => (
            <li key={x.id} className={`rounded-2xl border px-3 py-2 ${x.conflicts.length ? "border-danger bg-danger/5" : "border-line bg-cream"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{x.name}</span>
                <span className={x.external ? "tag-orange" : "tag-navy"}>{x.external ? "ภายนอก" : "ภายใน"}</span>
                {x.unregistered && <span className="tag-warn" title="ยังไม่อยู่ในทะเบียนวิทยากร — เบิกเงินไม่ได้">ยังไม่อยู่ในทะเบียน</span>}
                {showPay && x.amount !== undefined && (x.amount != null ? <span className="tag-ok" title="ยอดตามวิธีแบ่งของคาบนี้ (คาบที่ยังไม่ปิดคิดตามตาราง)">💰 {fmtBaht(x.amount)}</span> : x.payNote ? <span className="tag-muted" title={x.payNote}>ไม่เบิก</span> : null)}
                {editable ? (
                  <select className="input min-h-11 w-40 py-1" value={x.role ?? ""} disabled={pending} onChange={(e) => changeRole(x.id, e.target.value)} aria-label={`บทบาทของ ${x.name}`}>
                    <option value="">ไม่ระบุบทบาท</option><option value="lead">วิทยากรหลัก</option><option value="co">วิทยากรร่วม</option>
                  </select>
                ) : x.role && <span className="text-sm text-muted">{x.role === "lead" ? "วิทยากรหลัก" : "วิทยากรร่วม"}</span>}
                {editable && <button className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-danger/10" disabled={pending} onClick={() => remove(x.id)} aria-label={`เอา ${x.name} ออก`}><X size={20} /></button>}
              </div>
              {x.conflicts.map((c) => <p key={c} className="mt-1 flex items-center gap-1 text-sm text-danger"><AlertTriangle size={14} aria-hidden /> สอนซ้อนเวลา: {c}</p>)}
              {x.external && x.invite && (
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">การเชิญ:</span>
                  {editable ? (
                    <select className="input min-h-11 w-44 py-1" value={x.invite} disabled={pending} onChange={(e) => changeInvite(x.id, e.target.value)} aria-label={`สถานะการเชิญ ${x.name}`}>
                      {INVITE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                    </select>
                  ) : <span>{INVITE_LABEL[x.invite]}</span>}
                  {x.inviteText && <button type="button" className="btn-ghost btn-sm" onClick={() => copyText(x.inviteText!)}>คัดลอกข้อความแจ้งกำหนดสอน</button>}
                  {x.inviteWarn && <span className="text-warn">อีกไม่เกิน 14 วันจะถึงวันสอน — ยังไม่ตอบรับ/ยืนยัน</span>}
                </div>
              )}
            </li>
          ))}
          {!staff.length && <li className="text-muted">ยังไม่มีผู้รับผิดชอบ</li>}
        </ul>

        {showPay && session.split && (
          <SplitEditor cohortId={cohortId} sessionId={session.id} split={session.split} staff={staff} canEdit={canSplit && !session.split.locked} onDone={() => router.refresh()} />
        )}
        {editable && (
          full ? <p className="mt-4 text-sm text-muted">ครบจำนวนสูงสุด {max} คนแล้ว — เอาคนเดิมออกก่อนจึงเพิ่มได้</p> : (
            <div className="mt-4 space-y-3 rounded-2xl border border-line p-3">
              <p className="font-semibold">+ เพิ่มวิทยากร</p>
              <div className="flex gap-2">
                {([["internal", "เจ้าหน้าที่ (ภายใน)"], ["external", "วิทยากรภายนอก"]] as const).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setKind(k)} className={`min-h-11 rounded-full border px-4 text-sm font-semibold ${kind === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>
                ))}
              </div>
              {kind === "internal" ? (
                <select className="input" value={userId} onChange={(e) => setUserId(e.target.value)} aria-label="เลือกเจ้าหน้าที่">
                  <option value="">— เลือกเจ้าหน้าที่ —</option>
                  {available.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                </select>
              ) : (
                <div className="space-y-2">
                  <select className="input" value={extId} onChange={(e) => { setExtId(e.target.value); if (e.target.value) setExtName(""); }} aria-label="เลือกวิทยากรภายนอกจากทะเบียน">
                    <option value="">— เลือกจากทะเบียนวิทยากร —</option>
                    {availableExt.map((o) => <option key={o.id} value={o.id}>{o.name}{o.org ? ` · ${o.org}` : ""}{o.ready ? "" : " (ข้อมูลเบิกจ่ายไม่ครบ)"}</option>)}
                  </select>
                  {!extId && <input className="input" placeholder="หรือพิมพ์ชื่อ (ยังไม่อยู่ในทะเบียน — ต้องเพิ่มในทะเบียนก่อนเบิกเงิน)" value={extName} onChange={(e) => setExtName(e.target.value)} aria-label="ชื่อวิทยากรภายนอก" />}
                  <a href="/instructors/new" target="_blank" className="text-sm text-navy underline">+ เพิ่มวิทยากรใหม่ในทะเบียน (แท็บใหม่ แล้วกลับมาโหลดหน้านี้)</a>
                </div>
              )}
              <select className="input" value={role} onChange={(e) => setRole(e.target.value as "")} aria-label="บทบาท">
                <option value="">บทบาท: ไม่ระบุ</option><option value="lead">วิทยากรหลัก</option><option value="co">วิทยากรร่วม</option>
              </select>
              <button className="btn-primary" disabled={pending || (kind === "internal" ? !userId : !extId && !extName.trim())} onClick={() => add(false)}><Plus size={20} aria-hidden /> เพิ่มวิทยากร</button>
            </div>
          )
        )}
        {msg && <div className="mt-3"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
        {conflictAsk && <button className="btn-danger mt-2" disabled={pending} onClick={() => add(true)}>ยืนยันเพิ่ม (ทราบแล้วว่าชนเวลา)</button>}
        
        </>}
      </Modal>
    </>
  );
}

/** แก้วัน เวลา ชั่วโมง สถานที่ หัวข้อ ของคาบ — ทับซ้อนต้องยืนยัน · ยกเลิกคาบพร้อมเหตุผล */
function SessionDetailsForm({ cohortId, session, topics, locations, onDone }: { cohortId: number; session: SessionView; topics: TopicOpt[]; locations: string[]; onDone: () => void }) {
  const [f, setF] = useState({ date: session.date!, startTime: session.startTime, endTime: session.endTime, hours: String(session.hours), location: session.location ?? "", topicId: session.topicId ? String(session.topicId) : "" });
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [ask, setAsk] = useState(false);
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const save = (ack = false) => start(async () => {
    const r = await updateSessionAction(cohortId, session.id, { date: f.date, startTime: f.startTime, endTime: f.endTime, hours: Number(f.hours), location: f.location || null, topicId: f.topicId ? Number(f.topicId) : null }, ack);
    if (!r.ok) { setAsk(r.code === "conflict"); return setMsg({ tone: r.code === "conflict" ? "warn" : "danger", text: r.error }); }
    onDone();
  });
  const cancel = () => start(async () => {
    const r = await cancelSessionAction(cohortId, session.id, reason);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    onDone();
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div><span className="label">วันที่</span><ThaiDateInput value={f.date} onChange={(v) => setF({ ...f, date: v })} /></div>
        <label><span className="label">หัวข้อ</span><select className="input" value={f.topicId} onChange={(e) => setF({ ...f, topicId: e.target.value })}><option value="">— ไม่ผูกหัวข้อ —</option>{topics.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label><span className="label">เริ่ม</span><input className="input" type="time" value={f.startTime} onChange={(e) => setF({ ...f, startTime: e.target.value })} /></label>
        <label><span className="label">สิ้นสุด</span><input className="input" type="time" value={f.endTime} onChange={(e) => setF({ ...f, endTime: e.target.value })} /></label>
        <label><span className="label">ชั่วโมงที่นับ</span><input className="input" inputMode="decimal" value={f.hours} onChange={(e) => setF({ ...f, hours: e.target.value })} /></label>
        <label><span className="label">สถานที่</span><input className="input" list={`loc-${session.id}`} value={f.location} onChange={(e) => setF({ ...f, location: e.target.value })} /><datalist id={`loc-${session.id}`}>{locations.map((l) => <option key={l} value={l} />)}</datalist></label>
      </div>
      {session.checked && <p className="hint">คาบนี้เช็คชื่อแล้ว ไม่สามารถย้ายวัน</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => save(false)}>บันทึก</button>
        {ask && <button className="btn-danger" disabled={pending} onClick={() => save(true)}>ยืนยัน (ทราบแล้วว่าทับซ้อน)</button>}
      </div>
      {!session.checked && (
        <details className="rounded-2xl border border-line p-3">
          <summary className="cursor-pointer font-semibold text-danger">ยกเลิกคาบนี้</summary>
          <div className="mt-2 flex flex-wrap gap-2">
            <input className="input flex-1" placeholder="เหตุผล เช่น วิทยากรติดภารกิจ" value={reason} onChange={(e) => setReason(e.target.value)} />
            <button className="btn-danger" disabled={pending || !reason.trim()} onClick={cancel}>ยืนยันยกเลิก</button>
          </div>
        </details>
      )}
    </div>
  );
}
/** วิธีแบ่งค่าตอบแทนของคาบ — ผู้ดูแลแก้เฉพาะคาบนี้ได้พร้อมหมายเหตุ (สเปก 11.4) */
function SplitEditor({ cohortId, sessionId, split, staff, canEdit, onDone }: { cohortId: number; sessionId: number; split: SplitInfo; staff: StaffView[]; canEdit: boolean; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<"" | "full" | "equal" | "ratio">(split.override ?? "");
  const [note, setNote] = useState(split.note ?? "");
  const [ratios, setRatios] = useState<Record<number, string>>(Object.fromEntries(staff.map((x) => [x.id, String(x.shareRatio ?? 1)])));
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const current = split.override ? SPLIT_OPTS.find(([k]) => k === split.override)![1] : `${split.topicDefault} (ตามหัวข้อ)`;
  const save = () => start(async () => {
    setErr(null);
    const r = await setSessionSplitAction(cohortId, sessionId, { method: method || null, note: note || null, ratios: method === "ratio" ? staff.map((x) => ({ staffId: x.id, ratio: Number(ratios[x.id]) })) : undefined });
    if (!r.ok) return setErr(r.error);
    setOpen(false);
    onDone();
  });
  return (
    <div className="mt-3 rounded-2xl border border-line bg-white p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span>วิธีแบ่งค่าตอบแทน: <b>{current}</b>{split.note ? ` — ${split.note}` : ""}</span>
        {split.locked && <span className="tag-muted">อนุมัติแล้ว (ล็อก)</span>}
        {canEdit && !open && <button type="button" className="btn-ghost btn-sm ml-auto" onClick={() => setOpen(true)}>แก้เฉพาะคาบนี้</button>}
      </div>
      {open && (
        <div className="mt-2 space-y-2">
          <div className="flex flex-wrap gap-2">
            {SPLIT_OPTS.map(([k, l]) => <button key={k} type="button" onClick={() => setMethod(k)} className={`min-h-11 rounded-full border px-3 font-semibold ${method === k ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>)}
          </div>
          {method === "ratio" && (
            <div className="flex flex-wrap gap-3">
              {staff.map((x) => <label key={x.id} className="flex items-center gap-1">{x.name}<input className="input min-h-11 w-20 py-1" inputMode="decimal" value={ratios[x.id] ?? "1"} onChange={(e) => setRatios({ ...ratios, [x.id]: e.target.value })} aria-label={`สัดส่วนของ ${x.name}`} /></label>)}
            </div>
          )}
          {method && <label className="block"><span className="label">หมายเหตุ (จำเป็น)</span><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="เช่น สอนร่วมกันทั้งคาบ" /></label>}
          {err && <Alert tone="danger">{err}</Alert>}
          <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pending} onClick={save}>{pending ? "กำลังบันทึก..." : "บันทึก"}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button></div>
        </div>
      )}
    </div>
  );
}