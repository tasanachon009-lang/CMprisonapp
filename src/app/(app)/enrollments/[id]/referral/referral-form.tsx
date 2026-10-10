"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { saveHealthReferralAction } from "../../actions";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Alert } from "@/components/ui";

type Opt = { code: string; label: string };
type Form = { recordedDate: string; needsReferral: boolean | null; physical: string[]; physicalOther: string; mental: string; treatmentPlan: string; coverage: string; coverageNote: string; hospital: string; medications: string };

/** แบบบันทึกส่งต่อข้อมูลสุขภาพ (สเปก 17 กิจกรรม 11) — เจ้าหน้าที่สถานพยาบาลกรอก ผู้ต้องขังไม่ได้ใช้หน้าจอนี้ */
export function ReferralForm(p: {
  enrollmentId: number; today: string; readOnly: boolean; canEditPhysical: boolean; physicalOptions: Opt[]; coverageOptions: Opt[]; backHref: string;
  initial: (Omit<Form, "needsReferral"> & { needsReferral: boolean; version: number }) | null;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [f, setF] = useState<Form>(() => p.initial ?? { recordedDate: p.today, needsReferral: null, physical: [], physicalOther: "", mental: "", treatmentPlan: "", coverage: "", coverageNote: "", hospital: "", medications: "" });
  const set = <K extends keyof Form>(k: K, v: Form[K]) => { setF((x) => ({ ...x, [k]: v })); setMsg(null); };
  const toggle = (code: string) => set("physical", f.physical.includes(code) ? f.physical.filter((c) => c !== code) : [...f.physical, code]);

  const save = () =>
    start(async () => {
      if (f.needsReferral == null) return setMsg({ tone: "danger", text: "กรุณาเลือกว่า \"ต้องส่งต่อ\" หรือ \"ไม่มีปัญหาสุขภาพที่ต้องส่งต่อ\"" });
      const r = await saveHealthReferralAction(p.enrollmentId, { ...f, needsReferral: f.needsReferral }, p.initial?.version);
      if (!r.ok) return setMsg({ tone: "danger", text: r.error });
      setMsg({ tone: "ok", text: "บันทึกแล้ว" });
      router.refresh();
    });

  const ro = p.readOnly;
  return (
    <div className="space-y-4">
      <section className="card space-y-4">
        <div className="max-w-xs"><span className="label">วันที่บันทึก</span><ThaiDateInput value={f.recordedDate} onChange={(v) => set("recordedDate", v)} max={p.today} /></div>
        <fieldset disabled={ro}>
          <legend className="label">ผลการพิจารณา <span className="text-danger">*</span></legend>
          <div className="flex flex-wrap gap-2">
            {([[true, "ต้องส่งต่อ"], [false, "ไม่มีปัญหาสุขภาพที่ต้องส่งต่อ"]] as const).map(([v, l]) => (
              <button key={String(v)} type="button" aria-pressed={f.needsReferral === v} onClick={() => set("needsReferral", v)}
                className={`min-h-11 rounded-full border px-5 font-semibold ${f.needsReferral === v ? "border-ink bg-ink text-white" : "border-line bg-white hover:bg-lime-soft"}`}>{l}</button>
            ))}
          </div>
        </fieldset>
      </section>

      {f.needsReferral && (
        <section className="card space-y-4">
          <fieldset disabled={ro || !p.canEditPhysical}>
            <legend className="label">ปัญหาสุขภาพกาย {!p.canEditPhysical && <span className="text-sm font-normal text-muted">(แก้ได้เฉพาะพยาบาล/สถานพยาบาล)</span>}</legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
              {p.physicalOptions.map((o) => (
                <label key={o.code} className="inline-flex min-h-11 items-center gap-2"><input type="checkbox" className="size-5" checked={f.physical.includes(o.code)} onChange={() => toggle(o.code)} /> {o.label}</label>
              ))}
            </div>
            {f.physical.includes("other") && (
              <div className="mt-2"><label className="label" htmlFor="rf-other">ระบุโรค/ปัญหาอื่น <span className="text-danger">*</span></label><input id="rf-other" className="input" maxLength={300} value={f.physicalOther} onChange={(e) => set("physicalOther", e.target.value)} /></div>
            )}
          </fieldset>
          <fieldset disabled={ro} className="space-y-4">
            <div><label className="label" htmlFor="rf-mental">ปัญหาสุขภาพจิต</label><textarea id="rf-mental" className="input" rows={2} maxLength={1000} value={f.mental} onChange={(e) => set("mental", e.target.value)} placeholder="เว้นว่างได้ถ้าไม่มี" /></div>
            <div><label className="label" htmlFor="rf-plan">แผนการรักษาหลังพ้นโทษ</label><textarea id="rf-plan" className="input" rows={3} maxLength={2000} value={f.treatmentPlan} onChange={(e) => set("treatmentPlan", e.target.value)} /></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label" htmlFor="rf-cov">สิทธิการรักษา</label>
                <select id="rf-cov" className="input" value={f.coverage} onChange={(e) => set("coverage", e.target.value)}>
                  <option value="">— ยังไม่ระบุ —</option>
                  {p.coverageOptions.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
                {f.coverage === "other" && <input aria-label="ระบุสิทธิการรักษาอื่น" className="input mt-2" maxLength={200} placeholder="ระบุสิทธิ" value={f.coverageNote} onChange={(e) => set("coverageNote", e.target.value)} />}
              </div>
              <div><label className="label" htmlFor="rf-hosp">โรงพยาบาลที่จะรักษาต่อ</label><input id="rf-hosp" className="input" maxLength={200} value={f.hospital} onChange={(e) => set("hospital", e.target.value)} /></div>
            </div>
            <div><label className="label" htmlFor="rf-med">ยาที่ต้องเตรียมให้ก่อนพ้นโทษ</label><textarea id="rf-med" className="input" rows={2} maxLength={1000} value={f.medications} onChange={(e) => set("medications", e.target.value)} placeholder="ชื่อยา ขนาด จำนวนวัน" /></div>
          </fieldset>
        </section>
      )}

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap justify-end gap-3">
        <a href={p.backHref} className="btn-ghost">กลับ</a>
        {!ro && <button type="button" className="btn-primary" disabled={pending} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก"}</button>}
      </div>
    </div>
  );
}
