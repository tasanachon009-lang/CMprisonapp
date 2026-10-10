"use client";

import { HelpButton } from "@/components/help-button";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useAutosave } from "@/components/use-autosave";
import { DraftOffer, DraftSavedHint } from "@/components/draft-offer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save } from "lucide-react";
import { PersonThumb } from "@/components/person-thumb";
import { Alert } from "@/components/ui";
import { saveAttendanceAction } from "@/app/(app)/sessions/actions";
import type { AttendanceStatus } from "@/lib/rules/attendance-rules";

type Person = { enrollmentId: number; name: string; inmateNo: string; zone: string | null; thumb: string | null; duplicateName: boolean };
type Sess = { id: number; title: string; time: string; version: number; members: number[]; values: Record<number, { status: string; correctionsType: string | null; note: string | null }> };

/** รหัสแป้นพิมพ์ (ช่องว่าง = มา) */
const CODES: Record<string, { status: AttendanceStatus; corrections?: string; label: string }> = {
  "1": { status: "present", label: "มา" },
  "2": { status: "absent", label: "ขาด" },
  "3": { status: "leave", label: "ลา" },
  "4": { status: "sick", label: "ป่วย" },
  "5": { status: "corrections", corrections: "court", label: "ไปศาล" },
  "6": { status: "corrections", corrections: "lawyer", label: "พบทนาย" },
  "7": { status: "corrections", corrections: "outside_hospital", label: "ออก รพ." },
  "8": { status: "corrections", corrections: "other", label: "เบิกตัวอื่น" },
};
const toCode = (v?: { status: string; correctionsType: string | null }) => {
  if (!v) return "";
  const e = Object.entries(CODES).find(([, c]) => c.status === v.status && (c.status !== "corrections" || c.corrections === v.correctionsType));
  return e && e[0] !== "1" ? e[0] : "";
};

export function QuickGrid({ cohortId, date, dates, sessions, people }: { cohortId: number; date: string; dates: Array<{ value: string; label: string; checked: boolean }>; sessions: Sess[]; people: Person[] }) {
  const router = useRouter();
  const [grid, setGrid] = useState<Record<string, string>>(() => {
    const g: Record<string, string> = {};
    for (const s of sessions) for (const p of people) g[`${p.enrollmentId}:${s.id}`] = toCode(s.values[p.enrollmentId]);
    return g;
  });
  // หมายเหตุเดิมต้องไม่หายเมื่อบันทึกจากหน้านี้ · รหัส 8 (เบิกตัวอื่นๆ) ต้องระบุเหตุ
  const [notes, setNotes] = useState<Record<string, string>>(() => {
    const n: Record<string, string> = {};
    for (const s of sessions) for (const [eid, v] of Object.entries(s.values)) if (v.note) n[`${eid}:${s.id}`] = v.note;
    return n;
  });
  const [fromKit, setFromKit] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const refs = useRef<Record<string, HTMLInputElement | null>>({});

  const invalid = Object.entries(grid).filter(([, v]) => v && !CODES[v]);
  // ร่างอัตโนมัติ (ทุก 30 วินาที/ก่อนล็อกหน้าจอ) — แยกตามวันที่
  const initialGrid = useMemo(() => {
    const g: Record<string, string> = {};
    for (const s of sessions) for (const p of people) g[`${p.enrollmentId}:${s.id}`] = toCode(s.values[p.enrollmentId]);
    return JSON.stringify(g);
  }, [sessions, people]);
  const dirty = JSON.stringify(grid) !== initialGrid;
  const autosave = useAutosave(`attendance-grid:${cohortId}:${date}`, { grid, notes }, dirty);
  const [draftOffer, setDraftOffer] = useState<{ updatedAt: number; data: unknown } | null>(null);
  useEffect(() => {
    autosave.load().then((d) => { if (d) setDraftOffer(d); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date]);

  const focus = (pi: number, si: number) => {
    const p = people[pi], s = sessions[si];
    if (p && s) refs.current[`${p.enrollmentId}:${s.id}`]?.focus();
  };

  const onKey = (e: React.KeyboardEvent, pi: number, si: number) => {
    if (e.key === "Enter" || e.key === "ArrowDown") { e.preventDefault(); focus(pi + 1, si); }
    if (e.key === "ArrowUp") { e.preventDefault(); focus(pi - 1, si); }
    if (e.key === "ArrowRight" && (e.target as HTMLInputElement).selectionStart === (e.target as HTMLInputElement).value.length) focus(pi, si + 1);
    if (e.key === "ArrowLeft" && (e.target as HTMLInputElement).selectionStart === 0) focus(pi, si - 1);
  };

  // วางจาก Excel ได้ทั้งแผ่น
  const onPaste = (e: React.ClipboardEvent, pi: number, si: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\n") && !text.includes("\t")) return;
    e.preventDefault();
    const lines = text.replace(/\r/g, "").split("\n").filter((l, i, a) => l !== "" || i < a.length - 1);
    const g = { ...grid };
    lines.forEach((line, dy) => line.split("\t").forEach((v, dx) => {
      const p = people[pi + dy], s = sessions[si + dx];
      if (p && s && s.members.includes(p.enrollmentId)) g[`${p.enrollmentId}:${s.id}`] = v.trim() === "1" ? "" : v.trim();
    }));
    setGrid(g);
  };

  const save = () =>
    start(async () => {
      setMsg(null);
      if (invalid.length) return setMsg({ tone: "danger", text: `มีช่องที่รหัสไม่ถูกต้อง ${invalid.length} ช่อง (สีแดง) — ใช้ตัวเลข 1–8 หรือเว้นว่าง` });
      const noReason = Object.entries(grid).filter(([k, v]) => v === "8" && !notes[k]?.trim());
      if (noReason.length) return setMsg({ tone: "danger", text: `รหัส 8 (เบิกตัวอื่นๆ) ต้องระบุเหตุในช่องใต้รหัส — ยังไม่ระบุ ${noReason.length} ช่อง` });
      let created = 0, updated = 0;
      for (const s of sessions) {
        const entries = s.members.map((eid) => {
          const c = CODES[grid[`${eid}:${s.id}`] || "1"];
          // ไม่ใช่ "มา" = คงหมายเหตุเดิมไว้ · กลับเป็น "มา" = ล้างหมายเหตุ (เหมือนหน้าเช็คชื่อ)
          return { enrollmentId: eid, status: c.status, correctionsType: c.corrections ?? null, note: c.status === "present" ? null : notes[`${eid}:${s.id}`]?.trim() || null };
        });
        const r = await saveAttendanceAction(s.id, entries, s.version, fromKit ? "emergency_kit" : "quick_entry");
        if (!r.ok) return setMsg({ tone: "danger", text: `${s.title}: ${r.error}` });
        created += r.data!.created;
        updated += r.data!.updated;
      }
      void autosave.clear();
      setMsg({ tone: "ok", text: `บันทึกแล้ว ${sessions.length} คาบ (ใหม่ ${created} · แก้ไข ${updated})` });
      router.refresh();
    });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="d" className="font-semibold">วันที่</label>
        <select id="d" className="input w-auto" value={date} onChange={(e) => router.push(`?date=${e.target.value}`)}>
          {dates.map((d) => <option key={d.value} value={d.value}>{d.label}{d.checked ? " ✓" : " (ยังไม่เช็ค)"}</option>)}
        </select>
        <Link href={`/cohorts/${cohortId}/attendance`} className="btn-ghost btn-sm">กลับ</Link>
        <label className="ml-auto inline-flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={fromKit} onChange={(e) => setFromKit(e.target.checked)} /> กรอกย้อนหลังจากชุดกระดาษฉุกเฉิน</label>
      </div>
      <Alert tone="info">
        <p><b>ช่องว่าง = มา</b> · 2 ขาด · 3 ลา · 4 ป่วย · 5 ไปศาล · 6 พบทนาย · 7 ออก รพ.ภายนอก · 8 เบิกตัวอื่นๆ</p>
        <p className="text-sm text-muted">Enter/ลูกศรลง = คนถัดไป · ลูกศรซ้าย-ขวา = คาบถัดไป · วางข้อมูลจาก Excel ได้ <HelpButton>คัดลอกจาก Excel แล้ววางได้ทั้งแผ่น หน้านี้ไม่ใช้ Ctrl+S ให้กดปุ่มบันทึก</HelpButton></p>
      </Alert>
      {draftOffer && <DraftOffer savedAt={draftOffer.updatedAt} onRestore={() => { const d = draftOffer.data as { grid: typeof grid; notes: typeof notes }; setGrid(d.grid); setNotes(d.notes ?? {}); setDraftOffer(null); }} onDiscard={() => { void autosave.clear(); setDraftOffer(null); }} />}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="panel overflow-x-auto">
        <table className="table-plain">
          <thead>
            <tr>
              <th className="min-w-64">ชื่อ-สกุล</th>
              {sessions.map((s) => <th key={s.id} className="min-w-28 text-center"><span className="block">{s.time}</span><span className="block text-xs font-normal">{s.title}</span></th>)}
            </tr>
          </thead>
          <tbody>
            {people.map((p, pi) => (
              <tr key={p.enrollmentId}>
                <td>
                  <div className="flex items-center gap-2">
                    <PersonThumb name={p.name} thumb={p.thumb} inmateNo={p.inmateNo} zone={p.zone} />
                    <span>{p.name}</span>
                    {p.duplicateName && <span className="tag-orange">ชื่อซ้ำ</span>}
                  </div>
                </td>
                {sessions.map((s, si) => {
                  const key = `${p.enrollmentId}:${s.id}`;
                  if (!s.members.includes(p.enrollmentId)) return <td key={s.id} className="text-center text-muted">—</td>;
                  const v = grid[key] ?? "";
                  const bad = v && !CODES[v];
                  return (
                    <td key={s.id} className="text-center">
                      <input
                        ref={(el) => { refs.current[key] = el; }}
                        value={v}
                        onChange={(e) => setGrid({ ...grid, [key]: e.target.value.trim().slice(0, 2) })}
                        onKeyDown={(e) => onKey(e, pi, si)}
                        onPaste={(e) => onPaste(e, pi, si)}
                        inputMode="numeric"
                        aria-label={`${p.name} ${s.title}`}
                        className={`h-10 w-14 rounded-lg border text-center text-lg ${bad ? "border-danger bg-danger/10 text-danger" : v ? "border-navy bg-lime-soft" : "border-line"}`}
                      />
                      {v && CODES[v] && <span className="block text-xs text-muted">{CODES[v].label}</span>}
                      {v === "8" && (
                        <input
                          value={notes[key] ?? ""} onChange={(e) => setNotes({ ...notes, [key]: e.target.value })} placeholder="ระบุเหตุ"
                          aria-label={`เหตุเบิกตัวของ ${p.name} ${s.title}`}
                          className={`mt-1 h-9 w-28 rounded-lg border px-2 text-sm ${notes[key]?.trim() ? "border-line" : "border-danger bg-danger/10"}`}
                        />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3">
          <DraftSavedHint savedAt={dirty ? autosave.savedAt : null} />
          <button className="btn-primary" onClick={save} disabled={pending}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : `บันทึกทั้ง ${sessions.length} คาบ`}</button>
        </div>
      </div>
    </div>
  );
}
