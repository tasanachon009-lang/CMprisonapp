"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { PROFESSIONS, ROLES, PERMISSIONS, SCOPABLE, type Permission } from "@/lib/auth/permissions";
import { createUser, updateUser, setUserRoles, resetPassword, setUserStatus, addGrant, revokeGrant, requestDualAction, resetOtp } from "../actions";

type UserForm = { prefix: string | null; firstName: string; lastName: string; nickname: string | null; position: string | null; profession: string; level: "executive" | "lead" | "staff"; titleLabel: string | null; sortOrder: number };
const blank: UserForm = { prefix: "นาย", firstName: "", lastName: "", nickname: null, position: null, profession: "nurse", level: "staff", titleLabel: null, sortOrder: 100 };

function Fields({ f, setF }: { f: UserForm; setF: (f: UserForm) => void }) {
  return (
    <div className="grid gap-3 sm:grid-cols-6">
      <label className="sm:col-span-1"><span className="label">คำนำหน้า</span><input className="input" value={f.prefix ?? ""} onChange={(e) => setF({ ...f, prefix: e.target.value || null })} /></label>
      <label className="sm:col-span-2"><span className="label">ชื่อ</span><input className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></label>
      <label className="sm:col-span-3"><span className="label">นามสกุล</span><input className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></label>
      <label className="sm:col-span-3"><span className="label">วิชาชีพ (กำหนดสิทธิ์เริ่มต้น)</span>
        <select className="input" value={f.profession} onChange={(e) => setF({ ...f, profession: e.target.value })}>{Object.entries(PROFESSIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
      </label>
      <label className="sm:col-span-3"><span className="label">ระดับ</span>
        <select className="input" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value as UserForm["level"] })}><option value="executive">บริหาร</option><option value="lead">ผู้ปฏิบัติหลัก</option><option value="staff">เจ้าหน้าที่</option></select>
      </label>
      <label className="sm:col-span-4"><span className="label">ตำแหน่ง (ใช้เติมเอกสาร)</span><input className="input" value={f.position ?? ""} onChange={(e) => setF({ ...f, position: e.target.value || null })} /></label>
      <label className="sm:col-span-2"><span className="label">ป้ายบนหน้าจอ</span><input className="input" placeholder="เช่น หัวหน้า" value={f.titleLabel ?? ""} onChange={(e) => setF({ ...f, titleLabel: e.target.value || null })} /></label>
      <label className="sm:col-span-2"><span className="label">ลำดับในหน้าเลือกชื่อ</span><input className="input" inputMode="numeric" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
    </div>
  );
}

export function NewUserButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<UserForm>(blank);
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-primary" onClick={() => { setF(blank); setPw(""); setError(null); setOpen(true); }}><UserPlus size={20} aria-hidden /> เพิ่มผู้ใช้</button>
      <Modal open={open} onClose={() => setOpen(false)} title="เพิ่มผู้ใช้" wide>
        <Fields f={f} setF={setF} />
        <label className="mt-3 block"><span className="label">รหัสผ่านชั่วคราว (ผู้ใช้ต้องเปลี่ยนเมื่อเข้าครั้งแรก)</span><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></label>
        <p className="hint">บัญชีผู้ควบคุม (ผู้คุม): ค่าเริ่มต้นไม่มีบัญชี — เปิดเฉพาะเมื่อจำเป็น และใช้ได้แบบดูอย่างเดียว</p>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
          <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await createUser({ ...f, tempPassword: pw }); if (!r.ok) return setError(r.error); setOpen(false); router.push(`/admin/users/${r.data!.id}`); })}>สร้างบัญชี</button>
        </div>
      </Modal>
    </>
  );
}

export function EditUserPanel({ id, user, roles, isSelf, isAdmin, adminCount, otpEnabled = false }: { id: number; user: UserForm & { status: string }; roles: string[]; isSelf: boolean; isAdmin: boolean; adminCount: number; otpEnabled?: boolean }) {
  const router = useRouter();
  const [f, setF] = useState<UserForm>(user);
  const [r, setR] = useState<Set<string>>(new Set(roles.filter((x) => x !== "admin")));
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pw, setPw] = useState("");
  const [reason, setReason] = useState("");
  const [pending, start] = useTransition();
  const done = (res: { ok: boolean; error?: string; message?: string }, okText = "บันทึกแล้ว") => {
    setMsg(res.ok ? { tone: "ok", text: res.message ?? okText } : { tone: "danger", text: res.error! });
    if (res.ok) router.refresh();
  };
  return (
    <div className="space-y-6">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <section className="card space-y-3">
        <h2 className="text-xl">ข้อมูลบุคลากร</h2>
        <Fields f={f} setF={setF} />
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => done(await updateUser(id, f)))}>บันทึกข้อมูล</button>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl">บทบาท (สิทธิ์รวมกันได้หลายบทบาท)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {Object.entries(ROLES).filter(([k]) => k !== "admin").map(([k, v]) => (
            <label key={k} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
              <input type="checkbox" className="h-5 w-5" checked={r.has(k)} onChange={(e) => { const s = new Set(r); if (e.target.checked) s.add(k); else s.delete(k); setR(s); }} /> {v}
            </label>
          ))}
        </div>
        <button className="btn-primary" disabled={pending} onClick={() => start(async () => done(await setUserRoles(id, [...r])))}>บันทึกบทบาท</button>
        <div className="rounded-2xl bg-cream p-3">
          <p className="font-semibold">ผู้ดูแลระบบ (มีได้ไม่เกิน 2 คน — ปัจจุบัน {adminCount} คน)</p>
          <p className="text-sm text-muted">การให้/ถอนสิทธิ์ผู้ดูแล ต้องให้ผู้ดูแลอีกคนกดยืนยัน</p>
          <input className="input mt-2" placeholder="เหตุผล" value={reason} onChange={(e) => setReason(e.target.value)} />
          {isAdmin && !isSelf && otpEnabled && <button className="btn-ghost mt-2 mr-2" disabled={pending || !reason.trim()} onClick={() => start(async () => done(await resetOtp(id, reason)))}>รีเซ็ต OTP (โทรศัพท์หาย)</button>}
          {isAdmin
            ? <button className="btn-danger mt-2" disabled={pending || !reason.trim() || isSelf} onClick={() => start(async () => done(await requestDualAction("revoke_admin", { userId: id }, reason)))}>ขอถอนสิทธิ์ผู้ดูแล</button>
            : <button className="btn-secondary mt-2" disabled={pending || !reason.trim() || adminCount >= 2} onClick={() => start(async () => done(await requestDualAction("grant_admin", { userId: id }, reason)))}>ขอให้สิทธิ์ผู้ดูแล</button>}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl">รหัสผ่านและสถานะบัญชี</h2>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex-1"><span className="label">รหัสผ่านชั่วคราวใหม่</span><input className="input" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="off" /></label>
          <button className="btn-secondary" disabled={pending || !pw} onClick={() => start(async () => { done(await resetPassword(id, pw)); setPw(""); })}><KeyRound size={18} aria-hidden /> รีเซ็ตรหัส (และปลดล็อก)</button>
        </div>
        {!isSelf && (user.status === "active" ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex-1"><span className="label">เหตุผลการระงับ</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>
            <button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => start(async () => done(await setUserStatus(id, "suspended", reason)))}>ระงับบัญชีทันที</button>
          </div>
        ) : (
          <button className="btn-secondary" disabled={pending} onClick={() => start(async () => done(await setUserStatus(id, "active", "")))}>เปิดใช้บัญชีอีกครั้ง</button>
        ))}
      </section>
    </div>
  );
}

export function GrantsPanel({ userId, grants, cohorts }: { userId: number; grants: Array<{ id: number; permission: string; allow: boolean; scope: string | null; validFrom: string | null; validTo: string | null; reason: string | null; active: boolean }>; cohorts: Array<{ id: number; label: string }> }) {
  const router = useRouter();
  const [g, setG] = useState({ permission: "attendance.edit_own", allow: true, scope: "", validFrom: "", validTo: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ปรับสิทธิ์รายคน / มอบหมายรายรุ่น / มอบสิทธิ์ชั่วคราว</h2>
      {grants.length > 0 && (
        <ul className="space-y-1">
          {grants.map((x) => (
            <li key={x.id} className={`flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 ${x.active ? "bg-cream" : "text-muted line-through"}`}>
              <span className={x.allow ? "tag-ok" : "tag-danger"}>{x.allow ? "เพิ่ม" : "ตัด"}</span>
              {PERMISSIONS[x.permission as keyof typeof PERMISSIONS] ?? x.permission}
              {x.scope && <span className="tag-navy">{cohorts.find((c) => `cohort:${c.id}` === x.scope)?.label ?? x.scope}</span>}
              {(x.validFrom || x.validTo) && <span className="text-sm text-muted">{x.validFrom ?? "…"} ถึง {x.validTo ?? "…"}</span>}
              {x.reason && <span className="text-sm text-muted">· {x.reason}</span>}
              {x.active && <button className="btn-ghost btn-sm ml-auto" onClick={() => start(async () => { await revokeGrant(x.id); router.refresh(); })}>ยกเลิก</button>}
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 sm:grid-cols-6">
        <label className="sm:col-span-3"><span className="label">สิทธิ์</span>
          <select className="input" value={g.permission} onChange={(e) => setG({ ...g, permission: e.target.value, scope: SCOPABLE.includes(e.target.value as Permission) ? g.scope : "" })}>{Object.entries(PERMISSIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
        </label>
        <label className="sm:col-span-1"><span className="label">การปรับ</span><select className="input" value={g.allow ? "1" : "0"} onChange={(e) => setG({ ...g, allow: e.target.value === "1" })}><option value="1">เพิ่ม</option><option value="0">ตัด</option></select></label>
        <label className="sm:col-span-2"><span className="label">เฉพาะรุ่น (กลุ่ม B)</span>
          <select className="input" value={g.scope} disabled={!SCOPABLE.includes(g.permission as Permission)} onChange={(e) => setG({ ...g, scope: e.target.value })}><option value="">ทั้งระบบ</option>{cohorts.map((c) => <option key={c.id} value={`cohort:${c.id}`}>{c.label}</option>)}</select>
        </label>
        <div className="sm:col-span-2"><span className="label">ตั้งแต่ (ว่าง=ทันที)</span><ThaiDateInput value={g.validFrom} onChange={(v) => setG({ ...g, validFrom: v })} /></div>
        <div className="sm:col-span-2"><span className="label">ถึง (ว่าง=ไม่มีกำหนด)</span><ThaiDateInput value={g.validTo} onChange={(v) => setG({ ...g, validTo: v })} /></div>
        <label className="sm:col-span-2"><span className="label">เหตุผล</span><input className="input" value={g.reason} onChange={(e) => setG({ ...g, reason: e.target.value })} /></label>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => {
        const r = await addGrant(userId, { ...g, scope: g.scope || null, validFrom: g.validFrom || null, validTo: g.validTo || null });
        if (!r.ok) return setError(r.error);
        setError(null);
        router.refresh();
      })}>เพิ่มการปรับสิทธิ์</button>
      <p className="hint">สิทธิ์ที่มีช่วงวันที่จะกลับเป็นค่าเดิมอัตโนมัติเมื่อหมดเวลา · มอบหมายรายรุ่นได้เฉพาะ: {SCOPABLE.map((p) => PERMISSIONS[p]).join(", ")}</p>
    </section>
  );
}
