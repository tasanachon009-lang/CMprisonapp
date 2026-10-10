"use client";

import { useState, useTransition } from "react";
import { Download, FileCheck2, Upload } from "lucide-react";
import { Alert } from "@/components/ui";
import { previewImport, commitImport, type PreviewRow } from "./actions";

const CAT: Record<string, { label: string; tag: string }> = {
  ok: { label: "ลงได้", tag: "tag-ok" },
  returnee: { label: "กลับมาต้องโทษซ้ำ (ลงได้)", tag: "tag-warn" },
  blocked: { label: "ซ้ำ (บล็อก)", tag: "tag-danger" },
  possible_same: { label: "อาจเป็นคนเดียวกัน", tag: "tag-orange" },
  invalid: { label: "ข้อมูลผิดรูปแบบ", tag: "tag-danger" },
};

export function ImportForm({ cohorts, defaultCohort }: { cohorts: Array<{ id: number; label: string; closed: boolean }>; defaultCohort?: number }) {
  const [cohortId, setCohortId] = useState(String(defaultCohort ?? ""));
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{ token: string; rows: PreviewRow[] } | null>(null);
  const [filter, setFilter] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);
  const [pending, start] = useTransition();

  const check = () => start(async () => {
    setError(null);
    setDone(null);
    const fd = new FormData();
    fd.append("cohortId", cohortId);
    if (file) fd.append("file", file);
    const r = await previewImport(fd);
    if (!r.ok) return setError(r.error);
    setPreview(r.data!);
  });

  const commit = () => start(async () => {
    const r = await commitImport(preview!.token);
    if (!r.ok) return setError(r.error);
    setDone(r.data!.imported);
  });

  const counts = preview ? Object.fromEntries(Object.keys(CAT).map((k) => [k, preview.rows.filter((r) => r.category === k).length])) : {};
  const passing = (counts.ok ?? 0) + (counts.returnee ?? 0);
  const failing = preview ? preview.rows.length - passing : 0;
  const shown = preview?.rows.filter((r) => !filter || r.category === filter) ?? [];

  return (
    <div className="space-y-4">
      <section className="card grid gap-4 sm:grid-cols-3">
        <label><span className="label">1. เลือกรุ่น</span>
          <select className="input" value={cohortId} onChange={(e) => { setCohortId(e.target.value); setPreview(null); }}>
            <option value="">— เลือกรุ่น —</option>
            {cohorts.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2"><span className="label">2. เลือกไฟล์ Excel (.xlsx)</span>
          <input type="file" accept=".xlsx" className="input py-2" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setPreview(null); }} />
        </label>
        <div className="sm:col-span-3"><button className="btn-primary" onClick={check} disabled={pending || !cohortId || !file}><FileCheck2 size={20} aria-hidden /> {pending && !preview ? "กำลังตรวจ..." : "ตรวจไฟล์"}</button></div>
      </section>

      {error && <Alert tone="danger">{error}</Alert>}
      {done != null && <Alert tone="ok">นำเข้าแล้ว {done} แถว{failing ? ` · ไม่ผ่าน ${failing} แถว` : ""}</Alert>}

      {preview && done == null && (
        <section className="card space-y-3">
          <h2 className="text-xl">3. ผลตรวจ {preview.rows.length} แถว</h2>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setFilter("")} className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${!filter ? "bg-ink text-white" : "border border-line bg-white"}`}>ทั้งหมด</button>
            {Object.entries(CAT).map(([k, v]) => counts[k] ? (
              <button key={k} onClick={() => setFilter(k)} className={`inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold ${filter === k ? "bg-ink text-white" : "border border-line bg-white"}`}>{v.label} ({counts[k]})</button>
            ) : null)}
          </div>
          <div className="max-h-[50vh] overflow-auto rounded-2xl border border-line">
            <table className="table-plain">
              <thead><tr><th>แถว</th><th>เลขประจำตัว</th><th>ชื่อ-สกุล</th><th>สถานะในไฟล์</th><th>ผลตรวจ</th><th>เหตุผล</th></tr></thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={r.rowNo}>
                    <td>{r.rowNo}</td><td className="font-mono">{r.inmateNo}</td><td>{r.prefix}{r.firstName} {r.lastName}</td><td>{r.status || "กำลังอบรม"}</td>
                    <td><span className={CAT[r.category].tag}>{CAT[r.category].label}</span></td>
                    <td className="text-sm">{r.reasons.join(" / ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-3">
            <button className="btn-primary" onClick={commit} disabled={pending || !passing}><Upload size={20} aria-hidden /> นำเข้า {passing} แถวที่ผ่าน</button>
            {failing > 0 && <a href={`/api/import/failed/${preview.token}`} className="btn-ghost"><Download size={20} aria-hidden /> ดาวน์โหลดแถวที่ไม่ผ่าน ({failing}) พร้อมเหตุผล</a>}
          </div>
          <p className="text-sm text-muted">แถว &quot;อาจเป็นคนเดียวกัน&quot; ต้องลงทะเบียนรายคนเพื่อยืนยัน</p>
        </section>
      )}
    </div>
  );
}
