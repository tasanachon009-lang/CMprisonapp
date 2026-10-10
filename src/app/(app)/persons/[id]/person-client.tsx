"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, Pencil } from "lucide-react";
import { Modal } from "@/components/modal";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { formatNationalId } from "@/lib/thai-id";
import { revealNationalId } from "@/app/(app)/register/actions";
import { updatePerson, updateIncarceration, changeInmateNo } from "../actions";

export function NationalIdReveal({ personId, masked }: { personId: number; masked: string }) {
  const [full, setFull] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (full) return <span className="font-mono">{formatNationalId(full)}</span>;
  return (
    <span className="font-mono">
      {masked}
      <button className="ml-2 inline-flex items-center gap-1 rounded-full px-2 text-sm text-navy underline" disabled={pending} title="การกดดูจะถูกบันทึกในประวัติการใช้งาน"
        onClick={() => start(async () => { const r = await revealNationalId(personId); if (r.ok) setFull(r.data!); })}>
        <Eye size={14} aria-hidden /> แสดงเต็ม
      </button>
    </span>
  );
}

export function PhotoUpload({ incarcerationId, hasPhoto }: { incarcerationId: number; hasPhoto: boolean }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const fd = new FormData();
    fd.append("photo", file);
    const r = await fetch(`/api/photos/${incarcerationId}`, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({ error: "อัปโหลดไม่สำเร็จ" }));
    setBusy(false);
    if (!r.ok) return setError(j.error);
    router.refresh();
  };
  return (
    <div className="text-center">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      <button className="btn-ghost btn-sm" disabled={busy} onClick={() => input.current?.click()}><Camera size={16} aria-hidden /> {busy ? "กำลังอัปโหลด..." : hasPhoto ? "เปลี่ยนรูป" : "เพิ่มรูปถ่าย"}</button>
      {error && <p className="error-text max-w-40">{error}</p>}
    </div>
  );
}

type PersonEdit = { id: number; version: number; prefix: string | null; firstName: string; lastName: string; birthDate: string | null; gender: string | null; maritalStatus: string | null; education: string | null; occupation: string | null; familySize: number | null; hasNationalId: boolean };

export function EditPerson({ person }: { person: PersonEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ...person, familySize: person.familySize?.toString() ?? "", nationalId: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    const r = await updatePerson(person.id, person.version, { ...f, familySize: f.familySize ? Number(f.familySize) : null, nationalId: f.nationalId || null });
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setF({ ...person, familySize: person.familySize?.toString() ?? "", nationalId: "" }); setError(null); setOpen(true); }}><Pencil size={16} aria-hidden /> แก้ไขข้อมูลส่วนตัว</button>
      <Modal open={open} onClose={() => setOpen(false)} title="แก้ไขข้อมูลส่วนตัว" wide>
        <div className="grid gap-3 sm:grid-cols-6">
          <label className="sm:col-span-1"><span className="label">คำนำหน้า</span><select className="input" value={f.prefix ?? ""} onChange={(e) => setF({ ...f, prefix: e.target.value })}>{["นาย", "นาง", "นางสาว"].map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="sm:col-span-2"><span className="label">ชื่อ</span><input className="input" value={f.firstName} onChange={(e) => setF({ ...f, firstName: e.target.value })} /></label>
          <label className="sm:col-span-3"><span className="label">นามสกุล</span><input className="input" value={f.lastName} onChange={(e) => setF({ ...f, lastName: e.target.value })} /></label>
          <div className="sm:col-span-3"><span className="label">วันเกิด</span><ThaiDateInput value={f.birthDate ?? ""} onChange={(v) => setF({ ...f, birthDate: v })} /></div>
          <label className="sm:col-span-3"><span className="label">เพศ</span><select className="input" value={f.gender ?? ""} onChange={(e) => setF({ ...f, gender: e.target.value })}><option value="">-</option><option value="male">ชาย</option><option value="female">หญิง</option><option value="other">อื่นๆ</option></select></label>
          <label className="sm:col-span-3"><span className="label">สถานภาพสมรส</span><input className="input" value={f.maritalStatus ?? ""} onChange={(e) => setF({ ...f, maritalStatus: e.target.value })} /></label>
          <label className="sm:col-span-3"><span className="label">ระดับการศึกษา</span><input className="input" value={f.education ?? ""} onChange={(e) => setF({ ...f, education: e.target.value })} /></label>
          <label className="sm:col-span-3"><span className="label">อาชีพก่อนต้องโทษ</span><input className="input" value={f.occupation ?? ""} onChange={(e) => setF({ ...f, occupation: e.target.value })} /></label>
          <label className="sm:col-span-3"><span className="label">จำนวนสมาชิกในครอบครัว</span><input className="input" inputMode="numeric" value={f.familySize} onChange={(e) => setF({ ...f, familySize: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="sm:col-span-6"><span className="label">{person.hasNationalId ? "แก้เลขบัตรประชาชน (เฉพาะผู้ดูแล — เว้นว่างถ้าไม่แก้)" : "เพิ่มเลขบัตรประชาชน"}</span><input className="input font-mono" inputMode="numeric" value={f.nationalId} onChange={(e) => setF({ ...f, nationalId: e.target.value })} /></label>
        </div>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button><button className="btn-primary" disabled={pending} onClick={save}>บันทึก</button></div>
      </Modal>
    </>
  );
}

type IncEdit = { id: number; version: number; admittedDate: string | null; offense: string | null; sentenceYears: number | null; sentenceMonths: number | null; sentenceDays: number | null; sentenceStatus: string | null; zone: string | null; room: string | null; prisonerClass: string | null };

export function EditIncarceration({ inc }: { inc: IncEdit }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const toS = (n: number | null) => n?.toString() ?? "";
  const init = () => ({ ...inc, sentenceYears: toS(inc.sentenceYears), sentenceMonths: toS(inc.sentenceMonths), sentenceDays: toS(inc.sentenceDays) });
  const [f, setF] = useState(init);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const n = (s: string) => (s ? Number(s) : null);
  const save = () => start(async () => {
    const r = await updateIncarceration(inc.id, inc.version, { ...f, sentenceYears: n(f.sentenceYears), sentenceMonths: n(f.sentenceMonths), sentenceDays: n(f.sentenceDays) });
    if (!r.ok) return setError(r.error);
    setOpen(false);
    router.refresh();
  });
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => { setF(init()); setError(null); setOpen(true); }}><Pencil size={16} aria-hidden /> แก้ไขข้อมูลคดี/แดน</button>
      <Modal open={open} onClose={() => setOpen(false)} title="แก้ไขข้อมูลการต้องโทษ" wide>
        <div className="grid gap-3 sm:grid-cols-6">
          <label className="sm:col-span-4"><span className="label">ฐานความผิด</span><input className="input" value={f.offense ?? ""} onChange={(e) => setF({ ...f, offense: e.target.value })} /></label>
          <div className="sm:col-span-2"><span className="label">วันที่รับตัว</span><ThaiDateInput value={f.admittedDate ?? ""} onChange={(v) => setF({ ...f, admittedDate: v })} /></div>
          <label className="sm:col-span-2"><span className="label">โทษ (ปี)</span><input className="input" inputMode="numeric" value={f.sentenceYears} onChange={(e) => setF({ ...f, sentenceYears: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="sm:col-span-2"><span className="label">(เดือน)</span><input className="input" inputMode="numeric" value={f.sentenceMonths} onChange={(e) => setF({ ...f, sentenceMonths: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="sm:col-span-2"><span className="label">(วัน)</span><input className="input" inputMode="numeric" value={f.sentenceDays} onChange={(e) => setF({ ...f, sentenceDays: e.target.value.replace(/\D/g, "") })} /></label>
          <label className="sm:col-span-2"><span className="label">แดน</span><input className="input" value={f.zone ?? ""} onChange={(e) => setF({ ...f, zone: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">ห้อง</span><input className="input" value={f.room ?? ""} onChange={(e) => setF({ ...f, room: e.target.value })} /></label>
          <label className="sm:col-span-2"><span className="label">สถานะคดี</span><input className="input" value={f.sentenceStatus ?? ""} onChange={(e) => setF({ ...f, sentenceStatus: e.target.value })} /></label>
        </div>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button><button className="btn-primary" disabled={pending} onClick={save}>บันทึก</button></div>
      </Modal>
    </>
  );
}

export function ChangeInmateNo({ incarcerationId, current }: { incarcerationId: number; current: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [no, setNo] = useState(current);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button className="btn-ghost btn-sm" onClick={() => setOpen(true)}>แก้เลขประจำตัว (ผู้ดูแล)</button>
      <Modal open={open} onClose={() => setOpen(false)} title="แก้เลขประจำตัวผู้ต้องขัง">
        <Alert tone="warn">แก้เลขประจำตัวเฉพาะกรณีบันทึกผิด ระบบบันทึกเหตุผลและผู้แก้ไข</Alert>
        <label className="mt-3 block"><span className="label">เลขใหม่</span><input className="input font-mono" value={no} onChange={(e) => setNo(e.target.value)} /></label>
        <label className="mt-3 block"><span className="label">เหตุผล</span><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
          <button className="btn-danger" disabled={pending || !reason.trim()} onClick={() => start(async () => { const r = await changeInmateNo(incarcerationId, no, reason); if (!r.ok) return setError(r.error); setOpen(false); router.refresh(); })}>บันทึกเลขใหม่</button>
        </div>
      </Modal>
    </>
  );
}
