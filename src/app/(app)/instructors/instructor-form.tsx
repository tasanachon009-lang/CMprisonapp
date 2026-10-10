"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, MapPin } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { BANKS, ACCOUNT_TYPE_LABEL, readiness, validateInstructor, formatAccountNo } from "@/lib/instructor-rules";
import { saveInstructorAction, searchAddressAction } from "./actions";

export type InstructorFormValue = {
  kind: "internal" | "external"; userId: number | null; externalType: string | null;
  prefix: string; firstName: string; lastName: string; position: string; organization: string; phone: string; email: string; nationalId: string;
  addrHouseNo: string; addrMoo: string; addrSoi: string; addrRoad: string; addrSubdistrictId: number | null; addrSubdistrict: string; addrDistrict: string; addrProvince: string; addrPostcode: string;
  payeeType: "person" | "company"; companyName: string; bank: string; bankBranch: string; accountType: string; accountName: string; accountNo: string;
  notifyChannel: string; bankBookReceived: boolean; bankBookReceivedDate: string; expertise: string; note: string;
};

const EXT_TYPES: Array<[string, string]> = [["gov", "ราชการ"], ["private", "เอกชน"], ["volunteer", "อาสาสมัคร"], ["civil", "ภาคประชาสังคม"]];

export function InstructorForm({ id, initial, version, users, canSensitive, today, masked }: {
  id: number | null; initial: InstructorFormValue; version?: number; users: Array<{ id: number; name: string; position: string | null }>;
  canSensitive: boolean; today: string; masked: { nationalId: string; accountNo: string };
}) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof InstructorFormValue>(k: K, v: InstructorFormValue[K]) => setF((x) => ({ ...x, [k]: v }));
  // ข้อมูลอ่อนไหวของรายการเดิม: ผู้ไม่มีสิทธิ์เห็นแบบปิดบังและแก้ไม่ได้
  const lockSensitive = !!id && !canSensitive;
  const user = users.find((u) => u.id === f.userId);
  const ready = readiness({ ...f, firstName: f.kind === "internal" ? user?.name ?? "" : f.firstName, nationalId: lockSensitive ? masked.nationalId : f.nationalId, accountNo: lockSensitive ? masked.accountNo : f.accountNo, addrHouseNo: lockSensitive ? (initial.addrHouseNo || "x") : f.addrHouseNo });
  const problem = validateInstructor({ ...f, nationalId: lockSensitive ? null : f.nationalId, accountNo: lockSensitive ? null : f.accountNo });

  const save = () => start(async () => {
    setMsg(null);
    const r = await saveInstructorAction(id, {
      ...f,
      externalType: (f.kind === "external" ? f.externalType ?? "gov" : null) as never,
      accountType: (f.accountType || null) as never, notifyChannel: (f.notifyChannel || null) as never,
      bankBookReceivedDate: f.bankBookReceived ? f.bankBookReceivedDate || today : null,
      userId: f.kind === "internal" ? f.userId : null,
    }, version);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: "ok", text: "บันทึกแล้ว" });
    if (!id) router.push(`/instructors/${r.data!.id}`);
    else router.refresh();
  });

  const text = (k: keyof InstructorFormValue, label: string, opts: { span?: string; placeholder?: string; disabled?: boolean; inputMode?: "numeric" | "email" | "tel" } = {}) => (
    <label className={opts.span ?? "sm:col-span-3"}>
      <span className="label">{label}</span>
      <input className="input" value={String(f[k] ?? "")} disabled={opts.disabled} placeholder={opts.placeholder} inputMode={opts.inputMode} onChange={(e) => set(k, e.target.value as never)} />
    </label>
  );

  return (
    <div className="space-y-6 pb-24">
      <section className="card space-y-3">
        <h2 className="text-xl">ตัวตน</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ประเภทวิทยากร">
          {(["internal", "external"] as const).map((k) => (
            <button key={k} type="button" disabled={!!id} onClick={() => set("kind", k)} className={`min-h-11 rounded-full border px-4 font-semibold ${f.kind === k ? (k === "internal" ? "border-navy bg-navy text-white" : "border-orange bg-orange text-white") : "border-line bg-white"}`}>
              {k === "internal" ? "ภายใน (เจ้าหน้าที่เรือนจำ)" : "ภายนอก (หน่วยงานอื่น)"}
            </button>
          ))}
        </div>
        {f.kind === "internal" ? (
          <div className="grid gap-3 sm:grid-cols-6">
            <label className="sm:col-span-4"><span className="label">บัญชีเจ้าหน้าที่</span>
              <select className="input" value={f.userId ?? ""} disabled={!!id} onChange={(e) => set("userId", e.target.value ? Number(e.target.value) : null)}>
                <option value="">— เลือกเจ้าหน้าที่ —</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name}{u.position ? ` · ${u.position}` : ""}</option>)}
              </select>
            </label>
            {text("position", "ตำแหน่ง (ถ้าไม่ระบุ ใช้จากบัญชีผู้ใช้)", { span: "sm:col-span-3", placeholder: user?.position ?? "" })}
            {text("organization", "ฝ่าย/งาน", { span: "sm:col-span-3" })}
            <p className="hint sm:col-span-6">ชื่อ-สกุลใช้ข้อมูลจากบัญชีผู้ใช้</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-6">
            {text("prefix", "คำนำหน้า", { span: "sm:col-span-1" })}
            {text("firstName", "ชื่อ", { span: "sm:col-span-2" })}
            {text("lastName", "นามสกุล", { span: "sm:col-span-3" })}
            {text("position", "ตำแหน่ง")}
            {text("organization", "หน่วยงานต้นสังกัด")}
            <label className="sm:col-span-3"><span className="label">ประเภท</span>
              <select className="input" value={f.externalType ?? "gov"} onChange={(e) => set("externalType", e.target.value)}>{EXT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            </label>
            {text("expertise", "ความเชี่ยวชาญ / หัวข้อที่สอนได้")}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-6">
          {lockSensitive
            ? <div className="sm:col-span-3"><span className="label">เลขประจำตัวประชาชน/ผู้เสียภาษี</span><p className="input bg-cream font-mono">{masked.nationalId || "-"}</p></div>
            : text("nationalId", "เลขประจำตัวประชาชน/ผู้เสียภาษี (13 หลัก)", { inputMode: "numeric", placeholder: "x-xxxx-xxxxx-xx-x" })}
          {text("phone", "เบอร์โทรมือถือ", { inputMode: "tel", span: "sm:col-span-2" })}
          {text("email", "อีเมล", { inputMode: "email", span: "sm:col-span-1" })}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl">ที่อยู่ (ใช้ในใบสำคัญรับเงินและแบบ KTB)</h2>
        {lockSensitive && <Alert tone="info">ข้อมูลอ่อนไหว แก้ไขได้เฉพาะการเงินและผู้ดูแลระบบ</Alert>}
        <div className="grid gap-3 sm:grid-cols-6">
          {text("addrHouseNo", "บ้านเลขที่", { span: "sm:col-span-2", disabled: lockSensitive })}
          {text("addrMoo", "หมู่ที่", { span: "sm:col-span-1", disabled: lockSensitive })}
          {text("addrSoi", "ซอย", { span: "sm:col-span-3", disabled: lockSensitive })}
          {text("addrRoad", "ถนน", { span: "sm:col-span-6", disabled: lockSensitive })}
        </div>
        <AddressPicker value={f} onPick={(h) => setF((x) => ({ ...x, addrSubdistrictId: h.id, addrSubdistrict: h.subdistrict, addrDistrict: h.district, addrProvince: h.province, addrPostcode: h.postcode }))} />
        <div className="grid gap-3 sm:grid-cols-4">
          {text("addrSubdistrict", "ตำบล/แขวง", { span: "sm:col-span-1" })}
          {text("addrDistrict", "อำเภอ/เขต", { span: "sm:col-span-1" })}
          {text("addrProvince", "จังหวัด", { span: "sm:col-span-1" })}
          {text("addrPostcode", "รหัสไปรษณีย์", { span: "sm:col-span-1", inputMode: "numeric" })}
        </div>
      </section>

      <section className="card space-y-3">
        <h2 className="text-xl">การรับเงินโอน (KTB Corporate Online)</h2>
        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="ประเภทผู้รับเงิน">
          {([["person", "บุคคลธรรมดา"], ["company", "บริษัท / ห้างหุ้นส่วน / ร้านค้า"]] as const).map(([v, l]) => (
            <button key={v} type="button" onClick={() => set("payeeType", v)} className={`min-h-11 rounded-full border px-4 font-semibold ${f.payeeType === v ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-6">
          {f.payeeType === "company" && text("companyName", "ชื่อนิติบุคคล", { span: "sm:col-span-6" })}
          <label className="sm:col-span-3"><span className="label">ธนาคาร</span>
            <select className="input" value={f.bank} onChange={(e) => set("bank", e.target.value)}><option value="">— เลือกธนาคาร —</option>{BANKS.map((b) => <option key={b} value={b}>{b}</option>)}</select>
          </label>
          {text("bankBranch", "สาขา")}
          <label className="sm:col-span-2"><span className="label">ประเภทบัญชี</span>
            <select className="input" value={f.accountType} onChange={(e) => set("accountType", e.target.value)}><option value="">— เลือก —</option>{Object.entries(ACCOUNT_TYPE_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
          </label>
          {text("accountName", "ชื่อบัญชี", { span: "sm:col-span-2" })}
          {lockSensitive
            ? <div className="sm:col-span-2"><span className="label">เลขที่บัญชี</span><p className="input bg-cream font-mono">{masked.accountNo || "-"}</p></div>
            : <label className="sm:col-span-2"><span className="label">เลขที่บัญชี</span><input className="input font-mono" inputMode="numeric" value={f.accountNo} onChange={(e) => set("accountNo", e.target.value)} onBlur={(e) => set("accountNo", formatAccountNo(e.target.value))} /></label>}
          <label className="sm:col-span-3"><span className="label">แจ้งผลการโอนทาง</span>
            <select className="input" value={f.notifyChannel} onChange={(e) => set("notifyChannel", e.target.value)}><option value="">— เลือก —</option><option value="sms">SMS</option><option value="email">อีเมล</option><option value="both">SMS และอีเมล</option></select>
          </label>
          <label className="flex items-center gap-2 sm:col-span-3 sm:pt-6"><input type="checkbox" className="h-5 w-5" checked={f.bankBookReceived} onChange={(e) => set("bankBookReceived", e.target.checked)} /> ได้รับสำเนาหน้าสมุดบัญชีแล้ว (เก็บกระดาษที่แฟ้ม)</label>
          {f.bankBookReceived && <div className="sm:col-span-3"><span className="label">วันที่ได้รับ</span><ThaiDateInput value={f.bankBookReceivedDate || today} onChange={(v) => set("bankBookReceivedDate", v)} max={today} /></div>}
        </div>
        {text("note", "หมายเหตุ", { span: "block" })}
      </section>

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3">
          <span className="mr-auto min-w-0 flex-1 basis-64">
            {ready.ready ? <span className="tag-ok">พร้อมเบิก</span> : <span className="text-sm font-semibold text-danger">ข้อมูลไม่ครบ: ขาด{ready.missing.join(", ")}</span>}
            {problem && <span className="block text-sm text-danger">{problem}</span>}
          </span>
          {msg && <span className={msg.tone === "ok" ? "tag-ok" : "text-sm text-danger"}>{msg.text}</span>}
          <button className="btn-primary" disabled={pending} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>
        </div>
      </div>
    </div>
  );
}

/** เลือกตำบล → เติมอำเภอ/จังหวัด/รหัสไปรษณีย์ให้อัตโนมัติ (ข้อมูลออฟไลน์) */
function AddressPicker({ value, onPick }: { value: InstructorFormValue; onPick: (h: { id: number; subdistrict: string; district: string; province: string; postcode: string }) => void }) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<Array<{ id: number; subdistrict: string; district: string; province: string; postcode: string }>>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(async () => setHits(await searchAddressAction(q)), 250);
  }, [q]);
  return (
    <div className="rounded-2xl border border-line bg-cream p-3">
      <label className="block"><span className="label flex items-center gap-1"><MapPin size={16} aria-hidden /> ค้นหาตำบล/แขวง หรือรหัสไปรษณีย์</span>
        <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="เช่น ช้างเผือก เชียงใหม่" />
      </label>
      {hits.length > 0 && (
        <ul className="mt-2 max-h-64 divide-y divide-line overflow-y-auto rounded-xl border border-line bg-white" role="listbox" aria-label="ผลการค้นหาตำบล">
          {hits.map((h) => (
            <li key={h.id}>
              <button type="button" className="flex min-h-11 w-full items-center px-3 text-left hover:bg-lime-soft" onClick={() => { onPick(h); setQ(""); setHits([]); }}>
                {h.subdistrict} · {h.district} · {h.province} <span className="ml-auto font-mono text-sm text-muted">{h.postcode}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {value.addrSubdistrict && <p className="hint mt-1">ที่เลือก: ต.{value.addrSubdistrict} อ.{value.addrDistrict} จ.{value.addrProvince} {value.addrPostcode}</p>}
    </div>
  );
}
