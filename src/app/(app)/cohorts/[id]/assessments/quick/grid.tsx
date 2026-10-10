"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useAutosave } from "@/components/use-autosave";
import { DraftOffer, DraftSavedHint } from "@/components/draft-offer";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Save } from "lucide-react";
import { Alert } from "@/components/ui";
import { PersonThumb } from "@/components/person-thumb";
import { ThaiDateInput } from "@/components/thai-date-input";
import { scoreItems, scoreSingle, type Item, type ItemsScoring } from "@/lib/assessments/scoring";
import { saveAssessmentBatchAction } from "@/app/(app)/enrollments/actions";

type Person = { enrollmentId: number; name: string; inmateNo: string; thumb: string | null; duplicateName: boolean };
const TONE: Record<string, string> = { ok: "tag-ok", warn: "tag-warn", danger: "tag-danger" };

export function AssessmentGrid({ cohortId, formId, round, today, kind, items, scoring, people, existing, defaultChannel, lastLocation }: {
  cohortId: number; formId: number; round: string; today: string; kind: "items" | "single"; items: Item[]; scoring: ItemsScoring; people: Person[]; existing: Record<number, Record<string, number>>;
  defaultChannel: "paper" | "system"; lastLocation: string;
}) {
  const router = useRouter();
  const [grid, setGrid] = useState<Record<number, Record<string, string>>>(() =>
    Object.fromEntries(people.map((p) => [p.enrollmentId, Object.fromEntries(Object.entries(existing[p.enrollmentId] ?? {}).map(([k, v]) => [k, String(v)]))])),
  );
  const [date, setDate] = useState(today);
  const [fromKit, setFromKit] = useState(false);
  const [channel, setChannel] = useState(defaultChannel);
  const [location, setLocation] = useState(lastLocation);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [rowErr, setRowErr] = useState<Record<number, string>>({});
  const [pending, start] = useTransition();
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const allowed = new Set(scoring.options.map((o) => String(o.value)));
  // ร่างอัตโนมัติ (ทุก 30 วินาที/ก่อนล็อกหน้าจอ) — เฉพาะเมื่อมีช่องที่แก้แล้วยังไม่บันทึก
  const initialGrid = useMemo(() => JSON.stringify(Object.fromEntries(people.map((p) => [p.enrollmentId, Object.fromEntries(Object.entries(existing[p.enrollmentId] ?? {}).map(([k, v]) => [k, String(v)]))]))), [people, existing]);
  const norm = (g: Record<number, Record<string, string>>) => JSON.stringify(Object.fromEntries(Object.entries(g).map(([k, row]) => [k, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== ""))])));
  const dirty = norm(grid) !== norm(JSON.parse(initialGrid));
  const autosave = useAutosave(`assess-grid:${cohortId}:${formId}:${round}`, { grid, date }, dirty);
  const [draftOffer, setDraftOffer] = useState<{ updatedAt: number; data: unknown } | null>(null);
  useEffect(() => {
    autosave.load().then((d) => { if (d) setDraftOffer(d); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parse = (row: Record<string, string>) => Object.fromEntries(Object.entries(row).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)]));
  const focus = (pi: number, ii: number) => refs.current[`${people[pi]?.enrollmentId}:${items[ii]?.no}`]?.focus();

  const onKey = (e: React.KeyboardEvent, pi: number, ii: number) => {
    // Enter = ช่องถัดไป (ข้อต่อไป; จบแถวไปคนถัดไป)
    if (e.key === "Enter") { e.preventDefault(); if (ii + 1 < items.length) focus(pi, ii + 1); else focus(pi + 1, 0); }
    if (e.key === "ArrowDown") { e.preventDefault(); focus(pi + 1, ii); }
    if (e.key === "ArrowUp") { e.preventDefault(); focus(pi - 1, ii); }
  };

  const onPaste = (e: React.ClipboardEvent, pi: number, ii: number) => {
    const text = e.clipboardData.getData("text");
    if (!text.includes("\t") && !text.includes("\n")) return;
    e.preventDefault();
    const g = { ...grid };
    text.replace(/\r/g, "").split("\n").forEach((line, dy) => line.split("\t").forEach((v, dx) => {
      const p = people[pi + dy], it = items[ii + dx];
      if (p && it) g[p.enrollmentId] = { ...g[p.enrollmentId], [String(it.no)]: v.trim() };
    }));
    setGrid(g);
  };

  const save = () => start(async () => {
    setMsg(null);
    const rows = people.map((p) => ({ enrollmentId: p.enrollmentId, answers: parse(grid[p.enrollmentId] ?? {}) })).filter((r) => Object.keys(r.answers).length > 0)
      // แบบเลือกข้อเดียว เก็บเป็น { value }
      .map((r) => (kind === "single" ? { ...r, answers: { value: r.answers["1"] } } : r));
    if (!rows.length) return setMsg({ tone: "warn", text: "ยังไม่มีข้อมูลให้บันทึก" });
    const r = await saveAssessmentBatchAction(formId, round, date, rows, fromKit, { channel, location: channel === "paper" ? location : null });
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    setRowErr(Object.fromEntries(r.data!.errors.map((x) => [x.enrollmentId, x.error])));
    if (!r.data!.errors.length) void autosave.clear();
    setMsg({ tone: r.data!.errors.length ? "warn" : "ok", text: `บันทึกแล้ว ${r.data!.saved} คน${r.data!.errors.length ? ` · ไม่ผ่าน ${r.data!.errors.length} คน (ดูข้อความสีแดงท้ายแถว)` : ""}` });
    router.refresh();
  });

  return (
    <div className="space-y-4 pb-24">
      <div className="flex flex-wrap items-end gap-4">
        <div><span className="label">วันที่ประเมิน</span><ThaiDateInput value={date} onChange={setDate} max={today} /></div>
        <div>
          <span className="label">ช่องทาง</span>
          <select className="input" value={channel} onChange={(e) => setChannel(e.target.value as "paper")} aria-label="ช่องทางการกรอก">
            <option value="paper">กรอกจากกระดาษ (ผู้ต้องขังตอบเอง)</option><option value="system">ทำในระบบ</option>
          </select>
        </div>
        {channel === "paper" && <label className="min-w-64"><span className="label">ที่เก็บกระดาษต้นฉบับ</span><input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="เช่น แฟ้มรุ่น 1/2570 ช่อง ก่อนเรียน" maxLength={200} /></label>}
        <label className="flex items-center gap-2 pb-3"><input type="checkbox" className="h-5 w-5" checked={fromKit} onChange={(e) => setFromKit(e.target.checked)} /> กรอกย้อนหลังจากชุดกระดาษฉุกเฉิน</label>
        <Link href={`/cohorts/${cohortId}/assessments`} className="btn-ghost ml-auto">กลับ</Link>
      </div>
      {draftOffer && <DraftOffer savedAt={draftOffer.updatedAt} onRestore={() => { const d = draftOffer.data as { grid: typeof grid; date: string }; setGrid(d.grid); setDate(d.date); setDraftOffer(null); }} onDiscard={() => { void autosave.clear(); setDraftOffer(null); }} />}
      <Alert tone="info">ค่าที่ใส่ได้: {scoring.options.map((o) => `${o.value} = ${o.label}`).join(" · ")} — Enter = ข้อถัดไป · ลูกศรขึ้น/ลง = เปลี่ยนคน · วางจาก Excel ได้ทั้งแผ่น · ข้อที่มี (−) ระบบกลับคะแนนให้เอง</Alert>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="panel overflow-x-auto">
        <table className="table-plain text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 z-20 min-w-52 bg-lime-soft">ชื่อ-สกุล</th>
              {items.map((it) => <th key={it.no} className="text-center" title={it.text}>{kind === "single" ? "คำตอบ" : `${it.label ?? it.no}${it.reverse ? "(−)" : ""}`}</th>)}
              <th className="text-center">รวม</th>
              <th>ผล</th>
            </tr>
          </thead>
          <tbody>
            {people.map((p, pi) => {
              const row = grid[p.enrollmentId] ?? {};
              const r = kind === "single" ? scoreSingle(scoring, parse(row)["1"]) : scoreItems(items, scoring, parse(row));
              const filled = Object.values(row).filter((v) => v !== "").length;
              return (
                <tr key={p.enrollmentId}>
                  <td className="sticky left-0 z-10 bg-white">
                    <div className="flex items-center gap-2">
                      <PersonThumb name={p.name} thumb={p.thumb} inmateNo={p.inmateNo} />
                      <span>{p.name}</span>{p.duplicateName && <span className="tag-orange">ชื่อซ้ำ</span>}
                    </div>
                  </td>
                  {items.map((it, ii) => {
                    const v = row[String(it.no)] ?? "";
                    const bad = v !== "" && !allowed.has(v);
                    return (
                      <td key={it.no} className="px-1 text-center">
                        <input
                          ref={(el) => { refs.current[`${p.enrollmentId}:${it.no}`] = el; }}
                          value={v} inputMode="numeric" aria-label={`${p.name} ${kind === "single" ? "คำตอบ" : `ข้อ ${it.label ?? it.no}`}`}
                          onChange={(e) => setGrid({ ...grid, [p.enrollmentId]: { ...row, [String(it.no)]: e.target.value.trim().slice(0, 3) } })}
                          onKeyDown={(e) => onKey(e, pi, ii)} onPaste={(e) => onPaste(e, pi, ii)}
                          className={`h-9 w-10 rounded-md border text-center ${bad ? "border-danger bg-danger/10 text-danger" : v ? "border-navy bg-lime-soft" : "border-line"}`}
                        />
                      </td>
                    );
                  })}
                  <td className="text-center font-display font-bold text-navy">{r.total ?? (filled ? `${filled}/${items.length}` : "")}</td>
                  <td className="whitespace-nowrap">
                    {r.level && <span className={TONE[r.tone ?? ""] ?? "tag-muted"}>{r.level}</span>}
                    {rowErr[p.enrollmentId] && <span className="block text-xs text-danger">{rowErr[p.enrollmentId]}</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-end gap-3"><DraftSavedHint savedAt={dirty ? autosave.savedAt : null} /><button className="btn-primary" onClick={save} disabled={pending}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึกทุกแถวที่กรอก"}</button></div>
      </div>
    </div>
  );
}
