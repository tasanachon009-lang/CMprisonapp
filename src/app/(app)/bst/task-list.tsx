"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { Alert } from "@/components/ui";
import { formatThaiDate } from "@/lib/thai-date";
import { markTaskAction } from "../enrollments/actions";

type Row = { id: number; enrollmentId: number; name: string; inmateNo: string; cohort: string; system: string; step: string; dueDate: string; reason: string | null };

export function BstTaskList({ rows, today, canEdit }: { rows: Row[]; today: string; canEdit: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const markAll = () => start(async () => {
    let n = 0;
    for (const id of sel) if ((await markTaskAction(id, true)).ok) n++;
    setMsg(`บันทึก "ลงแล้ว" ${n} งาน`);
    setSel(new Set());
    router.refresh();
  });
  return (
    <div className="space-y-2">
      {msg && <Alert tone="ok">{msg}</Alert>}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-lime-soft px-4 py-2">
          <span>เลือก {sel.size} งาน</span>
          <button className="btn-ghost btn-sm" onClick={() => setSel(new Set(rows.map((r) => r.id)))}>เลือกทั้งหมด</button>
          <button className="btn-primary btn-sm" disabled={!sel.size || pending} onClick={markAll}><CheckCheck size={18} aria-hidden /> ลงแล้ว (วันนี้)</button>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="table-plain">
          <thead><tr>{canEdit && <th className="w-10" />}<th>ชื่อ-สกุล</th><th>รุ่น</th><th>ระบบ</th><th>ขั้นตอน</th><th>กำหนด</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                {canEdit && <td><input type="checkbox" className="h-5 w-5" checked={sel.has(r.id)} aria-label={`เลือก ${r.name} ${r.step}`} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSel(s); }} /></td>}
                <td><Link href={`/enrollments/${r.enrollmentId}`} className="font-medium hover:underline">{r.name}</Link><span className="block text-xs text-muted">{r.inmateNo}</span></td>
                <td className="text-sm">{r.cohort}</td>
                <td><span className="tag-navy">{r.system}</span></td>
                <td>{r.step}{r.reason && <span className="block text-xs text-muted">{r.reason}</span>}</td>
                <td><span className={r.dueDate < today ? "tag-danger" : r.dueDate === today ? "tag-warn" : "tag-muted"}>{formatThaiDate(r.dueDate)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
