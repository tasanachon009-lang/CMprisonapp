"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, X, AlertTriangle, Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { addStaffAction, removeStaffAction, setStaffRoleAction } from "./actions";

export type StaffView = { id: number; userId: number | null; instructorId?: number | null; unregistered?: boolean; name: string; external: boolean; role: string | null; conflicts: string[] };
type ExternalOpt = { id: number; name: string; org: string | null; ready: boolean };
type SessionView = { id: number; title: string; startTime: string; endTime: string; hours: number; category: string | null; status: string };

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
        </span>
      ))}
    </span>
  );
}

/** กดการ์ดคาบ → แก้รายชื่อวิทยากร (เพิ่ม/เอาออก/บทบาท) */
export function SessionStaffEditor({ cohortId, session, staff, options, externals = [], max, editable, lockedReason }: {
  cohortId: number; session: SessionView; staff: StaffView[]; options: Array<{ id: number; name: string }>; externals?: ExternalOpt[]; max: number | null; editable: boolean; lockedReason: string | null;
}) {
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
  const changeRole = (id: number, v: string) => start(async () => {
    const r = await setStaffRoleAction(cohortId, id, v === "lead" || v === "co" ? v : null);
    if (!r.ok) setMsg({ tone: "danger", text: r.error });
    router.refresh();
  });

  return (
    <>
      <button type="button" onClick={() => { setOpen(true); setMsg(null); setConflictAsk(false); }} className="btn-ghost btn-sm mt-2" aria-label={`แก้วิทยากรคาบ ${session.title}`}>
        <Pencil size={16} aria-hidden /> {editable ? "วิทยากร" : "ดูวิทยากร"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`วิทยากร: ${session.title}`}>
        {/* สร้างเนื้อหาเฉพาะตอนเปิด — หน้าตารางมีหลายสิบคาบ */}
        {open && <>
        <p className="text-sm text-muted">{session.startTime}–{session.endTime} · {session.hours} ชม.{session.category ? ` · ${session.category}` : ""} · {max == null ? "ทั้งทีม (ไม่จำกัดจำนวน)" : `สูงสุด ${max} คน`}</p>
        {lockedReason && <div className="mt-3"><Alert tone="info">{lockedReason}</Alert></div>}
        <ul className="mt-3 space-y-2">
          {staff.map((x) => (
            <li key={x.id} className={`rounded-2xl border px-3 py-2 ${x.conflicts.length ? "border-danger bg-danger/5" : "border-line bg-cream"}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{x.name}</span>
                <span className={x.external ? "tag-orange" : "tag-navy"}>{x.external ? "ภายนอก" : "ภายใน"}</span>
                {x.unregistered && <span className="tag-warn" title="ยังไม่อยู่ในทะเบียนวิทยากร — เบิกเงินไม่ได้">ยังไม่อยู่ในทะเบียน</span>}
                {editable ? (
                  <select className="input min-h-11 w-40 py-1" value={x.role ?? ""} disabled={pending} onChange={(e) => changeRole(x.id, e.target.value)} aria-label={`บทบาทของ ${x.name}`}>
                    <option value="">ไม่ระบุบทบาท</option><option value="lead">วิทยากรหลัก</option><option value="co">วิทยากรร่วม</option>
                  </select>
                ) : x.role && <span className="text-sm text-muted">{x.role === "lead" ? "วิทยากรหลัก" : "วิทยากรร่วม"}</span>}
                {editable && <button className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center rounded-full hover:bg-danger/10" disabled={pending} onClick={() => remove(x.id)} aria-label={`เอา ${x.name} ออก`}><X size={20} /></button>}
              </div>
              {x.conflicts.map((c) => <p key={c} className="mt-1 flex items-center gap-1 text-sm text-danger"><AlertTriangle size={14} aria-hidden /> สอนซ้อนเวลา: {c}</p>)}
            </li>
          ))}
          {!staff.length && <li className="text-muted">ยังไม่มีผู้รับผิดชอบ</li>}
        </ul>

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
        <p className="hint mt-4">ค่าตอบแทนและการแบ่งเงินตามจำนวนวิทยากรจะคำนวณในขั้นที่ 3</p>
        </>}
      </Modal>
    </>
  );
}
