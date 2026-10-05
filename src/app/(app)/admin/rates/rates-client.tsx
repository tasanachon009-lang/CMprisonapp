"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import { Alert } from "@/components/ui";
import { saveRateAction, savePaySettingsAction } from "../pay-actions";

type Rate = { id: number | null; name: string; kind: "internal" | "external"; externalType: string | null; perHourBaht: number; dailyCapBaht: number | null; fromFiscalYear: number; active: boolean; isSample?: boolean; note: string | null };
const EXT: Array<[string, string]> = [["", "ทุกประเภท"], ["gov", "ราชการ"], ["private", "เอกชน"], ["volunteer", "อาสาสมัคร"], ["civil", "ภาคประชาสังคม"]];
const ACT: Array<[string, string]> = [["lecture", "บรรยาย"], ["panel", "อภิปราย/สัมมนา"], ["group", "แบ่งกลุ่ม/ฝึกปฏิบัติ"], ["practice", "ฝึกปฏิบัติ"], ["other", "อื่นๆ"]];
const baht = (n: number) => n.toLocaleString("th-TH", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

export function RatesEditor({ rates, fy }: { rates: Rate[]; fy: number }) {
  const router = useRouter();
  const [edit, setEdit] = useState<Rate | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () => start(async () => {
    if (!edit) return;
    const r = await saveRateAction(edit.id, { ...edit, externalType: (edit.kind === "external" ? edit.externalType || null : null) as never });
    if (!r.ok) return setMsg(r.error);
    setMsg(null); setEdit(null); router.refresh();
  });
  return (
    <section className="card space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-xl">ตารางอัตรา</h2>
        <button className="btn-secondary btn-sm" onClick={() => setEdit({ id: null, name: "", kind: "external", externalType: "gov", perHourBaht: 600, dailyCapBaht: null, fromFiscalYear: fy, active: true, note: null })}><Plus size={16} aria-hidden /> เพิ่มอัตรา</button>
      </div>
      <div className="overflow-x-auto">
        <table className="table-plain">
          <thead><tr><th>ชื่ออัตรา</th><th>ใช้กับ</th><th className="text-right">บาท/ชม.</th><th className="text-right">เพดาน/วัน</th><th>ใช้ตั้งแต่ปีงบ</th><th /></tr></thead>
          <tbody>
            {rates.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-60"}>
                <td>{r.name} {r.isSample && <span className="tag-warn ml-1">ตัวอย่าง</span>} {!r.active && <span className="tag-muted ml-1">ไม่ใช้แล้ว</span>}</td>
                <td>{r.kind === "internal" ? <span className="tag-navy">ภายใน</span> : <span className="tag-orange">ภายนอก{r.externalType ? ` · ${EXT.find(([v]) => v === r.externalType)?.[1]}` : ""}</span>}</td>
                <td className="text-right font-display">{baht(r.perHourBaht)}</td>
                <td className="text-right">{r.dailyCapBaht == null ? "ไม่จำกัด" : baht(r.dailyCapBaht)}</td>
                <td>{r.fromFiscalYear}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => setEdit(r)}>แก้</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {edit && (
        <div className="space-y-3 rounded-2xl border border-line bg-cream p-4">
          <h3 className="font-semibold">{edit.id ? "แก้อัตรา" : "อัตราใหม่"}</h3>
          <div className="grid gap-3 sm:grid-cols-6">
            <label className="sm:col-span-3"><span className="label">ชื่ออัตรา</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder="เช่น วิทยากรภายนอก ภาครัฐ ปีงบ 2570" /></label>
            <label className="sm:col-span-1"><span className="label">ใช้กับ</span><select className="input" value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as "internal" })}><option value="internal">ภายใน</option><option value="external">ภายนอก</option></select></label>
            {edit.kind === "external" && <label className="sm:col-span-2"><span className="label">ประเภทวิทยากรภายนอก</span><select className="input" value={edit.externalType ?? ""} onChange={(e) => setEdit({ ...edit, externalType: e.target.value || null })}>{EXT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>}
            <label className="sm:col-span-2"><span className="label">บาท/ชั่วโมง (0 = ไม่เบิก)</span><input className="input" inputMode="decimal" value={String(edit.perHourBaht)} onChange={(e) => setEdit({ ...edit, perHourBaht: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></label>
            <label className="sm:col-span-2"><span className="label">เพดานต่อวัน (บาท, ว่าง = ไม่จำกัด)</span><input className="input" inputMode="decimal" value={edit.dailyCapBaht == null ? "" : String(edit.dailyCapBaht)} onChange={(e) => setEdit({ ...edit, dailyCapBaht: e.target.value.trim() === "" ? null : Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></label>
            <label className="sm:col-span-2"><span className="label">ใช้ตั้งแต่ปีงบ (พ.ศ.)</span><input className="input" inputMode="numeric" value={String(edit.fromFiscalYear)} onChange={(e) => setEdit({ ...edit, fromFiscalYear: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            <label className="flex items-center gap-2 sm:col-span-6"><input type="checkbox" className="h-5 w-5" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> ใช้งานอยู่</label>
          </div>
          {msg && <Alert tone="danger">{msg}</Alert>}
          <div className="flex gap-2"><button className="btn-primary" disabled={pending} onClick={save}><Save size={18} aria-hidden /> บันทึก</button><button className="btn-ghost" onClick={() => { setEdit(null); setMsg(null); }}>ยกเลิก</button></div>
        </div>
      )}
    </section>
  );
}

export function PaySettingsForm({ maxPayableByType, withholdingTax }: { maxPayableByType: Record<string, number>; withholdingTax: { enabled: boolean; pct: number } }) {
  const router = useRouter();
  const [max, setMax] = useState(maxPayableByType);
  const [tax, setTax] = useState(withholdingTax);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">เกณฑ์การเบิก</h2>
      <p className="hint">จำนวนวิทยากรที่เบิกได้ต่อคาบตามลักษณะกิจกรรม — ค่าเริ่มต้นเป็นตัวอย่างตามแนวระเบียบค่าใช้จ่ายในการฝึกอบรม กรุณาให้การเงินตรวจ (ระบบเตือนเมื่อเกิน)</p>
      <div className="grid gap-3 sm:grid-cols-5">
        {ACT.map(([k, l]) => (
          <label key={k}><span className="label">{l} (คน)</span><input className="input" inputMode="numeric" value={String(max[k] ?? 1)} onChange={(e) => setMax({ ...max, [k]: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <label className="flex items-center gap-2 pb-3"><input type="checkbox" className="h-5 w-5" checked={tax.enabled} onChange={(e) => setTax({ ...tax, enabled: e.target.checked })} /> หักภาษี ณ ที่จ่าย (วิทยากรภายนอก)</label>
        {tax.enabled && <label className="w-32"><span className="label">อัตรา (%)</span><input className="input" inputMode="decimal" value={String(tax.pct)} onChange={(e) => setTax({ ...tax, pct: Number(e.target.value.replace(/[^\d.]/g, "")) || 0 })} /></label>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-primary" disabled={pending} onClick={() => start(async () => { const r = await savePaySettingsAction({ maxPayableByType: max, withholdingTax: tax }); setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error }); if (r.ok) router.refresh(); })}><Save size={18} aria-hidden /> บันทึก</button>
    </section>
  );
}
