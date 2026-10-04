"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { addDays, formatThaiDate } from "@/lib/thai-date";
import { markTasksAction } from "../enrollments/actions";

type Row = { id: number; enrollmentId: number; name: string; inmateNo: string; cohort: string; step: string | null; dueDate: string; reason: string | null };

/** รายการงานค้าง (ใช้ทั้ง บสต. และ รท.101) — ติ๊กทีละหลายคนแล้วกด "ลง … แล้ว" */
export function BstTaskList({ rows, today, canEdit, doneLabel }: { rows: Row[]; today: string; canEdit: boolean; doneLabel: string }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [date, setDate] = useState(today);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const showStep = rows.some((r) => r.step);
  const markAll = () => start(async () => {
    const r = await markTasksAction(Array.from(sel), date);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    const d = r.data ?? { done: 0, errors: [] };
    setMsg({ tone: d.errors.length ? "danger" : "ok", text: `บันทึก "${doneLabel}" ${d.done} รายการ${d.errors.length ? ` · ไม่สำเร็จ ${d.errors.length} รายการ: ${d.errors[0]}` : ""}` });
    setSel(new Set());
    router.refresh();
  });
  const allSelected = rows.length > 0 && sel.size === rows.length;
  return (
    <div className="space-y-2">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {canEdit && (
        <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-lime-soft px-4 py-2">
          <span className="self-center">เลือก {sel.size} รายการ</span>
          <button className="btn-ghost btn-sm self-center" onClick={() => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)))}>{allSelected ? "ไม่เลือกทั้งหมด" : "เลือกทั้งหมด"}</button>
          <div className="w-52"><span className="label">วันที่ลงในระบบ</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
          <button className="btn-primary" disabled={!sel.size || !date || pending} onClick={markAll}><CheckCheck size={20} aria-hidden /> {doneLabel}</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table-plain">
          <thead><tr>{canEdit && <th className="w-10" />}<th>ชื่อ-สกุล</th><th>รุ่น</th>{showStep && <th>ขั้นตอน</th>}<th>ครบกำหนด</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {canEdit && <td><input type="checkbox" className="h-5 w-5" checked={sel.has(r.id)} aria-label={`เลือก ${r.name} ${r.step ?? ""}`} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSel(s); }} /></td>}
                <td><Link href={`/enrollments/${r.enrollmentId}`} className="font-medium hover:underline">{r.name}</Link><span className="block text-xs text-muted">{r.inmateNo}</span></td>
                <td className="text-sm">{r.cohort}</td>
                {showStep && <td>{r.step}{r.reason && <span className="block text-xs text-muted">{r.reason}</span>}</td>}
                <td>
                  <span className={r.dueDate < today ? "tag-danger" : r.dueDate <= addDays(today, 7) ? "tag-warn" : "tag-ok"}>{r.dueDate < today ? "เลยกำหนด " : ""}{formatThaiDate(r.dueDate)}</span>
                  {!showStep && r.reason && <span className="block text-xs text-muted">{r.reason}</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
