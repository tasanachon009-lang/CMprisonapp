"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ThaiDateInput } from "@/components/thai-date-input";
import { Alert } from "@/components/ui";
import { formatThaiDate } from "@/lib/thai-date";
import { createCohortAction, previewCohortDates } from "../actions";

export function NewCohortForm({ courseId, suggestedNumber, fiscalYear, locations, sources = [] }: { courseId: number; courseCode: string; suggestedNumber: number; fiscalYear: number; locations: string[]; sources?: Array<{ id: number; label: string }> }) {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [number, setNumber] = useState(String(suggestedNumber));
  const [target, setTarget] = useState("40");
  const [location, setLocation] = useState(locations[0] ?? "");
  const [copyFrom, setCopyFrom] = useState("");
  const [preview, setPreview] = useState<{ days: string[]; endLabel: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    if (!startDate) return setPreview(null);
    previewCohortDates(courseId, startDate).then((r) => (r.ok ? setPreview(r.data!) : setError(r.error)));
  }, [startDate, courseId]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    start(async () => {
      const r = await createCohortAction({ courseId, number: Number(number), startDate, targetCount: Number(target) || undefined, location, copyFromCohortId: copyFrom ? Number(copyFrom) : undefined });
      if (r.ok) router.push(`/cohorts/${r.data!.id}`);
      else setError(r.error);
    });
  };

  return (
    <form onSubmit={submit} className="card space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="number">เลขรุ่น</label>
          <input id="number" className="input" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value.replace(/\D/g, ""))} required />
          <p className="hint">ปีงบประมาณคำนวณจากวันเริ่ม (ปัจจุบัน {fiscalYear})</p>
        </div>
        <div>
          <label className="label" htmlFor="start">วันเริ่มอบรม</label>
          <ThaiDateInput id="start" value={startDate} onChange={setStartDate} required />
        </div>
        <div>
          <label className="label" htmlFor="target">จำนวนคนเป้าหมาย</label>
          <input id="target" className="input" inputMode="numeric" value={target} onChange={(e) => setTarget(e.target.value.replace(/\D/g, ""))} />
        </div>
        <div>
          <label className="label" htmlFor="loc">สถานที่หลัก</label>
          <input id="loc" className="input" list="locations" value={location} onChange={(e) => setLocation(e.target.value)} />
          <datalist id="locations">{locations.map((l) => <option key={l} value={l} />)}</datalist>
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="copy">ตารางกิจกรรม</label>
          <select id="copy" className="input" value={copyFrom} onChange={(e) => setCopyFrom(e.target.value)}>
            <option value="">สร้างจากแม่แบบหลักสูตร</option>
            {sources.map((s) => <option key={s.id} value={s.id}>คัดลอกจาก {s.label} — หัวข้อ เวลา สถานที่ และวิทยากร</option>)}
          </select>
          <p className="hint">ไม่คัดลอกคาบที่ยกเลิกและคาบชดเชย</p>
        </div>
      </div>

      {preview && (
        <Alert tone="info">
          <p className="font-semibold">อบรม {preview.days.length} วัน — สิ้นสุด{preview.endLabel}</p>
          <p className="mt-1 text-sm text-muted">ข้ามเสาร์-อาทิตย์และวันหยุดราชการ:</p>
          <p className="mt-1 text-sm">{preview.days.map((d, i) => `วันที่ ${i + 1}: ${formatThaiDate(d)}`).join(" · ")}</p>
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary" disabled={pending || !startDate}>{pending ? "กำลังสร้าง..." : "สร้างรุ่นและตารางกิจกรรม"}</button>
    </form>
  );
}
