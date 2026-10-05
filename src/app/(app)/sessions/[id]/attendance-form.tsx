"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Users } from "lucide-react";
import { PersonThumb } from "@/components/person-thumb";
import { Alert, EmptyState } from "@/components/ui";
import { UndoToast } from "@/components/undo-toast";
import { ATTENDANCE_LABEL, CORRECTIONS_TYPES, type AttendanceStatus } from "@/lib/rules/attendance-rules";
import { saveAttendanceAction } from "../actions";
import { BehaviorNoteButton } from "@/components/behavior-note";
import { useAutosave } from "@/components/use-autosave";
import { DraftOffer, DraftSavedHint } from "@/components/draft-offer";

export type Row = {
  enrollmentId: number; incarcerationId: number; name: string; inmateNo: string; zone: string | null; thumb: string | null;
  duplicateName: boolean; draft: boolean; status: AttendanceStatus; correctionsType: string | null; note: string | null; saved: boolean;
};

const ORDER: AttendanceStatus[] = ["present", "absent", "leave", "sick", "corrections"];
const COLOR: Record<AttendanceStatus, string> = {
  present: "bg-ok text-white",
  absent: "bg-danger text-white",
  leave: "bg-warn-bg text-ink",
  sick: "bg-orange text-white",
  corrections: "bg-navy text-white",
};

/** เช็คชื่อ: ค่าเริ่มต้น "มา" ทั้งรุ่น แก้เฉพาะคนที่ไม่มา */
/** embedded = อยู่ในฟอร์ม "บันทึกและปิดคาบ" (ไม่มีปุ่มบันทึกของตัวเอง ส่งสถานะขึ้นไปทาง onRowsChange) */
export function AttendanceForm({ sessionId, rows: initial, loadedVersion, readOnly, canNote, embedded, onRowsChange }: { sessionId: number; rows: Row[]; loadedVersion: number; readOnly: boolean; canNote?: boolean; embedded?: boolean; onRowsChange?: (rows: Row[], version: number) => void }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [version, setVersion] = useState(loadedVersion);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ prev: Row[] } | null>(null);
  const [pending, start] = useTransition();
  const anySaved = initial.some((r) => r.saved);
  // ร่างอัตโนมัติ: เก็บเฉพาะเมื่อแก้แล้วยังไม่บันทึก (ล็อกหน้าจอ/ไม่ใช่ฉัน แล้วกลับมาทำต่อได้)
  const pick = (rs: Row[]) => rs.map((r) => ({ id: r.enrollmentId, s: r.status, c: r.correctionsType, n: r.note ?? null }));
  const dirty = JSON.stringify(pick(rows)) !== JSON.stringify(pick(initial));
  const autosave = useAutosave(`attendance:${sessionId}`, { version, rows: pick(rows) }, !readOnly && dirty);
  const [draftOffer, setDraftOffer] = useState<{ updatedAt: number; data: unknown } | null>(null);
  useEffect(() => {
    if (readOnly) return;
    autosave.load().then((d) => {
      if (!d) return;
      const data = d.data as { rows: ReturnType<typeof pick> };
      if (JSON.stringify(data.rows) !== JSON.stringify(pick(initial))) setDraftOffer(d);
      else void autosave.clear();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);
  const restore = () => {
    const data = draftOffer!.data as { rows: ReturnType<typeof pick> };
    const m = new Map(data.rows.map((x) => [x.id, x]));
    setRows((rs) => rs.map((r) => { const x = m.get(r.enrollmentId); return x ? { ...r, status: x.s, correctionsType: x.c, note: x.n } : r; }));
    setDraftOffer(null);
  };

  useEffect(() => {
    setRows(initial);
    setVersion(loadedVersion);
  }, [initial, loadedVersion]);

  useEffect(() => { onRowsChange?.(rows, version); }, [rows, version, onRowsChange]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of rows) c[r.status] = (c[r.status] ?? 0) + 1;
    return c;
  }, [rows]);

  const set = (id: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.enrollmentId === id ? { ...r, ...patch } : r)));

  const doSave = useCallback(
    (data: Row[], prev: Row[] | null) =>
      start(async () => {
        setError(null);
        const missing = data.find((r) => r.status === "corrections" && !r.correctionsType);
        if (missing) return setError(`กรุณาระบุประเภทเหตุราชทัณฑ์ของ ${missing.name}`);
        const noReason = data.find((r) => r.status === "corrections" && r.correctionsType === "other" && !r.note?.trim());
        if (noReason) return setError(`"เบิกตัวอื่นๆ" ต้องระบุเหตุในหมายเหตุ — ${noReason.name}`);
        const r = await saveAttendanceAction(
          sessionId,
          data.map((x) => ({ enrollmentId: x.enrollmentId, status: x.status, correctionsType: x.correctionsType, note: x.note })),
          version,
        );
        if (!r.ok) return setError(r.error);
        void autosave.clear();
        setToast(prev ? { prev } : null);
        router.refresh();
      }),
    [sessionId, version, router, autosave],
  );

  // Ctrl+S บันทึก
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !readOnly && !embedded) {
        e.preventDefault();
        doSave(rows, initial);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rows, initial, doSave, readOnly, embedded]);

  if (!rows.length) return <EmptyState title="ไม่มีรายชื่อที่ต้องเช็คในคาบนี้">อาจยังไม่มีผู้ลงทะเบียน หรือทุกคนออกจากเรือนจำ/ออกก่อนกำหนดก่อนวันนี้</EmptyState>;

  return (
    <div className={`space-y-3 ${embedded ? "" : "pb-24"}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="tag-muted"><Users size={16} aria-hidden /> ทั้งหมด {rows.length}</span>
        {ORDER.map((s) => (counts[s] ? <span key={s} className="tag-muted">{ATTENDANCE_LABEL[s]} {counts[s]}</span> : null))}
        {!readOnly && (
          <button className="btn-ghost btn-sm ml-auto" onClick={() => setRows((rs) => rs.map((r) => ({ ...r, status: "present", correctionsType: null })))}>ตั้งทุกคนเป็น &quot;มา&quot;</button>
        )}
      </div>
      {draftOffer && <DraftOffer savedAt={draftOffer.updatedAt} onRestore={restore} onDiscard={() => { void autosave.clear(); setDraftOffer(null); }} />}
      {!anySaved && !readOnly && <Alert tone="info">ทุกคนถูกตั้งเป็น &quot;มา&quot; ไว้แล้ว — แก้เฉพาะคนที่ไม่มา แล้วกด {embedded ? "\"บันทึกและปิดคาบ\" ด้านล่าง" : "\"บันทึก\" (Ctrl+S)"}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      <ul className="panel divide-y divide-line">
        {rows.map((r) => (
          <li key={r.enrollmentId} className={`flex flex-wrap items-center gap-3 px-3 py-2 ${r.status !== "present" ? "bg-lime-soft/60" : ""}`}>
            <PersonThumb name={r.name} thumb={r.thumb} inmateNo={r.inmateNo} zone={r.zone} />
            <div className="min-w-48 flex-1">
              <p className="font-medium">
                {r.name} {r.duplicateName && <span className="tag-orange ml-1">ชื่อซ้ำ</span>} {r.draft && <span className="tag-warn ml-1">ร่าง</span>}
              </p>
              <p className="text-sm text-muted">{r.inmateNo}{r.zone ? ` · ${r.zone}` : ""}</p>
            </div>
            {canNote && <BehaviorNoteButton compact incarcerationId={r.incarcerationId} enrollmentId={r.enrollmentId} name={r.name} />}
            <div role="radiogroup" aria-label={`สถานะของ ${r.name}`} className="flex flex-wrap gap-1">
              {ORDER.map((s) => (
                <button
                  key={s} type="button" role="radio" aria-checked={r.status === s} disabled={readOnly}
                  onClick={() => set(r.enrollmentId, { status: s, correctionsType: s === "corrections" ? r.correctionsType : null })}
                  className={`min-h-11 rounded-full border px-3 text-sm font-semibold transition ${r.status === s ? `${COLOR[s]} border-transparent` : "border-line bg-white hover:bg-cream"} disabled:cursor-default`}
                >
                  {ATTENDANCE_LABEL[s]}
                </button>
              ))}
            </div>
            {r.status === "corrections" && (
              <select
                value={r.correctionsType ?? ""} disabled={readOnly} aria-label="ประเภทเหตุราชทัณฑ์"
                onChange={(e) => set(r.enrollmentId, { correctionsType: e.target.value || null })}
                className={`input w-auto ${!r.correctionsType ? "input-error" : ""}`}
              >
                <option value="">— ระบุเหตุ —</option>
                {Object.entries(CORRECTIONS_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            {r.status !== "present" && (
              <input
                className={`input w-full sm:w-56 ${r.correctionsType === "other" && r.status === "corrections" && !r.note?.trim() ? "input-error" : ""}`}
                placeholder={r.status === "corrections" && r.correctionsType === "other" ? "ระบุเหตุที่เบิกตัว (จำเป็น)" : "หมายเหตุ (ถ้ามี)"} value={r.note ?? ""} disabled={readOnly}
                onChange={(e) => set(r.enrollmentId, { note: e.target.value })} aria-label={`หมายเหตุของ ${r.name}`}
              />
            )}
          </li>
        ))}
      </ul>

      {!readOnly && !embedded && (
        <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl items-center justify-end gap-3">
            <span className="mr-auto"><DraftSavedHint savedAt={dirty ? autosave.savedAt : null} /></span>
            <span className="text-sm text-muted">เหตุราชทัณฑ์ไม่นับเป็นขาด และไม่หัก % การเข้าร่วม</span>
            <button className="btn-primary" disabled={pending} onClick={() => doSave(rows, anySaved ? initial : null)}>
              <Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึกการเช็คชื่อ"}
            </button>
          </div>
        </div>
      )}

      {toast && (
        <UndoToast
          message="บันทึกการเช็คชื่อแล้ว"
          onUndo={toast.prev ? () => { const p = toast.prev; setToast(null); doSave(p, null); } : undefined}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
