"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, GraduationCap } from "lucide-react";
import { ThaiDateInput } from "@/components/thai-date-input";
import { completeEnrollmentsAction } from "@/app/(app)/enrollments/actions";
import { PersonThumb } from "@/components/person-thumb";
import { Alert, EmptyState } from "@/components/ui";
import { confirmAdmissionsAction } from "../../actions";

export type RosterRow = {
  enrollmentId: number; personId: number; name: string; inmateNo: string; zone: string | null;
  thumb: string | null; photo: string | null; status: string; statusLabel: string;
  consentSigned: boolean; consentRefused: boolean; pct: number | null; sessions: string; below: boolean;
  otherCourses: string[]; isReturnee: boolean; duplicateName: boolean; released: boolean; override: boolean;
};

const STATUS_TAG: Record<string, string> = { draft: "tag-warn", active: "tag-ok", completed: "tag-navy", dropped: "tag-danger", withdrawn: "tag-muted", failed: "tag-danger" };

export function RosterTable({ rows, cohortId, canEdit, passPct, defaultDoneDate }: { rows: RosterRow[]; cohortId: number; canEdit: boolean; passPct: number; defaultDoneDate: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const drafts = rows.filter((r) => r.status === "draft");
  const actives = rows.filter((r) => r.status === "active");
  const selectable = canEdit && (drafts.length > 0 || actives.length > 0);
  const [doneDate, setDoneDate] = useState(defaultDoneDate);
  const complete = (status: "completed" | "failed") =>
    start(async () => {
      const ids = [...selected].filter((id) => actives.some((a) => a.enrollmentId === id));
      const r = await completeEnrollmentsAction(cohortId, ids, status, doneDate);
      if (!r.ok) return setMsg({ tone: "danger", text: r.error });
      const below = actives.filter((a) => ids.includes(a.enrollmentId) && a.below).length;
      setMsg({ tone: r.data!.skipped.length || below ? "warn" : "ok", text: `บันทึก "${status === "completed" ? "ครบหลักสูตร" : "ไม่ผ่าน"}" แล้ว ${r.data!.done} คน${below ? ` · มี ${below} คนที่การเข้าร่วมต่ำกว่าเกณฑ์` : ""}${status === "completed" ? " · สร้างกำหนดการติดตามแล้ว" : ""}` });
      setSelected(new Set());
      router.refresh();
    });

  const toggle = (id: number) => {
    const s = new Set(selected);
    if (s.has(id)) s.delete(id);
    else s.add(id);
    setSelected(s);
  };

  const confirm = () =>
    start(async () => {
      const r = await confirmAdmissionsAction(cohortId, [...selected]);
      if (!r.ok) return setMsg({ tone: "danger", text: r.error });
      const d = r.data!;
      setMsg({ tone: d.skipped.length ? "warn" : "ok", text: `ยืนยันรับเข้าแล้ว ${d.done} คน${d.skipped.length ? ` · ข้าม ${d.skipped.length} คน (ยังไม่มีหลักฐานยินยอม หรือไม่ใช่สถานะร่าง)` : ""}` });
      setSelected(new Set());
      router.refresh();
    });

  if (!rows.length) return <EmptyState title="ไม่มีรายชื่อตามตัวกรองนี้" />;

  return (
    <div className="space-y-3">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      {selectable && (
        <div className="no-print flex flex-wrap items-center gap-2 rounded-2xl bg-lime-soft px-4 py-2">
          <span>เลือกแล้ว {selected.size} คน</span>
          {drafts.length > 0 && <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set(drafts.map((d) => d.enrollmentId)))}>เลือกทุกคนที่เป็นร่าง ({drafts.length})</button>}
          {drafts.length > 0 && <button className="btn-primary btn-sm" disabled={![...selected].some((id) => drafts.some((d) => d.enrollmentId === id)) || pending} onClick={confirm}><CheckCheck size={18} aria-hidden /> ยืนยันรับเข้า</button>}
          {actives.length > 0 && <button className="btn-ghost btn-sm" onClick={() => setSelected(new Set(actives.map((d) => d.enrollmentId)))}>เลือกทุกคนที่กำลังอบรม ({actives.length})</button>}
          {actives.length > 0 && (
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm">วันที่จบ</span>
              <span className="w-56"><ThaiDateInput value={doneDate} onChange={setDoneDate} /></span>
              <button className="btn-secondary btn-sm" disabled={![...selected].some((id) => actives.some((a) => a.enrollmentId === id)) || pending} onClick={() => complete("completed")}><GraduationCap size={18} aria-hidden /> ครบหลักสูตร</button>
              <button className="btn-ghost btn-sm" disabled={![...selected].some((id) => actives.some((a) => a.enrollmentId === id)) || pending} onClick={() => complete("failed")}>ไม่ผ่าน</button>
            </span>
          )}
        </div>
      )}
      <div className="panel overflow-x-auto">
        <table className="table-plain">
          <thead>
            <tr>
              {selectable && <th className="w-10"><span className="sr-only">เลือก</span></th>}
              <th>ชื่อ-สกุล</th>
              <th>เลขประจำตัว</th>
              <th>แดน</th>
              <th>สถานะ</th>
              <th>เข้าร่วม</th>
              <th>ประวัติ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.enrollmentId}>
                {selectable && (
                  <td>{(r.status === "draft" || r.status === "active") && <input type="checkbox" className="h-5 w-5" checked={selected.has(r.enrollmentId)} onChange={() => toggle(r.enrollmentId)} aria-label={`เลือก ${r.name}`} />}</td>
                )}
                <td>
                  <div className="flex items-center gap-2">
                    <PersonThumb name={r.name} thumb={r.thumb} photo={r.photo} inmateNo={r.inmateNo} zone={r.zone} />
                    <Link href={`/enrollments/${r.enrollmentId}`} className="font-medium hover:underline">{r.name}</Link>
                    {r.duplicateName && <span className="tag-orange">ชื่อซ้ำ</span>}
                  </div>
                </td>
                <td className="font-mono">{r.inmateNo}</td>
                <td>{r.zone ?? "-"}</td>
                <td>
                  <span className={STATUS_TAG[r.status] ?? "tag-muted"}>{r.statusLabel}</span>
                  {r.status === "draft" && !r.consentSigned && <span className="tag-warn ml-1">{r.consentRefused ? "ไม่ยินยอม" : "ยังไม่มีหลักฐานยินยอม"}</span>}
                  {r.released && <span className="tag-muted ml-1">ออกจากเรือนจำแล้ว</span>}
                </td>
                <td>
                  {r.pct == null ? <span className="text-muted">-</span> : (
                    <span className={r.below ? "font-semibold text-danger" : ""} title={`มา ${r.sessions} คาบ (เกณฑ์ ${passPct}%)`}>
                      {r.pct}% <span className="text-sm text-muted">({r.sessions})</span>
                    </span>
                  )}
                </td>
                <td className="space-x-1">
                  {r.isReturnee && <span className="tag-warn">กลับมาต้องโทษซ้ำ</span>}
                  {r.override && <span className="tag-danger" title="ผู้ดูแลปลดล็อกการลงซ้ำ">ปลดล็อกลงซ้ำ</span>}
                  {r.otherCourses.map((c) => <span key={c} className="tag-navy">เคยผ่าน {c}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
