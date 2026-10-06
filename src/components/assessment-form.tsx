"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Save } from "lucide-react";
import { Alert } from "./ui";
import { ThaiDateInput } from "./thai-date-input";
import { computeResult } from "@/lib/assessments/compute";
import { q8Guidance, bmi, bmiLabel, type Item, type Option, type DepressionAnswers, type FitnessAnswers, type ConditionAnswers } from "@/lib/assessments/scoring";
import { saveAssessmentAction } from "@/app/(app)/enrollments/actions";
import { useAutosave } from "./use-autosave";
import { DraftOffer, DraftSavedHint } from "./draft-offer";

type Props = {
  enrollmentId: number;
  form: { id: number; code: string; name: string; kind: string; description: string | null };
  version: { items: Item[]; scoring: Record<string, unknown> };
  round: string;
  period?: string;
  today: string;
  initial: { answers: unknown; assessedDate: string; version: number; channel?: string | null; paperLocation?: string | null } | null;
  /** ช่องทางเริ่มต้นของแบบนี้ (ผู้ต้องขังตอบเอง = paper) */
  defaultChannel: "paper" | "system";
  readOnly?: boolean;
  backHref: string;
};

const TONE: Record<string, string> = { ok: "tag-ok", warn: "tag-warn", danger: "tag-danger" };

export function AssessmentForm(p: Props) {
  const router = useRouter();
  const [answers, setAnswers] = useState<unknown>(p.initial?.answers ?? defaultAnswers(p.form.kind));
  const [date, setDate] = useState(p.initial?.assessedDate ?? p.today);
  const [channel, setChannel] = useState<"paper" | "system">((p.initial?.channel as "paper" | "system" | undefined) ?? p.defaultChannel);
  const [paperLocation, setPaperLocation] = useState(p.initial?.paperLocation ?? "");
  const [msg, setMsg] = useState<{ tone: "ok" | "danger" | "warn"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const result = useMemo(() => computeResult(p.form.kind, p.version.items, p.version.scoring, answers), [answers, p.form.kind, p.version]);
  // ร่างอัตโนมัติ (ทุก 30 วินาที/ก่อนล็อกหน้าจอ) — เฉพาะเมื่อแก้แล้วยังไม่บันทึก
  const baseline = useMemo(() => JSON.stringify(p.initial?.answers ?? defaultAnswers(p.form.kind)), [p.initial, p.form.kind]);
  const dirty = JSON.stringify(answers) !== baseline;
  const autosave = useAutosave(`assess:${p.enrollmentId}:${p.form.id}:${p.round}:${p.period ?? ""}`, { answers, date, channel, paperLocation }, !p.readOnly && dirty);
  const [draftOffer, setDraftOffer] = useState<{ updatedAt: number; data: unknown } | null>(null);
  useEffect(() => {
    if (p.readOnly) return;
    autosave.load().then((d) => {
      if (!d) return;
      if (JSON.stringify((d.data as { answers: unknown }).answers) !== baseline) setDraftOffer(d);
      else void autosave.clear();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const save = useCallback(() => start(async () => {
    setMsg(null);
    const r = await saveAssessmentAction({ enrollmentId: p.enrollmentId, formId: p.form.id, round: p.round, period: p.period, assessedDate: date, answers, channel, paperLocation: channel === "paper" ? paperLocation : null }, p.initial?.version);
    if (!r.ok) return setMsg({ tone: "danger", text: r.error });
    void autosave.clear();
    setMsg({ tone: r.data!.alerts.length ? "warn" : "ok", text: `บันทึกแล้ว${r.data!.level ? ` — ${r.data!.level}` : ""}${r.data!.alerts.length ? ` · แจ้งเตือนผู้เกี่ยวข้องแล้ว: ${r.data!.alerts.join(" / ")}` : ""}` });
    router.refresh();
  }), [answers, date, channel, paperLocation, p, router, autosave]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s" && !p.readOnly) {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save, p.readOnly]);

  return (
    <div className="space-y-4 pb-24">
      {draftOffer && (
        <DraftOffer
          savedAt={draftOffer.updatedAt}
          onRestore={() => {
            const d = draftOffer.data as { answers: unknown; date: string; channel: "paper" | "system"; paperLocation: string };
            setAnswers(d.answers); setDate(d.date); setChannel(d.channel); setPaperLocation(d.paperLocation ?? ""); setDraftOffer(null);
          }}
          onDiscard={() => { void autosave.clear(); setDraftOffer(null); }}
        />
      )}
      {p.form.description && <p className="text-muted">{p.form.description}</p>}
      <div className="flex flex-wrap items-end gap-4">
        <div><span className="label">วันที่ประเมิน</span><ThaiDateInput value={date} onChange={setDate} max={p.today} /></div>
        <fieldset disabled={p.readOnly}>
          <span className="label">ช่องทาง</span>
          <div className="flex gap-1" role="radiogroup" aria-label="ช่องทางการกรอก">
            {([["system", "ทำในระบบ (สัมภาษณ์/ประเมินเอง)"], ["paper", "กรอกจากกระดาษ"]] as const).map(([v, l]) => (
              <Choice key={v} label={l} active={channel === v} onClick={() => setChannel(v)} />
            ))}
          </div>
        </fieldset>
        {channel === "paper" && (
          <label className="min-w-64 flex-1"><span className="label">ที่เก็บกระดาษต้นฉบับ</span>
            <input className="input" disabled={p.readOnly} value={paperLocation} onChange={(e) => setPaperLocation(e.target.value)} placeholder="เช่น แฟ้มรุ่น 1/2570 ช่อง ก่อนเรียน" maxLength={200} />
          </label>
        )}
      </div>

      <fieldset disabled={p.readOnly} className="space-y-4">
        {p.form.kind === "items" && <ItemsForm items={p.version.items} options={(p.version.scoring.options as Option[]) ?? []} answers={(answers ?? {}) as Record<string, number>} onChange={setAnswers} />}
        {p.form.kind === "single" && <SingleForm options={(p.version.scoring.options as Option[]) ?? []} value={(answers as { value?: number })?.value} onChange={(v) => setAnswers({ value: v })} />}
        {p.form.kind === "depression" && <DepressionForm items={p.version.items} scoring={p.version.scoring} a={answers as DepressionAnswers} onChange={setAnswers} />}
        {p.form.kind === "fitness" && <FitnessForm a={(answers ?? {}) as FitnessAnswers} onChange={setAnswers} />}
        {p.form.kind === "condition" && <ConditionForm a={(answers ?? {}) as ConditionAnswers} onChange={setAnswers} today={p.today} />}
      </fieldset>

      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

      <div className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-cream/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-3">
          <div className="mr-auto flex flex-wrap items-center gap-2">
            {result.total != null && <span className="font-display text-2xl font-bold text-navy">{result.total}</span>}
            {result.level && <span className={TONE[result.tone ?? ""] ?? "tag-muted"}>{result.level}</span>}
            {typeof result.details.guidance === "string" && <span className="text-sm">แนวทาง: {result.details.guidance}</span>}
            {result.errors.length > 0 && <span className="text-sm text-muted">{result.errors.join(" · ")}</span>}
            <DraftSavedHint savedAt={dirty ? autosave.savedAt : null} />
          </div>
          <a href={p.backHref} className="btn-ghost">กลับ</a>
          {!p.readOnly && <button className="btn-primary" disabled={pending} onClick={save}><Save size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "บันทึก (Ctrl+S)"}</button>}
        </div>
      </div>
    </div>
  );
}

function defaultAnswers(kind: string): unknown {
  if (kind === "depression") return { q2: [null, null] };
  if (kind === "fitness") return { bases: [{ pass: null }, { pass: null }, { pass: null }, { pass: null }, { pass: null }] };
  if (kind === "condition") return { exams: [], physicalHistory: { has: false }, psychHistory: { has: false }, opinion: null };
  return {};
}

function Choice({ label, active, onClick, tone }: { label: string; active: boolean; onClick: () => void; tone?: "danger" }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active}
      className={`min-h-11 rounded-full border px-4 text-sm font-semibold transition ${active ? (tone === "danger" ? "border-danger bg-danger text-white" : "border-ink bg-ink text-white") : "border-line bg-white hover:bg-lime-soft"}`}>
      {label}
    </button>
  );
}

function ItemsForm({ items, options, answers, onChange }: { items: Item[]; options: Option[]; answers: Record<string, number>; onChange: (a: Record<string, number>) => void }) {
  let lastGroup = "";
  return (
    <ol className="panel divide-y divide-line">
      {items.map((it) => {
        const header = it.group && it.group !== lastGroup ? it.group : null;
        lastGroup = it.group ?? lastGroup;
        return (
          <li key={it.no} className="px-4 py-3">
            {header && <p className="mb-2 font-semibold text-navy">{header}</p>}
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-64 flex-1">
                <p><b>{it.label ?? it.no}.</b> {it.text} {it.reverse && <span className="tag-muted ml-1" title="ข้อเชิงลบ ระบบกลับคะแนนให้">(−)</span>}</p>
                {it.help && (
                  <details className="mt-1 text-sm">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center gap-1 text-navy"><HelpCircle size={16} aria-hidden /> คำอธิบายจากคู่มือ</summary>
                    <p className="rounded-xl bg-cream px-3 py-2 text-ink">{it.help}</p>
                  </details>
                )}
              </div>
              <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={`ข้อ ${it.label ?? it.no}`}>
                {options.map((o) => <Choice key={o.value} label={o.label} active={answers[String(it.no)] === o.value} onClick={() => onChange({ ...answers, [String(it.no)]: o.value })} />)}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SingleForm({ options, value, onChange }: { options: Option[]; value?: number; onChange: (v: number) => void }) {
  return (
    <div className="card flex flex-wrap gap-2">
      {options.map((o) => <Choice key={o.value} label={o.label} active={value === o.value} onClick={() => onChange(o.value)} />)}
    </div>
  );
}

function DepressionForm({ items, scoring, a, onChange }: { items: Item[]; scoring: Record<string, unknown>; a: DepressionAnswers; onChange: (a: DepressionAnswers) => void }) {
  const q2 = items.filter((i) => i.group === "2Q");
  const q9 = items.filter((i) => i.group === "9Q");
  const q8 = items.filter((i) => i.group === "8Q");
  const opts9 = (scoring.q9Options as Option[]) ?? [];
  const need9 = a.q2.some(Boolean);
  const s9 = (a.q9 ?? []).reduce<number>((s, x) => s + (x ?? 0), 0);
  const need8 = need9 && (a.q9?.length === 9 && a.q9.every((x) => x != null)) && s9 >= 7;
  const s8 = (a.q8 ?? []).reduce<number>((s, x, i) => s + (x ? [1, 2, 6, 8, 9, 4, 10, 4][i] : 0), 0) + (a.q8?.[2] && a.q8control === false ? 8 : 0);
  const setQ2 = (i: number, v: boolean) => { const q = [...a.q2] as DepressionAnswers["q2"]; q[i] = v; onChange({ ...a, q2: q }); };
  const setQ9 = (i: number, v: number) => { const q = [...(a.q9 ?? Array(9).fill(null))]; q[i] = v; onChange({ ...a, q9: q }); };
  const setQ8 = (i: number, v: boolean) => { const q = [...(a.q8 ?? Array(8).fill(null))]; q[i] = v; onChange({ ...a, q8: q }); };
  return (
    <div className="space-y-4">
      <section className="card">
        <h3 className="text-lg">2Q คัดกรองโรคซึมเศร้า</h3>
        {q2.map((it, i) => (
          <div key={it.no} className="mt-3 flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <p className="min-w-64 flex-1">{i + 1}. {it.text}</p>
            <Choice label="ไม่มี" active={a.q2[i] === false} onClick={() => setQ2(i, false)} />
            <Choice label="มี" active={a.q2[i] === true} onClick={() => setQ2(i, true)} />
          </div>
        ))}
        {a.q2.every((x) => x === false) && <p className="mt-3 tag-ok">ปกติ ไม่เป็นโรคซึมเศร้า — จบการคัดกรอง</p>}
      </section>
      {need9 && (
        <section className="card">
          <h3 className="text-lg">9Q ประเมินโรคซึมเศร้า (ใน 2 สัปดาห์ที่ผ่านมา) <span className="font-display text-navy">= {s9}</span></h3>
          {q9.map((it, i) => (
            <div key={it.no} className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <p className="min-w-64 flex-1">{i + 1}. {it.text}</p>
              {opts9.map((o) => <Choice key={o.value} label={o.label} active={a.q9?.[i] === o.value} onClick={() => setQ9(i, o.value)} />)}
            </div>
          ))}
          {s9 >= 13 && <div className="mt-3"><Alert tone="warn">9Q ≥ 13 — พิจารณาส่งพบจิตแพทย์</Alert></div>}
        </section>
      )}
      {need8 && (
        <section className="card border-danger/40">
          <h3 className="text-lg">8Q ประเมินแนวโน้มการฆ่าตัวตาย <span className="font-display text-danger">= {s8}</span></h3>
          {q8.map((it, i) => (
            <div key={it.no} className="mt-3 border-t border-line pt-3">
              <div className="flex flex-wrap items-center gap-3">
                <p className="min-w-64 flex-1">{i + 1}. {it.text}</p>
                <Choice label="ไม่มี" active={a.q8?.[i] === false} onClick={() => setQ8(i, false)} />
                <Choice label="มี" tone="danger" active={a.q8?.[i] === true} onClick={() => setQ8(i, true)} />
              </div>
              {i === 2 && a.q8?.[2] && (
                <div className="mt-2 flex flex-wrap items-center gap-3 rounded-xl bg-danger/5 p-3">
                  <p className="min-w-64 flex-1">↳ {String(scoring.q8ControlText ?? "ควบคุมได้หรือไม่")}</p>
                  <Choice label="ได้" active={a.q8control === true} onClick={() => onChange({ ...a, q8control: true })} />
                  <Choice label="ไม่ได้" tone="danger" active={a.q8control === false} onClick={() => onChange({ ...a, q8control: false })} />
                </div>
              )}
            </div>
          ))}
          {s8 >= 1 && <div className="mt-3"><Alert tone={s8 >= 17 ? "danger" : "warn"}><b>แนวทางการดูแล (คำแนะนำ ไม่ใช่การวินิจฉัย):</b> {q8Guidance(s8)}</Alert></div>}
        </section>
      )}
    </div>
  );
}

function Num({ label, value, onChange, unit }: { label: string; value?: number | null; onChange: (v: number | null) => void; unit?: string }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <span className="flex items-center gap-2">
        <input className="input" inputMode="decimal" value={value ?? ""} onChange={(e) => { const v = e.target.value.replace(/[^\d.]/g, ""); onChange(v === "" ? null : Number(v)); }} />
        {unit && <span className="text-sm text-muted">{unit}</span>}
      </span>
    </label>
  );
}

const BASES = ["1. สัญญาณชีพ น้ำหนัก ส่วนสูง", "2. ชีพจรก่อน/หลังกระโดด 1 นาที", "3. วิดพื้น 30 วินาที", "4. ระยะปลายนิ้วถึงข้อเท้า", "5. เวลายืนทรงตัว"];

function FitnessForm({ a, onChange }: { a: FitnessAnswers; onChange: (a: FitnessAnswers) => void }) {
  const set = (k: keyof FitnessAnswers, v: number | null) => onChange({ ...a, [k]: v });
  const bases: Array<{ pass: boolean | null; assessor?: string | null }> = a.bases ?? BASES.map(() => ({ pass: null }));
  const setBase = (i: number, patch: Partial<{ pass: boolean | null; assessor: string | null }>) => onChange({ ...a, bases: bases.map((b, j) => (j === i ? { ...b, ...patch } : b)) });
  const b = bmi(a.weight, a.height);
  const fields: Array<Array<[keyof FitnessAnswers, string, string]>> = [
    [["sbp", "ความดันตัวบน", "mmHg"], ["dbp", "ความดันตัวล่าง", "mmHg"], ["pulse", "ชีพจร", "ครั้ง/นาที"], ["weight", "น้ำหนัก", "กก."], ["height", "ส่วนสูง", "ซม."]],
    [["pulseBefore", "ชีพจรก่อนกระโดด", "ครั้ง/นาที"], ["pulseAfter", "ชีพจรหลังกระโดด 1 นาที", "ครั้ง/นาที"]],
    [["pushups", "จำนวนครั้ง", "ครั้ง"]],
    [["reachCm", "ระยะ", "ซม."]],
    [["balanceSec", "เวลา", "วินาที"]],
  ];
  return (
    <div className="space-y-3">
      {BASES.map((title, i) => (
        <section key={title} className="card">
          <h3 className="text-lg">{title}</h3>
          <div className="mt-2 grid gap-3 sm:grid-cols-5">
            {fields[i].map(([k, l, u]) => <Num key={k} label={l} unit={u} value={a[k] as number | null} onChange={(v) => set(k, v)} />)}
            {i === 0 && <div><span className="label">BMI</span><p className="input flex items-center bg-cream">{b ?? "-"} {b ? `(${bmiLabel(b)})` : ""}</p></div>}
          </div>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <Choice label="ผ่าน" active={bases[i]?.pass === true} onClick={() => setBase(i, { pass: true })} />
            <Choice label="ไม่ผ่าน" tone="danger" active={bases[i]?.pass === false} onClick={() => setBase(i, { pass: false })} />
            <label className="flex-1"><span className="label">ผู้ประเมินประจำฐาน</span><input className="input" value={bases[i]?.assessor ?? ""} onChange={(e) => setBase(i, { assessor: e.target.value })} /></label>
          </div>
        </section>
      ))}
    </div>
  );
}

function ConditionForm({ a, onChange, today }: { a: ConditionAnswers; onChange: (a: ConditionAnswers) => void; today: string }) {
  const exams = a.exams ?? [];
  const setExam = (i: number, patch: Record<string, unknown>) => onChange({ ...a, exams: exams.map((e, j) => (j === i ? { ...e, ...patch } : e)) });
  return (
    <div className="space-y-3">
      <section className="card">
        <h3 className="text-lg">ตรวจร่างกาย (บันทึกได้หลายครั้ง)</h3>
        {exams.map((e, i) => (
          <div key={i} className="mt-3 grid gap-3 border-t border-line pt-3 sm:grid-cols-6">
            <div className="sm:col-span-2"><span className="label">วันที่</span><ThaiDateInput value={e.date} onChange={(v) => setExam(i, { date: v })} max={today} /></div>
            <Num label="น้ำหนัก (กก.)" value={e.weight} onChange={(v) => setExam(i, { weight: v })} />
            <Num label="ส่วนสูง (ซม.)" value={e.height} onChange={(v) => setExam(i, { height: v })} />
            <label><span className="label">ความดัน</span><input className="input" placeholder="120/80" value={e.bp ?? ""} onChange={(x) => setExam(i, { bp: x.target.value })} /></label>
            <Num label="ชีพจร" value={e.pulse} onChange={(v) => setExam(i, { pulse: v })} />
            <label className="sm:col-span-4"><span className="label">ความพิการ</span><input className="input" value={e.disability ?? ""} onChange={(x) => setExam(i, { disability: x.target.value })} /></label>
            <p className="self-end text-sm text-muted sm:col-span-2">BMI {bmi(e.weight, e.height) ?? "-"}</p>
          </div>
        ))}
        <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => onChange({ ...a, exams: [...exams, { date: today }] })}>+ เพิ่มการตรวจ</button>
      </section>
      {(["physicalHistory", "psychHistory"] as const).map((k) => (
        <section key={k} className="card">
          <h3 className="text-lg">{k === "physicalHistory" ? "ประวัติโรคทางกาย" : "ประวัติจิตเวช"}</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            <Choice label="ไม่มี" active={a[k]?.has === false} onClick={() => onChange({ ...a, [k]: { has: false } })} />
            <Choice label="มี" active={a[k]?.has === true} onClick={() => onChange({ ...a, [k]: { ...a[k], has: true } })} />
          </div>
          {a[k]?.has && (
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label><span className="label">ระบุ</span><input className="input" value={(k === "physicalHistory" ? a.physicalHistory?.diseases : a.psychHistory?.detail) ?? ""} onChange={(e) => onChange({ ...a, [k]: { ...a[k], [k === "physicalHistory" ? "diseases" : "detail"]: e.target.value } })} /></label>
              <div className="flex items-end gap-2">
                <Choice label="ยังรักษาต่อเนื่อง" active={a[k]?.ongoing === true} onClick={() => onChange({ ...a, [k]: { ...a[k], ongoing: true } })} />
                <Choice label="ยุติการรักษาแล้ว" active={a[k]?.ongoing === false} onClick={() => onChange({ ...a, [k]: { ...a[k], ongoing: false } })} />
              </div>
            </div>
          )}
        </section>
      ))}
      <section className="card">
        <h3 className="text-lg">ความเห็นผู้ประเมิน</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          <Choice label="เข้าร่วมได้" active={a.opinion === "fit"} onClick={() => onChange({ ...a, opinion: "fit", unfitReasons: [] })} />
          <Choice label="ยังเข้าร่วมไม่ได้" tone="danger" active={a.opinion === "unfit"} onClick={() => onChange({ ...a, opinion: "unfit" })} />
        </div>
        {a.opinion === "unfit" && (
          <div className="mt-3 flex flex-wrap gap-4">
            {(["psych", "physical"] as const).map((r) => (
              <label key={r} className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={a.unfitReasons?.includes(r) ?? false} onChange={(e) => onChange({ ...a, unfitReasons: e.target.checked ? [...(a.unfitReasons ?? []), r] : (a.unfitReasons ?? []).filter((x) => x !== r) })} /> {r === "psych" ? "มีปัญหาจิตเวชที่เป็นอุปสรรค" : "มีปัญหากายที่เป็นอุปสรรค"}</label>
            ))}
          </div>
        )}
        <label className="mt-3 block"><span className="label">ชื่อผู้ประเมิน</span><input className="input" value={a.assessorName ?? ""} onChange={(e) => onChange({ ...a, assessorName: e.target.value })} /></label>
      </section>
    </div>
  );
}
