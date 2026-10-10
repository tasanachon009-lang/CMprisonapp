"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { formatThaiDate } from "@/lib/thai-date";
import { saveSettings, changeOrgCode, addHoliday, removeHoliday, saveLookup } from "../actions";

type Msg = { tone: "ok" | "danger"; text: string } | null;
const useAct = () => {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, okText = "บันทึกแล้ว") =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: r.message ?? okText } : { tone: "danger", text: r.error! });
      if (r.ok) router.refresh();
    });
  return { msg, pending, run };
};

export function OrgForm({ initial }: { initial: Record<string, string | number | boolean> }) {
  const [f, setF] = useState(initial);
  const { msg, pending, run } = useAct();
  const text = (k: string, label: string, span = "sm:col-span-3") => (
    <label className={span}><span className="label">{label}</span><input className="input" value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">หน่วยงาน (ใช้เติมเอกสารทุกฉบับ)</h2>
      <div className="grid gap-3 sm:grid-cols-6">
        {text("org.name", "ชื่อเรือนจำ")}
        {text("org.unitName", "ชื่อหน่วย")}
        {text("org.type", "ประเภท (เรือนจำกลาง/ทัณฑสถาน/เรือนจำจังหวัด)")}
        {text("org.headTitle", "ตำแหน่งผู้บริหารสูงสุด (ใช้ \"เรียน\")")}
        {text("org.address", "ที่อยู่", "sm:col-span-4")}
        {text("org.phone", "โทรศัพท์", "sm:col-span-2")}
        <label className="sm:col-span-3 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!f["pdpa.consentRequired"]} onChange={(e) => setF({ ...f, "pdpa.consentRequired": e.target.checked })} /> บังคับหลักฐานความยินยอม PDPA ก่อนยืนยันรับเข้า</label>
        <label className="sm:col-span-3"><span className="label">ล็อกหน้าจออัตโนมัติเมื่อไม่ใช้งาน (นาที 5–15)</span><input className="input" inputMode="numeric" value={String(f["security.idleLockMinutes"])} onChange={(e) => setF({ ...f, "security.idleLockMinutes": Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettings(f))}>บันทึก</button>
    </section>
  );
}

/** เอกสารราชการ (สเปก 18.4): ผู้ลงนาม เลขที่หนังสือ เลขไทย — ตั้งครั้งเดียว ใช้เติมเอกสารทุกฉบับ */
export function DocSettingsForm({ initial }: { initial: Record<string, string | boolean> }) {
  const [f, setF] = useState(initial);
  const { msg, pending, run } = useAct();
  const text = (k: string, label: string, ph = "") => (
    <label className="sm:col-span-3"><span className="label">{label}</span><input className="input" placeholder={ph} value={String(f[k] ?? "")} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">เอกสารราชการ (ผู้ลงนามและเลขที่หนังสือ)</h2>
      <p className="text-sm text-muted">ใช้เติมบันทึกข้อความ หนังสือเชิญ และคำสั่งของทุกรุ่น — แก้ในเอกสารแต่ละฉบับได้อีกครั้งก่อนพิมพ์ · ที่อยู่และโทรศัพท์ใช้จากช่อง &quot;หน่วยงาน&quot; ด้านบน</p>
      <div className="grid gap-3 sm:grid-cols-6">
        {text("org.headName", "ชื่อ-สกุลผู้บริหารสูงสุด (ลงนามหนังสือภายนอก/คำสั่ง)", "เช่น นาย… …")}
        {text("org.docPrefix", "เลขที่หนังสือ (ส่วนนำหน้า)", "เช่น ยธ 07xx/")}
        {text("docs.unitHeadName", "ชื่อ-สกุลหัวหน้าหน่วย (ลงนามบันทึกข้อความ)")}
        {text("docs.unitHeadTitle", "ตำแหน่งหัวหน้าหน่วย")}
        <label className="sm:col-span-6 flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!f["docs.thaiNumerals"]} onChange={(e) => setF({ ...f, "docs.thaiNumerals": e.target.checked })} /> ใช้เลขไทย (๑ ๒ ๓) ในเอกสารราชการ</label>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettings(f))}>บันทึก</button>
    </section>
  );
}

/** ความปลอดภัยผู้ดูแลระบบ (สเปก 2.1): OTP เป็นตัวเลือก ค่าเริ่มต้นปิด + เวลาราชการสำหรับแจ้งเตือนการเข้าระบบ */
export function AdminSecurityForm({ adminOtp, officeHours }: { adminOtp: boolean; officeHours: { start: string; end: string } }) {
  const [otp, setOtp] = useState(adminOtp);
  const [hours, setHours] = useState(officeHours);
  const { msg, pending, run } = useAct();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ความปลอดภัยผู้ดูแลระบบ</h2>
      <ul className="list-disc space-y-1 pl-6 text-sm text-muted">
        <li>รหัสผ่านผู้ดูแลต้องยาวอย่างน้อย 12 ตัว (รหัสเดิมที่สั้นกว่าจะถูกบังคับเปลี่ยนเมื่อเข้าระบบ)</li>
        <li>การกระทำสำคัญ (กู้คืนข้อมูล ให้/ถอนสิทธิ์ผู้ดูแล ลบถาวร) ต้องยืนยัน 2 คน</li>
        <li>ผู้ดูแลเข้าระบบนอกเวลาราชการ (รวมเสาร์-อาทิตย์และวันหยุด) → แจ้งเตือนผู้ดูแลอีกคน</li>
      </ul>
      <div className="grid gap-3 sm:grid-cols-6">
        <label className="sm:col-span-2"><span className="label">เวลาราชการ เริ่ม</span><input className="input" placeholder="08:30" value={hours.start} onChange={(e) => setHours({ ...hours, start: e.target.value })} /></label>
        <label className="sm:col-span-2"><span className="label">ถึง</span><input className="input" placeholder="16:30" value={hours.end} onChange={(e) => setHours({ ...hours, end: e.target.value })} /></label>
        <label className="sm:col-span-6 flex items-start gap-2">
          <input type="checkbox" className="mt-1 h-5 w-5" checked={otp} onChange={(e) => setOtp(e.target.checked)} />
          <span>ผู้ดูแลต้องยืนยัน OTP จากแอปมือถือทุกครั้งที่เข้าระบบ <span className="block text-sm text-muted">ค่าเริ่มต้น: ปิด (ห้าม/ไม่สะดวกนำมือถือเข้าเรือนจำ) — ถ้าเปิด ผู้ดูแลทุกคนต้องมีแอป Google/Microsoft Authenticator และจะถูกพาไปตั้งค่าทันที</span></span>
        </label>
      </div>
      {otp && !adminOtp && <Alert tone="warn">เมื่อบันทึก คุณจะต้องสแกน QR ด้วยแอปในโทรศัพท์ก่อนใช้งานต่อ — ตรวจว่ามีโทรศัพท์อยู่กับตัวแล้ว</Alert>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={pending} onClick={() => run(() => saveSettings({ "security.adminOtp": otp, "security.officeHours": hours }))}>บันทึก</button>
    </section>
  );
}

export function OrgCodeForm() {
  const [code, setCode] = useState("");
  const [code2, setCode2] = useState("");
  const { msg, pending, run } = useAct();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">รหัสหน่วยงาน (ชั้นที่ 1)</h2>
      <p className="text-sm text-muted">เปลี่ยนแล้วทุกเครื่องต้องใส่รหัสใหม่ · ควรเปลี่ยนเมื่อมีเจ้าหน้าที่ย้ายออก</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">รหัสใหม่ (อย่างน้อย 8 ตัว)</span><input type="password" className="input" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="new-password" /></label>
        <label><span className="label">พิมพ์อีกครั้ง</span><input type="password" className="input" value={code2} onChange={(e) => setCode2(e.target.value)} autoComplete="new-password" /></label>
      </div>
      {code2 && code !== code2 && <p className="error-text">รหัสทั้งสองช่องไม่ตรงกัน</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-secondary" disabled={pending || code.length < 8 || code !== code2} onClick={() => run(() => changeOrgCode(code))}>เปลี่ยนรหัสหน่วยงาน</button>
    </section>
  );
}

export function HolidaysEditor({ holidays }: { holidays: Array<{ date: string; name: string }> }) {
  const [date, setDate] = useState("");
  const [name, setName] = useState("");
  const { msg, pending, run } = useAct();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">วันหยุดราชการ</h2>
      <p className="text-sm text-muted">ใช้คำนวณวันสิ้นสุดรุ่นและส่ง LINE · ⚠️ วันหยุดทางพุทธศาสนาและวันหยุดชดเชยต้องเพิ่มเองทุกปี</p>
      <div className="flex flex-wrap items-end gap-2">
        <div><span className="label">วันที่</span><ThaiDateInput value={date} onChange={setDate} /></div>
        <label className="flex-1"><span className="label">ชื่อวันหยุด</span><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button className="btn-secondary" disabled={pending || !date || !name} onClick={() => run(async () => { const r = await addHoliday(date, name); if (r.ok) { setDate(""); setName(""); } return r; })}>เพิ่ม</button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <ul className="grid gap-1 sm:grid-cols-2">
        {holidays.map((h) => (
          <li key={h.date} className="flex items-center gap-2 rounded-xl bg-cream px-3 py-1">
            <span className="w-28 font-semibold">{formatThaiDate(h.date)}</span><span className="flex-1">{h.name}</span>
            <button className="rounded-full p-2 hover:bg-danger/10" aria-label={`ลบ ${h.name}`} onClick={() => run(() => removeHoliday(h.date), "ลบแล้ว")}><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function LookupEditor({ category, title, items }: { category: string; title: string; items: Array<{ code: string; label: string; active: boolean }> }) {
  const [label, setLabel] = useState("");
  const { msg, pending, run } = useAct();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">{title}</h2>
      <ul className="flex flex-wrap gap-2">
        {items.map((i) => (
          <li key={i.code}>
            <button title={i.active ? "กดเพื่อปิดใช้" : "กดเพื่อเปิดใช้"} className={i.active ? "tag-navy" : "tag-muted line-through"} onClick={() => run(() => saveLookup(category, i.code, i.label, !i.active))}>{i.label}</button>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <input className="input" placeholder="เพิ่มรายการใหม่" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="btn-secondary shrink-0" disabled={pending || !label.trim()} onClick={() => run(async () => { const r = await saveLookup(category, "", label, true); if (r.ok) setLabel(""); return r; })}>เพิ่ม</button>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  );
}
