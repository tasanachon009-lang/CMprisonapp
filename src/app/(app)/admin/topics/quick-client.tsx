"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Coins, X, UserPlus, Users } from "lucide-react";
import { Alert } from "@/components/ui";
import { quickTopicAction, quickInstructorAction } from "../pay-actions";

type Staff = { userId?: number; instructorId?: number };
type Topic = { id: number; name: string; hours: number | null; payable: boolean; team: boolean; staff: Staff[] };
type Person = { key: string; userId: number | null; instructorId: number | null; name: string; org: string };

const EXT_TYPES: Array<[string, string]> = [["gov", "หน่วยงานราชการ"], ["private", "เอกชน"], ["volunteer", "อาสาสมัคร"], ["civil", "ภาคประชาสังคม"]];
const same = (p: Person, s: Staff) => (p.userId ? s.userId === p.userId : s.instructorId === p.instructorId);

/** ตั้งค่าอย่างง่ายต่อหัวข้อ: เบิก/ไม่เบิก + ใครสอน (ชื่อและหน่วยงาน) — บันทึกทันทีเมื่อเลือก */
export function TopicQuickSetup({ topics, people, canAddInstructor }: { topics: Topic[]; people: Person[]; canAddInstructor: boolean }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [form, setForm] = useState<{ firstName: string; lastName: string; organization: string; externalType: "gov" | "private" | "volunteer" | "civil" }>({ firstName: "", lastName: "", organization: "", externalType: "gov" });
  const [pending, start] = useTransition();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) => start(async () => {
    const r = await fn();
    setMsg(r.ok ? null : r.error ?? "บันทึกไม่สำเร็จ กรุณาลองอีกครั้ง");
    if (r.ok) router.refresh();
  });
  const setStaff = (t: Topic, staff: Staff[] | "team") => run(() => quickTopicAction(t.id, { staff }));
  const pick = (t: Topic, v: string) => {
    if (v === "team") return setStaff(t, "team");
    if (v === "new") { setAdding(t.id); setForm({ firstName: "", lastName: "", organization: "", externalType: "gov" }); return; }
    const p = people.find((x) => x.key === v);
    if (p) setStaff(t, [...t.staff, p.userId ? { userId: p.userId } : { instructorId: p.instructorId! }]);
  };
  const saveNew = (t: Topic) => run(async () => {
    const r = await quickInstructorAction(form);
    if (!r.ok) return r;
    setAdding(null);
    return quickTopicAction(t.id, { staff: [...t.staff, { instructorId: r.data!.id }] });
  });

  const paid = topics.filter((t) => t.payable).length;
  return (
    <section className="card space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-xl">การเบิกและผู้สอนของแต่ละหัวข้อ</h2>
        <span className="tag-ok"><Coins size={14} aria-hidden /> เบิก {paid}</span>
        <span className="tag-muted">ไม่เบิก {topics.length - paid}</span>
      </div>
      {msg && <Alert tone="danger">{msg}</Alert>}
      <ul className="divide-y divide-line">
        {topics.map((t) => {
          const chosen = t.staff.map((s) => people.find((p) => same(p, s))).filter((p): p is Person => !!p);
          const rest = people.filter((p) => !t.staff.some((s) => same(p, s)));
          return (
            <li key={t.id} className="grid gap-3 py-3 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1.4fr)] lg:items-center">
              <p className="font-semibold">{t.name}{t.hours ? <span className="ml-2 font-normal text-muted">{t.hours} ชม.</span> : null}</p>
              <div className="inline-flex overflow-hidden rounded-full border border-line" role="group" aria-label={`การเบิกของ ${t.name}`}>
                {([[true, "เบิก"], [false, "ไม่เบิก"]] as const).map(([v, label]) => (
                  <button key={label} type="button" disabled={pending} aria-pressed={t.payable === v}
                    className={`min-h-11 min-w-20 px-4 font-semibold ${t.payable === v ? (v ? "bg-ok text-white" : "bg-ink text-white") : "bg-white hover:bg-lime-soft"}`}
                    onClick={() => t.payable !== v && run(() => quickTopicAction(t.id, { payable: v }))}>{label}</button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {t.team && <span className="tag-navy"><Users size={14} aria-hidden /> เจ้าหน้าที่ทั้งทีม</span>}
                {chosen.map((p) => (
                  <span key={p.key} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-white pl-3 pr-1">
                    <span>{p.name}<span className="ml-1 text-sm text-muted">{p.org}</span></span>
                    <button type="button" className="grid h-9 w-9 place-items-center rounded-full hover:bg-lime-soft" disabled={pending} aria-label={`เอา ${p.name} ออก`} onClick={() => setStaff(t, t.staff.filter((s) => !same(p, s)))}><X size={16} aria-hidden /></button>
                  </span>
                ))}
                <select className="input w-auto" value="" disabled={pending} aria-label={`เลือกผู้สอนของ ${t.name}`} onChange={(e) => pick(t, e.target.value)}>
                  <option value="">{t.team || chosen.length ? "+ เพิ่ม/เปลี่ยนผู้สอน" : "เลือกผู้สอน"}</option>
                  {!t.team && <option value="team">เจ้าหน้าที่ทั้งทีม</option>}
                  {rest.map((p) => <option key={p.key} value={p.key}>{p.name} — {p.org}</option>)}
                  {canAddInstructor && <option value="new">+ วิทยากรใหม่ (ใส่ชื่อและหน่วยงาน)</option>}
                </select>
              </div>
              {adding === t.id && (
                <div className="grid gap-3 rounded-2xl border border-line bg-cream p-4 sm:grid-cols-2 lg:col-span-3 lg:grid-cols-5">
                  <label><span className="label">ชื่อ</span><input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></label>
                  <label><span className="label">นามสกุล</span><input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></label>
                  <label><span className="label">หน่วยงาน</span><input className="input" placeholder="เช่น โรงพยาบาล… / สำนักงานสาธารณสุข…" value={form.organization} onChange={(e) => setForm({ ...form, organization: e.target.value })} /></label>
                  <label><span className="label">ประเภท</span><select className="input" value={form.externalType} onChange={(e) => setForm({ ...form, externalType: e.target.value as typeof form.externalType })}>{EXT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
                  <div className="flex items-end gap-2">
                    <button type="button" className="btn-primary" disabled={pending} onClick={() => saveNew(t)}><UserPlus size={18} aria-hidden /> เพิ่ม</button>
                    <button type="button" className="btn-ghost" onClick={() => setAdding(null)}>ยกเลิก</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
