"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui";
import {
  saveAllocationAction, deleteAllocationAction, saveLineAction, deleteLineAction, applyTemplateAction, copyLinesAction,
  recordExpenseAction, recordRefundAction, deleteExpenseAction, confirmOverrunAction,
} from "./actions";

type Msg = { tone: "ok" | "danger" | "warn"; text: string } | null;
type Res = { ok: boolean; error?: string; message?: string; code?: string };
const baht = (s: number) => (s / 100).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function useAct() {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<Res>, after?: (r: Res) => void) => start(async () => {
    setMsg(null);
    const r = await fn();
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "บันทึกแล้ว" } : { tone: r.code === "overrun" ? "warn" : "danger", text: r.error ?? "ทำรายการไม่สำเร็จ" });
    if (r.ok) router.refresh();
    after?.(r);
  });
  return { msg, setMsg, pending, run };
}

// ───────── การจัดสรร ─────────

export type AllocView = { id: number; fiscalYear: number; source: string; docNo: string | null; docDate: string | null; subject: string; courseId: number | null; amountSatang: number; targetPeople: number | null; targetCohorts: number | null; flexible: boolean; note: string | null };

export function AllocationForm({ fy, sources, courses, initial, onDone }: { fy: number; sources: Array<[string, string]>; courses: Array<{ id: number; name: string }>; initial?: AllocView; onDone?: () => void }) {
  const { msg, pending, run } = useAct();
  const [f, setF] = useState({
    source: initial?.source ?? sources[0]?.[0] ?? "", docNo: initial?.docNo ?? "", docDate: initial?.docDate ?? "", subject: initial?.subject ?? "", courseId: initial?.courseId ? String(initial.courseId) : "",
    amount: initial ? (initial.amountSatang / 100).toFixed(2) : "", targetPeople: initial?.targetPeople ? String(initial.targetPeople) : "", targetCohorts: initial?.targetCohorts ? String(initial.targetCohorts) : "",
    flexible: initial?.flexible ?? true, note: initial?.note ?? "",
  });
  const submit = () => run(() => saveAllocationAction(initial?.id ?? null, {
    fiscalYear: initial?.fiscalYear ?? fy, source: f.source, docNo: f.docNo || null, docDate: f.docDate || null, subject: f.subject, courseId: f.courseId ? Number(f.courseId) : null,
    amount: f.amount, targetPeople: f.targetPeople ? Number(f.targetPeople) : null, targetCohorts: f.targetCohorts ? Number(f.targetCohorts) : null, flexible: f.flexible, note: f.note || null,
  }), (r) => { if (r.ok) onDone?.(); });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-3">
        <label><span className="label">แหล่งเงิน</span><select className="input" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })}>{sources.map(([c, l]) => <option key={c} value={c}>{l}</option>)}</select></label>
        <label><span className="label">เลขที่หนังสือ</span><input className="input" value={f.docNo} maxLength={100} onChange={(e) => setF({ ...f, docNo: e.target.value })} placeholder="เช่น ยธ 0708.6/..." /></label>
        <label><span className="label">ลงวันที่</span><input type="date" className="input" value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} /></label>
        <label className="md:col-span-2"><span className="label">เรื่อง</span><input className="input" value={f.subject} maxLength={300} onChange={(e) => setF({ ...f, subject: e.target.value })} /></label>
        <label><span className="label">หลักสูตร (ไม่ระบุ = ใช้ได้ทุกหลักสูตร)</span><select className="input" value={f.courseId} onChange={(e) => setF({ ...f, courseId: e.target.value })}><option value="">ทุกหลักสูตร</option>{courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label><span className="label">จำนวนเงิน (บาท)</span><input className="input text-right" inputMode="decimal" value={f.amount} maxLength={20} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0.00" /></label>
        <label><span className="label">คนเป้าหมาย</span><input className="input" inputMode="numeric" value={f.targetPeople} onChange={(e) => setF({ ...f, targetPeople: e.target.value.replace(/\D/g, "") })} /></label>
        <label><span className="label">รุ่นเป้าหมาย</span><input className="input" inputMode="numeric" value={f.targetCohorts} onChange={(e) => setF({ ...f, targetCohorts: e.target.value.replace(/\D/g, "") })} /></label>
      </div>
      <fieldset className="flex flex-wrap gap-2">
        <legend className="label">เงื่อนไข</legend>
        {([[true, "ถัวเฉลี่ยได้"], [false, "ห้ามถัว"]] as const).map(([v, l]) => (
          <button key={l} type="button" onClick={() => setF({ ...f, flexible: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${f.flexible === v ? (v ? "border-ok bg-ok text-white" : "border-danger bg-danger text-white") : "border-line bg-white"}`}>{l}</button>
        ))}
      </fieldset>
      <label className="block"><span className="label">หมายเหตุ</span><input className="input" value={f.note} maxLength={500} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button type="button" className="btn-primary" disabled={pending} onClick={submit}>{pending ? "กำลังบันทึก..." : initial ? "บันทึกการแก้ไข" : "เพิ่มการจัดสรร"}</button>
    </div>
  );
}

export function EditAllocation(props: Parameters<typeof AllocationForm>[0] & { canDelete: boolean }) {
  const [open, setOpen] = useState(false);
  const { msg, pending, run } = useAct();
  if (!open) return <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(true)}>แก้</button>;
  return (
    <div className="mt-3 w-full rounded-2xl border border-line bg-cream p-3">
      <AllocationForm {...props} onDone={() => setOpen(false)} />
      <div className="mt-2 flex gap-2">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>ปิด</button>
        {props.canDelete && props.initial && <button type="button" className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { if (confirm("ยืนยันการลบการจัดสรรนี้")) run(() => deleteAllocationAction(props.initial!.id)); }}>ลบ</button>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

// ───────── งบของรุ่น ─────────

type AllocOpt = { id: number; label: string; flexible: boolean };
type ItemOpt = { code: string; label: string };
type FactorRow = { qty: string; unit: string };

export function LineForm({ cohortId, allocations, items, initial, onDone }: { cohortId: number; allocations: AllocOpt[]; items: ItemOpt[]; initial?: { id: number; allocationId: number; item: string; label: string | null; unitSatang: number; factors: Array<{ qty: number; unit: string }> }; onDone?: () => void }) {
  const { msg, pending, run } = useAct();
  const [f, setF] = useState({
    allocationId: String(initial?.allocationId ?? allocations[0]?.id ?? ""), item: initial?.item ?? items[0]?.code ?? "", label: initial?.label ?? "",
    unit: initial ? (initial.unitSatang / 100).toFixed(2) : "", factors: (initial?.factors.map((x) => ({ qty: String(x.qty), unit: x.unit })) ?? [{ qty: "1", unit: "คน" }]) as FactorRow[],
  });
  // ตัวอย่างยอด (แสดงเท่านั้น — ยอดจริงคำนวณที่เซิร์ฟเวอร์เป็นสตางค์จำนวนเต็ม)
  const preview = (() => {
    const u = Number(f.unit.replace(/,/g, ""));
    const p = f.factors.reduce((a, x) => a * Number(x.qty || 0), 1);
    return Number.isFinite(u * p) ? (u * p).toLocaleString("th-TH", { maximumFractionDigits: 2 }) : "-";
  })();
  const submit = () => run(() => saveLineAction(cohortId, initial?.id ?? null, { allocationId: Number(f.allocationId), item: f.item, label: f.label || null, unit: f.unit, factors: f.factors.map((x) => ({ qty: Number(x.qty), unit: x.unit })) }), (r) => { if (r.ok) onDone?.(); });
  if (!allocations.length) return <Alert tone="warn">ยังไม่มีการจัดสรรงบของปีงบนี้ กรุณาเพิ่มการจัดสรรที่เมนูงบประมาณ</Alert>;
  return (
    <div className="space-y-2">
      <div className="grid gap-2 md:grid-cols-3">
        <label><span className="label">แหล่งเงิน</span><select className="input" value={f.allocationId} onChange={(e) => setF({ ...f, allocationId: e.target.value })}>{allocations.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label><span className="label">รายการ</span><select className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>{items.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}</select></label>
        <label><span className="label">รายละเอียด (ไม่บังคับ)</span><input className="input" value={f.label} maxLength={200} onChange={(e) => setF({ ...f, label: e.target.value })} /></label>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">บาท/หน่วย</span><input className="input w-28 text-right" inputMode="decimal" value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })} placeholder="600" /></label>
        {f.factors.map((x, i) => (
          <span key={i} className="flex items-end gap-1">
            <span className="pb-3 text-lg">×</span>
            <label><span className="label">จำนวน</span><input className="input w-20 text-right" inputMode="decimal" value={x.qty} onChange={(e) => setF({ ...f, factors: f.factors.map((y, j) => (j === i ? { ...y, qty: e.target.value } : y)) })} /></label>
            <label><span className="label">หน่วย</span><input className="input w-20" value={x.unit} maxLength={20} onChange={(e) => setF({ ...f, factors: f.factors.map((y, j) => (j === i ? { ...y, unit: e.target.value } : y)) })} /></label>
            {f.factors.length > 1 && <button type="button" className="btn-ghost btn-sm" aria-label="เอาตัวคูณออก" onClick={() => setF({ ...f, factors: f.factors.filter((_, j) => j !== i) })}>×</button>}
          </span>
        ))}
        {f.factors.length < 4 && <button type="button" className="btn-ghost btn-sm" onClick={() => setF({ ...f, factors: [...f.factors, { qty: "1", unit: "" }] })}>+ ตัวคูณ</button>}
        <span className="pb-3 font-semibold">= {preview} บาท</span>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex gap-2"><button type="button" className="btn-primary btn-sm" disabled={pending} onClick={submit}>{pending ? "กำลังบันทึก..." : initial ? "บันทึก" : "เพิ่มรายการ"}</button>{onDone && <button type="button" className="btn-ghost btn-sm" onClick={onDone}>ยกเลิก</button>}</div>
    </div>
  );
}

export function LineRowActions(props: Parameters<typeof LineForm>[0] & { initial: NonNullable<Parameters<typeof LineForm>[0]["initial"]> }) {
  const [open, setOpen] = useState(false);
  const { msg, pending, run } = useAct();
  return (
    <>
      <span className="flex gap-1">
        <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(!open)}>แก้</button>
        <button type="button" className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { if (confirm("ยืนยันการลบรายการงบนี้")) run(() => deleteLineAction(props.cohortId, props.initial.id)); }}>ลบ</button>
      </span>
      {open && <div className="mt-2 w-full rounded-2xl border border-line bg-cream p-3"><LineForm {...props} onDone={() => setOpen(false)} /></div>}
      {msg && msg.tone !== "ok" && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </>
  );
}

export function TemplateForm({ cohortId, allocations, hasTemplate, prevCohorts }: { cohortId: number; allocations: AllocOpt[]; hasTemplate: boolean; prevCohorts: Array<{ id: number; label: string }> }) {
  const { msg, pending, run } = useAct();
  const [alloc, setAlloc] = useState(String(allocations[0]?.id ?? ""));
  const [people, setPeople] = useState("50");
  const [from, setFrom] = useState(String(prevCohorts[0]?.id ?? ""));
  if (!allocations.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <div className="flex flex-wrap items-end gap-2">
        <label><span className="label">แหล่งเงิน</span><select className="input w-auto" value={alloc} onChange={(e) => setAlloc(e.target.value)}>{allocations.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        {hasTemplate && <>
          <label><span className="label">จำนวนคนเป้าหมาย</span><input className="input w-24 text-right" inputMode="numeric" value={people} onChange={(e) => setPeople(e.target.value.replace(/\D/g, ""))} /></label>
          <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => applyTemplateAction(cohortId, Number(alloc), Number(people)))}>ใช้แม่แบบของหลักสูตร</button>
        </>}
        {prevCohorts.length > 0 && <>
          <label><span className="label">หรือคัดลอกจาก</span><select className="input w-auto" value={from} onChange={(e) => setFrom(e.target.value)}>{prevCohorts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
          <button type="button" className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => copyLinesAction(cohortId, Number(from), Number(alloc)))}>คัดลอกงบ</button>
        </>}
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}

// ───────── ใช้จ่ายจริง ─────────

export function ExpenseForm({ cohortId, allocations, items, today, canConfirm }: { cohortId: number; allocations: AllocOpt[]; items: ItemOpt[]; today: string; canConfirm: boolean }) {
  const { msg, setMsg, pending, run } = useAct();
  const spendable = items.filter((i) => !i.code.startsWith("compensation.speaker"));
  const [f, setF] = useState({ allocationId: String(allocations[0]?.id ?? ""), item: spendable[0]?.code ?? "", date: today, description: "", amount: "", docNo: "" });
  const [ask, setAsk] = useState(false);
  const [note, setNote] = useState("");
  const submit = (confirmNote?: string) => run(
    () => recordExpenseAction(cohortId, { allocationId: Number(f.allocationId), item: f.item, date: f.date, description: f.description, amount: f.amount, docNo: f.docNo || null }, confirmNote ?? null),
    (r) => { if (r.ok) { setF({ ...f, description: "", amount: "", docNo: "" }); setAsk(false); setNote(""); } else if (r.code === "overrun" && canConfirm) setAsk(true); },
  );
  if (!allocations.length) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line p-3">
      <div className="grid gap-2 md:grid-cols-3">
        <label><span className="label">วันที่</span><input type="date" className="input" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span className="label">แหล่งเงิน</span><select className="input" value={f.allocationId} onChange={(e) => setF({ ...f, allocationId: e.target.value })}>{allocations.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label><span className="label">หมวด/รายการ</span><select className="input" value={f.item} onChange={(e) => setF({ ...f, item: e.target.value })}>{spendable.map((i) => <option key={i.code} value={i.code}>{i.label}</option>)}</select></label>
        <label className="md:col-span-2"><span className="label">รายการ</span><input className="input" value={f.description} maxLength={300} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="เช่น อาหารว่าง 50 คน 3 วัน" /></label>
        <label><span className="label">จำนวนเงิน (บาท)</span><input className="input text-right" inputMode="decimal" value={f.amount} onChange={(e) => { setF({ ...f, amount: e.target.value }); setAsk(false); setMsg(null); }} /></label>
        <label><span className="label">เลขที่เอกสาร</span><input className="input" value={f.docNo} maxLength={100} onChange={(e) => setF({ ...f, docNo: e.target.value })} /></label>
      </div>
      <p className="hint">ค่าวิทยากรตัดงบอัตโนมัติจากรอบเบิกที่อนุมัติ</p>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {ask && (
        <div className="flex flex-wrap items-end gap-2 rounded-2xl border-2 border-danger/50 bg-danger/5 p-3">
          <label className="grow"><span className="label">เหตุผลที่ยืนยันใช้เกินงบ (จำเป็น)</span><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
          <button type="button" className="btn-primary" disabled={pending || !note.trim()} onClick={() => submit(note)}>ยืนยันและบันทึก</button>
        </div>
      )}
      <button type="button" className="btn-primary btn-sm" disabled={pending} onClick={() => submit()}>{pending ? "กำลังบันทึก..." : "บันทึกใช้จ่าย"}</button>
    </div>
  );
}

export function RefundForm({ cohortId, allocations, today }: { cohortId: number; allocations: Array<AllocOpt & { remaining: number }>; today: string }) {
  const { msg, pending, run } = useAct();
  const [f, setF] = useState({ allocationId: String(allocations[0]?.id ?? ""), date: today, amount: "", docNo: "" });
  const cur = allocations.find((a) => String(a.id) === f.allocationId);
  if (!allocations.length) return null;
  return (
    <details className="rounded-2xl border border-line p-3">
      <summary className="cursor-pointer font-semibold">บันทึกคืนเงินเหลือ</summary>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label><span className="label">แหล่งเงิน</span><select className="input w-auto" value={f.allocationId} onChange={(e) => setF({ ...f, allocationId: e.target.value })}>{allocations.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}</select></label>
        <label><span className="label">วันที่</span><input type="date" className="input w-auto" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></label>
        <label><span className="label">จำนวน (บาท)</span><input className="input w-32 text-right" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder={cur ? (Math.max(0, cur.remaining) / 100).toFixed(2) : ""} /></label>
        <label><span className="label">เลขที่เอกสาร</span><input className="input w-40" value={f.docNo} onChange={(e) => setF({ ...f, docNo: e.target.value })} /></label>
        <button type="button" className="btn-secondary btn-sm" disabled={pending} onClick={() => run(() => recordRefundAction(cohortId, { allocationId: Number(f.allocationId), date: f.date, amount: f.amount, docNo: f.docNo || null }))}>บันทึกคืนเงิน</button>
      </div>
      {cur && <p className="hint">คืนได้ไม่เกิน {baht(Math.max(0, cur.remaining))} บาท</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </details>
  );
}

export function DeleteExpense({ cohortId, id }: { cohortId: number; id: number }) {
  const { msg, pending, run } = useAct();
  return <>{msg && msg.tone !== "ok" && <span className="text-sm text-danger">{msg.text}</span>}<button type="button" className="btn-ghost btn-sm text-danger" disabled={pending} onClick={() => { if (confirm("ยืนยันการลบรายการนี้")) run(() => deleteExpenseAction(cohortId, id)); }}>ลบ</button></>;
}

export function ConfirmOverrun({ cohortId, allocationId, category, label, advance = false }: { cohortId: number; allocationId: number; category: string; label: string; advance?: boolean }) {
  const { msg, pending, run } = useAct();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [extra, setExtra] = useState("");
  if (!open) return <button type="button" className={advance ? "btn-ghost btn-sm" : "btn-primary btn-sm"} onClick={() => setOpen(true)}>{advance ? "ยืนยันล่วงหน้า" : "ยืนยันใช้เกินงบ"}</button>;
  return (
    <div className="mt-2 flex w-full flex-wrap items-end gap-2 rounded-2xl border border-line bg-white p-2">
      <span className="text-sm">{label}</span>
      {advance && <label><span className="label">ยอดที่อนุญาตให้เกินเพิ่ม (บาท)</span><input className="input w-32 text-right" inputMode="decimal" value={extra} onChange={(e) => setExtra(e.target.value)} /></label>}
      <label className="grow"><span className="label">เหตุผล (จำเป็น)</span><input className="input" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
      <button type="button" className="btn-primary btn-sm" disabled={pending || !note.trim()} onClick={() => run(() => confirmOverrunAction(cohortId, allocationId, category, note, extra || null), (r) => { if (r.ok) setOpen(false); })}>ยืนยัน</button>
      <button type="button" className="btn-ghost btn-sm" onClick={() => setOpen(false)}>ยกเลิก</button>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </div>
  );
}
