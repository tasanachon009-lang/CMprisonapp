"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Coins } from "lucide-react";
import { Alert } from "@/components/ui";
import { saveTopicAction, bulkTopicsAction } from "../pay-actions";

type Topic = {
  id: number; name: string; category: string | null; standardHours: number | null; activityType: string; color: string | null;
  staffingType: string; maxStaff: number | null; payable: boolean; internalRateId: number | null; externalRates: Record<string, number | null> | null;
  splitMethod: string; active: boolean; sortOrder: number; defaultStaff: Array<{ userId?: number; instructorId?: number }>;
};
type Rate = { id: number; name: string; kind: string; perHourBaht: number; isSample: boolean };
type Person = { key: string; userId: number | null; instructorId: number | null; name: string; kind: string };

const ACT: Record<string, string> = { lecture: "บรรยาย", panel: "อภิปราย/สัมมนา", group: "แบ่งกลุ่ม/ฝึกปฏิบัติ", practice: "ฝึกปฏิบัติ", other: "อื่นๆ" };
const SPLIT: Record<string, string> = { full: "คนละเต็มอัตรา", equal: "หารเท่ากัน", ratio: "กำหนดสัดส่วน" };

export function TopicsEditor({ courseId, courseColor, topics, rates, people }: { courseId: number; courseColor: string | null; topics: Topic[]; rates: Rate[]; people: Person[] }) {
  const router = useRouter();
  const [edit, setEdit] = useState<(Omit<Topic, "id"> & { id: number | null }) | null>(null);
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [bulk, setBulk] = useState<{ field: string; value: string }>({ field: "payable", value: "true" });
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const internalRates = rates.filter((r) => r.kind === "internal");
  const externalRates = rates.filter((r) => r.kind === "external");
  const rateName = (id: number | null | undefined) => (id ? rates.find((r) => r.id === id)?.name ?? "-" : "-");

  const save = () => start(async () => {
    if (!edit) return;
    const { id, ...rest } = edit;
    const r = await saveTopicAction(courseId, id, rest as never);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setMsg({ tone: "ok", text: "บันทึกแล้ว" }); setEdit(null); router.refresh();
  });
  const applyBulk = () => start(async () => {
    const v = bulk.value;
    const patch: Record<string, unknown> =
      bulk.field === "payable" ? { payable: v === "true" }
        : bulk.field === "splitMethod" ? { splitMethod: v }
          : bulk.field === "activityType" ? { activityType: v }
            : bulk.field === "internalRateId" ? { internalRateId: v ? Number(v) : null }
              : bulk.field === "externalRate" ? { externalRates: v ? { "*": Number(v) } : null }
                : bulk.field === "staffingType" ? { staffingType: v }
                  : {};
    const r = await bulkTopicsAction(courseId, [...sel], patch as never);
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "แก้แล้ว" } : { tone: "danger", text: r.error });
    if (r.ok) { setSel(new Set()); router.refresh(); }
  });
  const bulkOptions: Record<string, Array<[string, string]>> = {
    payable: [["true", "เบิกได้"], ["false", "เบิกไม่ได้"]],
    splitMethod: Object.entries(SPLIT),
    activityType: Object.entries(ACT),
    staffingType: [["individual", "รายบุคคล"], ["team", "ทั้งทีม"]],
    internalRateId: [["", "— ไม่ระบุ —"], ...internalRates.map((r): [string, string] => [String(r.id), r.name])],
    externalRate: [["", "— ไม่ระบุ —"], ...externalRates.map((r): [string, string] => [String(r.id), r.name])],
  };

  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl">หัวข้อ {topics.length} รายการ</h2>
        <button className="btn-secondary btn-sm" onClick={() => setEdit({ id: null, name: "", category: null, standardHours: null, activityType: "lecture", color: courseColor, staffingType: "individual", maxStaff: 2, payable: true, internalRateId: internalRates[0]?.id ?? null, externalRates: externalRates[0] ? { "*": externalRates[0].id } : null, splitMethod: "full", active: true, sortOrder: (topics.at(-1)?.sortOrder ?? 0) + 10, defaultStaff: [] })}><Plus size={16} aria-hidden /> เพิ่มหัวข้อ</button>
      </div>
      {sel.size > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-lime-soft p-3">
          <span className="self-center font-semibold">แก้พร้อมกัน {sel.size} หัวข้อ:</span>
          <select className="input w-auto" value={bulk.field} onChange={(e) => setBulk({ field: e.target.value, value: bulkOptions[e.target.value][0][0] })} aria-label="สิ่งที่จะเปลี่ยน">
            <option value="payable">การเบิก</option><option value="splitMethod">วิธีแบ่งค่าตอบแทน</option><option value="activityType">ลักษณะกิจกรรม</option>
            <option value="staffingType">ประเภทผู้รับผิดชอบ</option><option value="internalRateId">อัตราภายใน</option><option value="externalRate">อัตราภายนอก</option>
          </select>
          <select className="input w-auto" value={bulk.value} onChange={(e) => setBulk({ ...bulk, value: e.target.value })} aria-label="ค่าใหม่">
            {bulkOptions[bulk.field].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn-primary btn-sm" disabled={pending} onClick={applyBulk}>ใช้กับที่เลือก</button>
          <button className="btn-ghost btn-sm" onClick={() => setSel(new Set())}>ยกเลิกการเลือก</button>
        </div>
      )}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="overflow-x-auto">
        <table className="table-plain text-sm">
          <thead><tr><th className="w-10"><input type="checkbox" className="h-5 w-5" aria-label="เลือกทั้งหมด" checked={sel.size === topics.length && topics.length > 0} onChange={(e) => setSel(e.target.checked ? new Set(topics.map((t) => t.id)) : new Set())} /></th><th>หัวข้อ</th><th>ชม.</th><th>ลักษณะ</th><th>ผู้รับผิดชอบ</th><th>การเบิก</th><th>อัตรา ใน / นอก</th><th>หลายคน</th><th /></tr></thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t.id} className={t.active ? "" : "opacity-50"}>
                <td><input type="checkbox" className="h-5 w-5" checked={sel.has(t.id)} aria-label={`เลือก ${t.name}`} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(t.id); else s.delete(t.id); setSel(s); }} /></td>
                <td><span className="mr-1 inline-block h-3 w-3 rounded-full align-middle" style={{ background: t.color ?? "#ccc" }} aria-hidden />{t.name}{t.category && <span className="block text-xs text-muted">{t.category}</span>}</td>
                <td>{t.standardHours ?? "-"}</td>
                <td>{ACT[t.activityType] ?? t.activityType}</td>
                <td>{t.staffingType === "team" ? <span className="tag-navy">ทั้งทีม</span> : `รายบุคคล ≤ ${t.maxStaff ?? "-"}`}{t.defaultStaff.length > 0 && <span className="block text-xs text-muted">ประจำ {t.defaultStaff.length} คน</span>}</td>
                <td>{t.payable ? <span className="tag-ok"><Coins size={14} aria-hidden /> เบิกได้</span> : <span className="tag-muted">ไม่เบิก</span>}</td>
                <td className="text-xs">{rateName(t.internalRateId)}<br />{rateName(t.externalRates?.["*"] ?? t.externalRates?.gov)}</td>
                <td>{SPLIT[t.splitMethod]}</td>
                <td><button className="btn-ghost btn-sm" onClick={() => setEdit(t)}>แก้</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="space-y-3 rounded-2xl border border-line bg-cream p-4">
          <h3 className="font-semibold">{edit.id ? `แก้หัวข้อ: ${edit.name}` : "หัวข้อใหม่"}</h3>
          <div className="grid gap-3 sm:grid-cols-6">
            <label className="sm:col-span-3"><span className="label">ชื่อหัวข้อ</span><input className="input" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
            <label className="sm:col-span-2"><span className="label">กลุ่มวิชา/หมวด</span><input className="input" value={edit.category ?? ""} onChange={(e) => setEdit({ ...edit, category: e.target.value || null })} /></label>
            <label className="sm:col-span-1"><span className="label">ชม.มาตรฐาน</span><input className="input" inputMode="decimal" value={edit.standardHours ?? ""} onChange={(e) => setEdit({ ...edit, standardHours: e.target.value ? Number(e.target.value) || null : null })} /></label>
            <label className="sm:col-span-2"><span className="label">ลักษณะกิจกรรม</span><select className="input" value={edit.activityType} onChange={(e) => setEdit({ ...edit, activityType: e.target.value })}>{Object.entries(ACT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="sm:col-span-2"><span className="label">ผู้รับผิดชอบ</span><select className="input" value={edit.staffingType} onChange={(e) => setEdit({ ...edit, staffingType: e.target.value, payable: e.target.value === "team" ? false : edit.payable })}><option value="individual">รายบุคคล</option><option value="team">ทั้งทีม (ใส่ทุกคนอัตโนมัติ)</option></select></label>
            {edit.staffingType === "individual" && <label className="sm:col-span-1"><span className="label">สูงสุด (คน)</span><input className="input" inputMode="numeric" value={edit.maxStaff ?? ""} onChange={(e) => setEdit({ ...edit, maxStaff: Number(e.target.value.replace(/\D/g, "")) || null })} /></label>}
            <label className="sm:col-span-1"><span className="label">สี</span><input type="color" className="input h-11 p-1" value={edit.color ?? "#3D5590"} onChange={(e) => setEdit({ ...edit, color: e.target.value })} /></label>
            <label className="flex items-center gap-2 sm:col-span-2"><input type="checkbox" className="h-5 w-5" checked={edit.payable} onChange={(e) => setEdit({ ...edit, payable: e.target.checked })} /> เบิกค่าตอบแทนได้ 💰</label>
            <label className="sm:col-span-2"><span className="label">อัตราภายใน</span><select className="input" value={edit.internalRateId ?? ""} onChange={(e) => setEdit({ ...edit, internalRateId: e.target.value ? Number(e.target.value) : null })}><option value="">— ไม่ระบุ —</option>{internalRates.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.perHourBaht} บ./ชม.)</option>)}</select></label>
            <label className="sm:col-span-2"><span className="label">อัตราภายนอก</span><select className="input" value={edit.externalRates?.["*"] ?? ""} onChange={(e) => setEdit({ ...edit, externalRates: e.target.value ? { ...(edit.externalRates ?? {}), "*": Number(e.target.value) } : null })}><option value="">— ไม่ระบุ —</option>{externalRates.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.perHourBaht} บ./ชม.)</option>)}</select></label>
            <label className="sm:col-span-3"><span className="label">วิทยากรหลายคน</span><select className="input" value={edit.splitMethod} onChange={(e) => setEdit({ ...edit, splitMethod: e.target.value })}>{Object.entries(SPLIT).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
            <label className="sm:col-span-3"><span className="label">ลำดับ</span><input className="input" inputMode="numeric" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value.replace(/\D/g, "")) || 0 })} /></label>
            {edit.staffingType === "individual" && (
              <fieldset className="sm:col-span-6">
                <legend className="label">ผู้รับผิดชอบประจำ (เติมให้ทุกรุ่นใหม่อัตโนมัติ)</legend>
                <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto">
                  {people.map((p) => {
                    const on = edit.defaultStaff.some((d) => (p.userId ? d.userId === p.userId : d.instructorId === p.instructorId));
                    return (
                      <label key={p.key} className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${on ? "border-navy bg-lime-soft" : "border-line bg-white"}`}>
                        <input type="checkbox" checked={on} onChange={(e) => setEdit({ ...edit, defaultStaff: e.target.checked ? [...edit.defaultStaff, p.userId ? { userId: p.userId } : { instructorId: p.instructorId! }] : edit.defaultStaff.filter((d) => (p.userId ? d.userId !== p.userId : d.instructorId !== p.instructorId)) })} />
                        {p.name} <span className={p.kind === "internal" ? "tag-navy px-1.5 py-0 text-xs" : "tag-orange px-1.5 py-0 text-xs"}>{p.kind === "internal" ? "ใน" : "นอก"}</span>
                      </label>
                    );
                  })}
                  {people.length === 0 && <p className="text-muted">ยังไม่มีวิทยากรในทะเบียน</p>}
                </div>
              </fieldset>
            )}
            <label className="flex items-center gap-2 sm:col-span-6"><input type="checkbox" className="h-5 w-5" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> ใช้งานอยู่</label>
          </div>
          <div className="flex gap-2"><button className="btn-primary" disabled={pending} onClick={save}><Save size={18} aria-hidden /> บันทึก</button><button className="btn-ghost" onClick={() => setEdit(null)}>ยกเลิก</button></div>
        </div>
      )}
    </section>
  );
}
