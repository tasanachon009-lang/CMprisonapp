"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { NotebookPen } from "lucide-react";
import { Modal } from "./modal";
import { Alert } from "./ui";
import { ThaiDateInput } from "./thai-date-input";
import { addBehaviorNoteAction } from "@/app/(app)/enrollments/actions";
import { todayISO } from "@/lib/thai-date";

const CATS: Array<[string, string]> = [["helping", "ช่วยเหลือส่วนรวม"], ["fighting", "ทะเลาะวิวาท"], ["smoking", "สูบบุหรี่"], ["emotion", "อารมณ์"], ["participation", "การมีส่วนร่วม"], ["other", "อื่นๆ"]];

/** บันทึกพฤติกรรมด่วน: ข้อความสั้น + วันที่ + แท็ก (สเปก 22B) */
export function BehaviorNoteButton({ incarcerationId, enrollmentId, name, compact }: { incarcerationId: number; enrollmentId: number | null; name: string; compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ noteDate: todayISO(), tone: "observe" as "positive" | "negative" | "observe", category: "", text: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <button type="button" className={compact ? "rounded-full p-2 text-muted hover:bg-lime-soft" : "btn-ghost"} onClick={() => setOpen(true)} title={`บันทึกพฤติกรรม ${name}`} aria-label={`บันทึกพฤติกรรม ${name}`}>
        <NotebookPen size={compact ? 18 : 20} aria-hidden /> {!compact && "บันทึกพฤติกรรม"}
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title={`บันทึกพฤติกรรม: ${name}`}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {([["positive", "เชิงบวก"], ["negative", "เชิงลบ"], ["observe", "สังเกต"]] as const).map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, tone: v })} className={`min-h-11 rounded-full border px-4 font-semibold ${f.tone === v ? (v === "negative" ? "border-danger bg-danger text-white" : v === "positive" ? "border-ok bg-ok text-white" : "border-ink bg-ink text-white") : "border-line bg-white"}`}>{l}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            {CATS.map(([v, l]) => <button key={v} type="button" onClick={() => setF({ ...f, category: f.category === v ? "" : v })} className={f.category === v ? "tag-navy bg-navy text-white" : "tag-muted"}>{l}</button>)}
          </div>
          <label className="block"><span className="label">ข้อความ</span><textarea className="input" rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} autoFocus /></label>
          <div><span className="label">วันที่</span><ThaiDateInput value={f.noteDate} onChange={(v) => setF({ ...f, noteDate: v })} max={todayISO()} /></div>
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <button className="btn-ghost" onClick={() => setOpen(false)}>ยกเลิก</button>
            <button className="btn-primary" disabled={pending || !f.text.trim()} onClick={() => start(async () => {
              const r = await addBehaviorNoteAction({ incarcerationId, enrollmentId, noteDate: f.noteDate, tone: f.tone, category: f.category || null, text: f.text });
              if (!r.ok) return setError(r.error);
              setOpen(false);
              setF({ ...f, text: "", category: "" });
              router.refresh();
            })}>บันทึก</button>
          </div>
          <p className="hint">พฤติกรรมเชิงลบที่รุนแรง จะแปลงเป็นบันทึกวินัย/เครื่องมือบ้านได้เมื่อเปิดหลักสูตรชุมชนบำบัด (ขั้นที่ 5)</p>
        </div>
      </Modal>
    </>
  );
}
