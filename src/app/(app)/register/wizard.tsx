"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowLeft, ArrowRight, CheckCircle2, Search, ShieldAlert, UserPlus } from "lucide-react";
import { Alert } from "@/components/ui";
import { ThaiDateInput } from "@/components/thai-date-input";
import { useAutosave } from "@/components/use-autosave";
import { ageOn, formatThaiDate, formatThaiDateTime } from "@/lib/thai-date";
import { isValidNationalId } from "@/lib/thai-id";
import type { RuleResult } from "@/lib/rules/enrollment-rules";
import {
  lookupInmate, lookupNationalId, matchByName, registerAction, revealNationalId,
  type HistoryItem, type LookupResult, type PersonDTO, type RegisterPayload,
} from "./actions";

type Opt2 = { code: string; label: string };
type Criteria = {
  screeningMin?: number; screeningMax?: number; screeningLabel?: string; exclusions?: Opt2[];
  /** สเปก 17 (3 วัน): บังคับเลขบัตร · ติ๊กยืนยัน · ประวัติยาเสพติด V.2 · ป้าย "ควรพิจารณาก่อน" */
  requireNationalId?: boolean; confirmations?: Array<Opt2 & { required?: boolean }>; drugClassLabel?: string; drugClasses?: Opt2[]; priorityFlags?: Opt2[];
} | null;
type Opt = { code: string; label: string };

const STEPS = ["เลขประจำตัว", "ข้อมูลส่วนตัว", "คดี", "ยาเสพติด/ประวัติบำบัด", "เกณฑ์รับเข้า", "ยืนยัน"];
const STATUS_TH: Record<string, string> = { draft: "ร่าง", active: "กำลังอบรม", completed: "ครบหลักสูตร", dropped: "ออกก่อนกำหนด", withdrawn: "ถอนตัว", failed: "ไม่ผ่าน" };

type Form = {
  inmateNo: string;
  nationalId: string;
  prefix: string; firstName: string; lastName: string; birthDate: string; gender: string;
  maritalStatus: string; education: string; occupation: string; familySize: string;
  admittedDate: string; offense: string; sentenceYears: string; sentenceMonths: string; sentenceDays: string; sentenceStatus: string; zone: string; room: string; prisonerClass: string;
  drugUse: Array<{ substance: string; ageStarted: string; frequency: string }>;
  priorTreatment: string;
  screeningScore: string;
  exclusions: string[];
  confirmations: string[]; drugClass: string; priorityFlags: string[];
  consentSigned: boolean; consentDate: string; consentRefused: boolean; consentRefuseReason: string;
};

const empty = (today: string): Form => ({
  inmateNo: "", nationalId: "", prefix: "นาย", firstName: "", lastName: "", birthDate: "", gender: "male",
  maritalStatus: "", education: "", occupation: "", familySize: "",
  admittedDate: "", offense: "", sentenceYears: "", sentenceMonths: "", sentenceDays: "", sentenceStatus: "เด็ดขาด", zone: "", room: "", prisonerClass: "",
  drugUse: [{ substance: "", ageStarted: "", frequency: "" }], priorTreatment: "",
  screeningScore: "", exclusions: [], confirmations: [], drugClass: "", priorityFlags: [], consentSigned: false, consentDate: today, consentRefused: false, consentRefuseReason: "",
});

const num = (s: string) => (s.trim() === "" ? null : Number(s));

export function RegisterWizard(props: {
  cohortId: number; cohortStatus: string; today: string; criteria: Criteria; lookups: { prisonerClass: Opt[]; substance: Opt[] };
  staff: Array<{ id: number; name: string }>; me: number; canOverride: boolean; canRevealId: boolean;
  /** มาจากรายชื่อแนะนำ — กรอกเลขประจำตัวให้และค้นทันที */
  initialInmateNo?: string;
}) {
  const { cohortId, today, criteria } = props;
  const [step, setStep] = useState(0);
  const [f, setF] = useState<Form>(() => ({ ...empty(today), inmateNo: props.initialInmateNo ?? "" }));
  const [lookup, setLookup] = useState<LookupResult | null>(null);
  const [linked, setLinked] = useState<{ person: PersonDTO; history: HistoryItem[]; evaluation: RuleResult | null } | null>(null);
  const [candidates, setCandidates] = useState<Array<{ person: PersonDTO; history: HistoryItem[]; inmateNos: string[]; evaluation: RuleResult }> | null>(null);
  const [notSame, setNotSame] = useState(false);
  const [ack, setAck] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; status: string; messages: string[]; personId: number } | null>(null);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const draftKey = `register:${cohortId}`;
  const autosave = useAutosave(draftKey, { step, f, lookup, linked }, !done);
  const [draftOffer, setDraftOffer] = useState<{ updatedAt: number; data: unknown } | null>(null);

  useEffect(() => {
    if (!props.initialInmateNo) autosave.load().then((d) => d && setDraftOffer(d));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const existing = lookup?.kind === "existing_incarceration";
  const person = existing ? lookup!.person! : linked?.person ?? null;
  const evaluation: RuleResult | null = existing ? lookup!.evaluation! : linked?.evaluation ?? null;
  const historyItems = existing ? lookup!.history! : linked?.history ?? [];

  // ── ขั้นที่ 1 ──
  const doLookup = () =>
    start(async () => {
      setError(null);
      setLinked(null);
      setCandidates(null);
      const r = await lookupInmate(cohortId, f.inmateNo);
      if (!r.ok) return setError(r.error);
      setLookup(r.data!);
      if (r.data!.kind === "existing_incarceration") {
        const p = r.data!.person!, i = r.data!.incarceration!;
        setF((x) => ({
          ...x, prefix: p.prefix ?? x.prefix, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate ?? "", gender: p.gender ?? x.gender,
          maritalStatus: p.maritalStatus ?? "", education: p.education ?? "", occupation: p.occupation ?? "", familySize: p.familySize?.toString() ?? "",
          offense: i.offense ?? "", zone: i.zone ?? "", room: i.room ?? "", prisonerClass: i.prisonerClass ?? "", admittedDate: i.admittedDate ?? "",
          sentenceYears: i.sentenceYears?.toString() ?? "", sentenceMonths: i.sentenceMonths?.toString() ?? "", sentenceDays: i.sentenceDays?.toString() ?? "",
        }));
      }
    });

  // มาจากรายชื่อแนะนำ: ค้นเลขประจำตัวทันที
  useEffect(() => {
    if (props.initialInmateNo) doLookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doNidLookup = () =>
    start(async () => {
      setError(null);
      const r = await lookupNationalId(cohortId, f.nationalId);
      if (!r.ok) return setError(r.error);
      if (r.data!.person) {
        const p = r.data!.person;
        setLinked({ person: p, history: r.data!.history, evaluation: r.data!.evaluation });
        setF((x) => ({ ...x, prefix: p.prefix ?? x.prefix, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate ?? "", gender: p.gender ?? x.gender, maritalStatus: p.maritalStatus ?? "", education: p.education ?? "", occupation: p.occupation ?? "", familySize: p.familySize?.toString() ?? "" }));
      } else {
        setLinked(null);
      }
    });

  // ── ขั้นที่ 2: ไม่มีเลขบัตร → เทียบชื่อ + วันเกิด ──
  const checkName = () => {
    if (existing || linked || notSame || !f.firstName || !f.lastName) return;
    matchByName(cohortId, f.firstName, f.lastName, f.birthDate || null).then((r) => r.ok && setCandidates(r.data!.length ? r.data! : null));
  };

  const canNext = () => {
    if (step === 0) return !!lookup && (!f.nationalId || isValidNationalId(f.nationalId) || existing);
    if (step === 1) return !!f.firstName.trim() && !!f.lastName.trim() && !(candidates && !notSame && !linked);
    return true;
  };

  // สเปก 17: ต้องมีเลขบัตร + ติ๊กยืนยันที่บังคับครบ ก่อน "ยืนยันรับเข้า"
  const needNid = !!criteria?.requireNationalId && !person?.hasNationalId && !isValidNationalId(f.nationalId);
  const missingConfirm = (criteria?.confirmations ?? []).filter((c) => c.required && !f.confirmations.includes(c.code));
  const priority = (f.priorityFlags.length > 0) && f.priorTreatment === "ไม่เคยบำบัด";
  const screening = num(f.screeningScore);
  const screeningOut = screening != null && criteria?.screeningMin != null && (screening < criteria.screeningMin! || screening > (criteria.screeningMax ?? 999));

  const submit = (confirmAdmission: boolean) =>
    start(async () => {
      setError(null);
      const payload: RegisterPayload = {
        cohortId,
        personId: existing ? null : linked?.person.id ?? null,
        person: {
          prefix: f.prefix || null, firstName: f.firstName, lastName: f.lastName,
          // บุคคลเดิมที่ยังไม่มีเลขบัตร: ส่งเลขที่กรอกเพิ่ม (เซิร์ฟเวอร์เติมเฉพาะช่องที่ว่าง)
          nationalId: (existing || linked) && person?.hasNationalId ? null : f.nationalId || null,
          birthDate: f.birthDate || null, gender: (f.gender || null) as "male" | "female" | "other" | null,
          maritalStatus: f.maritalStatus || null, education: f.education || null, occupation: f.occupation || null, familySize: num(f.familySize),
        },
        incarceration: {
          inmateNo: f.inmateNo, admittedDate: f.admittedDate || null, offense: f.offense || null,
          sentenceYears: num(f.sentenceYears), sentenceMonths: num(f.sentenceMonths), sentenceDays: num(f.sentenceDays),
          sentenceStatus: f.sentenceStatus || null, zone: f.zone || null, room: f.room || null, prisonerClass: f.prisonerClass || null,
        },
        drugUse: f.drugUse.filter((d) => d.substance).map((d) => ({ substance: d.substance, ageStarted: num(d.ageStarted), frequency: d.frequency || null })),
        screeningScore: screening,
        intake: { exclusions: f.exclusions, priorTreatment: f.priorTreatment || null, screeningOutOfRange: screeningOut, confirmations: f.confirmations, drugClass: f.drugClass || null, priorityFlags: f.priorityFlags },
        consentSigned: f.consentSigned, consentDate: f.consentSigned ? f.consentDate : null,
        consentRefused: f.consentRefused, consentRefuseReason: f.consentRefused ? f.consentRefuseReason : null,
        confirmAdmission,
        acknowledgeWarnings: ack,
        override: evaluation?.level === "block" && overrideReason.trim() ? { reason: overrideReason.trim() } : null,
        enrolledDate: today,
      };
      const r = await registerAction(payload);
      if (!r.ok) return setError(r.error);
      await autosave.clear();
      setDone({ name: `${f.prefix}${f.firstName} ${f.lastName}`, status: confirmAdmission ? "ยืนยันรับเข้าแล้ว" : "บันทึกเป็นร่างแล้ว", messages: r.data!.messages, personId: r.data!.personId });
    });

  const reset = () => {
    setF(empty(today));
    setLookup(null); setLinked(null); setCandidates(null); setNotSame(false); setAck(false); setOverrideReason(""); setError(null); setDone(null); setStep(0); setRevealed(null);
  };

  if (done) {
    return (
      <div className="card text-center">
        <CheckCircle2 className="mx-auto text-ok" size={56} aria-hidden />
        <h2 className="mt-2 text-2xl">{done.status}: {done.name}</h2>
        {done.messages.length > 0 && <div className="mx-auto mt-3 max-w-xl text-left"><Alert tone="warn">{done.messages.map((m, i) => <p key={i}>{m}</p>)}</Alert></div>}
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="btn-primary" onClick={reset}><UserPlus size={20} aria-hidden /> ลงทะเบียนคนถัดไป</button>
          <Link href={`/persons/${done.personId}`} className="btn-ghost">ดูหน้าบุคคล / เพิ่มรูปถ่าย</Link>
          <Link href={`/cohorts/${cohortId}/roster`} className="btn-ghost">ไปหน้ารายชื่อรุ่น</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {draftOffer && (
        <Alert tone="info">
          <p>มีร่างที่ยังไม่เสร็จ บันทึกไว้เมื่อ {formatThaiDateTime(draftOffer.updatedAt)}</p>
          <div className="mt-2 flex gap-2">
            <button className="btn-secondary btn-sm" onClick={() => {
              const d = draftOffer.data as { step: number; f: Form; lookup: LookupResult | null; linked: typeof linked };
              setF(d.f); setStep(d.step); setLookup(d.lookup); setLinked(d.linked); setDraftOffer(null);
            }}>ทำต่อจากร่าง</button>
            <button className="btn-ghost btn-sm" onClick={() => { void autosave.clear(); setDraftOffer(null); }}>เริ่มใหม่ (ลบร่าง)</button>
          </div>
        </Alert>
      )}

      {/* แถบขั้นตอน */}
      <ol className="flex flex-wrap gap-2" aria-label="ขั้นตอน">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button
              type="button" disabled={i > step && !canNext()} onClick={() => i <= step && setStep(i)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold ${i === step ? "bg-ink text-white" : i < step ? "bg-lime text-ink" : "border border-line bg-white text-muted"}`}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i + 1}</span> {s}
            </button>
          </li>
        ))}
      </ol>
      <p className="text-sm text-muted">ขั้นที่ {step + 1} จาก {STEPS.length}{autosave.savedAt ? ` · บันทึกร่างอัตโนมัติแล้ว ${formatThaiDateTime(autosave.savedAt)}` : ""}</p>

      {/* กล่องประวัติทุกหลักสูตร */}
      {person && (
        <div className="card border-navy/30">
          <p className="font-semibold">{existing ? "พบข้อมูลเดิมในระบบ" : "พบการต้องโทษครั้งก่อนของบุคคลนี้"}: {person.prefix}{person.firstName} {person.lastName}</p>
          <p className="text-sm text-muted">
            เลขบัตร {revealed ?? person.nationalIdMasked}
            {props.canRevealId && person.hasNationalId && !revealed && (
              <button className="ml-2 underline" onClick={() => revealNationalId(person.id).then((r) => r.ok && setRevealed(r.data!))}>แสดงเต็ม (บันทึกการดู)</button>
            )}
            {person.birthDate && ` · เกิด ${formatThaiDate(person.birthDate)} (อายุ ${ageOn(person.birthDate, today)} ปี)`}
          </p>
          {historyItems.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {historyItems.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className={h.current ? "tag-navy" : "tag-danger"}>{h.current ? "การต้องโทษปัจจุบัน" : "ข้อมูลการต้องโทษรอบก่อน"}</span>
                  {h.courseName} {h.cohortLabel} — {STATUS_TH[h.status] ?? h.status} (เลข {h.inmateNo})
                </li>
              ))}
            </ul>
          ) : <p className="mt-1 text-sm text-muted">ยังไม่เคยเข้าหลักสูตรใด</p>}
        </div>
      )}
      {evaluation && evaluation.level !== "ok" && step < 5 && (
        <Alert tone={evaluation.level === "block" ? "danger" : "warn"}>{evaluation.messages.map((m, i) => <p key={i}>{m}</p>)}</Alert>
      )}

      <div className="card space-y-4">
        {step === 0 && (
          <>
            <div>
              <label htmlFor="inmate" className="label">เลขประจำตัวผู้ต้องขัง <span className="text-danger">*</span></label>
              <div className="flex gap-2">
                <input id="inmate" className="input font-mono" value={f.inmateNo} autoFocus
                  onChange={(e) => { set("inmateNo", e.target.value); setLookup(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doLookup(); } }} />
                <button className="btn-primary shrink-0" onClick={doLookup} disabled={pending || !f.inmateNo.trim()}><Search size={20} aria-hidden /> ตรวจสอบ</button>
              </div>
              <p className="hint">เลขนี้แก้ไม่ได้หลังบันทึก</p>
            </div>
            {lookup?.kind === "new" && (
              <>
                <Alert tone="ok">เลขประจำตัวใหม่ — ยังไม่มีในระบบ</Alert>
                <div>
                  <label htmlFor="nid" className="label">เลขบัตรประชาชน (ถ้ามี)</label>
                  <div className="flex gap-2">
                    <input id="nid" className={`input font-mono ${f.nationalId && !isValidNationalId(f.nationalId) ? "input-error" : ""}`} inputMode="numeric" maxLength={17}
                      value={f.nationalId} onChange={(e) => { set("nationalId", e.target.value); setLinked(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doNidLookup(); } }} />
                    <button className="btn-ghost shrink-0" onClick={doNidLookup} disabled={pending || !isValidNationalId(f.nationalId)}><Search size={20} aria-hidden /> ค้นประวัติ</button>
                  </div>
                  {f.nationalId && !isValidNationalId(f.nationalId) && <p className="error-text">เลขบัตรไม่ถูกต้อง — ตรวจว่าครบ 13 หลักและพิมพ์ถูก</p>}
                  <p className="hint">ใช้ค้นประวัติการต้องโทษและการเข้าหลักสูตร (ไม่บังคับ)</p>
                </div>
              </>
            )}
          </>
        )}

        {step === 1 && (
          <div className="grid gap-4 sm:grid-cols-6">
            <div className="sm:col-span-1">
              <label className="label" htmlFor="prefix">คำนำหน้า</label>
              <select id="prefix" className="input" value={f.prefix} onChange={(e) => set("prefix", e.target.value)} disabled={existing}>
                {["นาย", "นาง", "นางสาว"].map((p) => <option key={p}>{p}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="fn">ชื่อ <span className="text-danger">*</span></label>
              <input id="fn" className="input" value={f.firstName} onChange={(e) => { set("firstName", e.target.value); setCandidates(null); setNotSame(false); }} onBlur={checkName} disabled={existing} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="ln">นามสกุล <span className="text-danger">*</span></label>
              <input id="ln" className="input" value={f.lastName} onChange={(e) => { set("lastName", e.target.value); setCandidates(null); setNotSame(false); }} onBlur={checkName} disabled={existing} />
            </div>
            <div className="sm:col-span-3">
              <label className="label" htmlFor="bd">วันเกิด</label>
              <ThaiDateInput id="bd" value={f.birthDate} onChange={(v) => { set("birthDate", v); setCandidates(null); }} max={today} />
              {f.birthDate && <p className="hint">อายุ {ageOn(f.birthDate, today)} ปี</p>}
            </div>
            <div className="sm:col-span-3">
              <span className="label">เพศ</span>
              <div className="flex gap-2">
                {[["male", "ชาย"], ["female", "หญิง"], ["other", "อื่นๆ"]].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set("gender", v)} className={`min-h-11 flex-1 rounded-full border font-semibold ${f.gender === v ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{l}</button>
                ))}
              </div>
            </div>
            <Field className="sm:col-span-2" label="สถานภาพสมรส" value={f.maritalStatus} onChange={(v) => set("maritalStatus", v)} list={["โสด", "สมรส", "หย่าร้าง", "แยกกันอยู่", "หม้าย"]} />
            <Field className="sm:col-span-2" label="ระดับการศึกษา" value={f.education} onChange={(v) => set("education", v)} list={["ไม่ได้เรียน", "ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย", "ปวช./ปวส.", "ปริญญาตรี", "สูงกว่าปริญญาตรี"]} />
            <Field className="sm:col-span-2" label="อาชีพก่อนต้องโทษ" value={f.occupation} onChange={(v) => set("occupation", v)} list={["รับจ้างทั่วไป", "เกษตรกร", "ค้าขาย", "ว่างงาน", "ขับรถรับจ้าง"]} />
            <Field className="sm:col-span-2" label="จำนวนสมาชิกในครอบครัว" value={f.familySize} onChange={(v) => set("familySize", v.replace(/\D/g, ""))} numeric />
            {existing && <p className="hint sm:col-span-6">ข้อมูลบุคคลจากระบบ แก้ไขได้ที่หน้าบุคคล</p>}
            {candidates && !notSame && !linked && (
              <div className="sm:col-span-6">
                <Alert tone="warn">
                  <p className="font-semibold"><ShieldAlert size={18} className="mr-1 inline" aria-hidden />อาจเป็นคนเดียวกับผู้ที่มีอยู่ในระบบ — กรุณายืนยัน</p>
                  <ul className="mt-2 space-y-2">
                    {candidates.map((c) => (
                      <li key={c.person.id} className="rounded-xl bg-white p-3">
                        <p><b>{c.person.prefix}{c.person.firstName} {c.person.lastName}</b> · เกิด {c.person.birthDate ? formatThaiDate(c.person.birthDate) : "-"} · เลขประจำตัวเดิม {c.inmateNos.join(", ")}</p>
                        <p className="text-sm text-muted">{c.history.map((h) => `${h.courseName} ${h.cohortLabel}`).join(" · ") || "ยังไม่เคยเข้าหลักสูตร"}</p>
                        <button className="btn-secondary btn-sm mt-2" onClick={() => { setLinked({ person: c.person, history: c.history, evaluation: c.evaluation }); setCandidates(null); }}>ใช่ เป็นคนเดียวกัน</button>
                      </li>
                    ))}
                  </ul>
                  <button className="btn-ghost btn-sm mt-2" onClick={() => setNotSame(true)}>ไม่ใช่ เป็นคนละคน</button>
                </Alert>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="grid gap-4 sm:grid-cols-6">
            <Field className="sm:col-span-4" label="ฐานความผิด" value={f.offense} onChange={(v) => set("offense", v)} list={["ครอบครองยาเสพติดประเภท 1", "เสพยาเสพติดประเภท 1", "ครอบครองเพื่อจำหน่ายยาเสพติดประเภท 1", "จำหน่ายยาเสพติดประเภท 1"]} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="adm">วันที่รับตัว</label>
              <ThaiDateInput id="adm" value={f.admittedDate} onChange={(v) => set("admittedDate", v)} max={today} />
            </div>
            <div className="sm:col-span-3">
              <span className="label">กำหนดโทษ</span>
              <div className="flex gap-2">
                <NumBox label="ปี" value={f.sentenceYears} onChange={(v) => set("sentenceYears", v)} />
                <NumBox label="เดือน" value={f.sentenceMonths} onChange={(v) => set("sentenceMonths", v)} />
                <NumBox label="วัน" value={f.sentenceDays} onChange={(v) => set("sentenceDays", v)} />
              </div>
            </div>
            <Field className="sm:col-span-3" label="สถานะคดี" value={f.sentenceStatus} onChange={(v) => set("sentenceStatus", v)} list={["เด็ดขาด", "ระหว่างอุทธรณ์/ฎีกา", "ระหว่างพิจารณา"]} />
            <Field className="sm:col-span-2" label="แดน" value={f.zone} onChange={(v) => set("zone", v)} list={["แดน 1", "แดน 2", "แดน 3", "แดน 4", "แดน 5", "แดน 6", "แดนหญิง"]} />
            <Field className="sm:col-span-2" label="ห้อง" value={f.room} onChange={(v) => set("room", v)} />
            <div className="sm:col-span-2">
              <label className="label" htmlFor="pc">ชั้นนักโทษ</label>
              <select id="pc" className="input" value={f.prisonerClass} onChange={(e) => set("prisonerClass", e.target.value)}>
                <option value="">— ไม่ระบุ —</option>
                {props.lookups.prisonerClass.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="font-semibold">ประวัติการใช้สารเสพติด</p>
            {f.drugUse.map((d, i) => (
              <div key={i} className="grid gap-2 rounded-2xl bg-cream p-3 sm:grid-cols-3">
                <select className="input" aria-label="สารที่ใช้" value={d.substance} onChange={(e) => set("drugUse", f.drugUse.map((x, j) => (j === i ? { ...x, substance: e.target.value } : x)))}>
                  <option value="">— สารที่ใช้ —</option>
                  {props.lookups.substance.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
                </select>
                <input className="input" aria-label="อายุที่เริ่มใช้" placeholder="อายุที่เริ่มใช้ (ปี)" inputMode="numeric" value={d.ageStarted} onChange={(e) => set("drugUse", f.drugUse.map((x, j) => (j === i ? { ...x, ageStarted: e.target.value.replace(/\D/g, "") } : x)))} />
                <select className="input" aria-label="ความถี่" value={d.frequency} onChange={(e) => set("drugUse", f.drugUse.map((x, j) => (j === i ? { ...x, frequency: e.target.value } : x)))}>
                  <option value="">— ความถี่ —</option>
                  <option value="daily">ทุกวัน</option>
                  <option value="5-6pw">5–6 วัน/สัปดาห์</option>
                  <option value="3-4pw">3–4 วัน/สัปดาห์</option>
                  <option value="1-2pw">1–2 วัน/สัปดาห์</option>
                  <option value="monthly">เดือนละไม่กี่ครั้ง</option>
                </select>
              </div>
            ))}
            <button className="btn-ghost btn-sm" onClick={() => set("drugUse", [...f.drugUse, { substance: "", ageStarted: "", frequency: "" }])}>+ เพิ่มสารอีกชนิด</button>
            <Field label="ประวัติการบำบัดครั้งก่อน" value={f.priorTreatment} onChange={(v) => set("priorTreatment", v)} list={["ไม่เคยบำบัด", "เคยบำบัดแบบสมัครใจ", "เคยบำบัดแบบบังคับ", "เคยบำบัดในเรือนจำ"]} />
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            {criteria?.requireNationalId && (person?.hasNationalId ? <Alert tone="ok">มีเลขบัตรประชาชนในระบบแล้ว (หลักสูตรนี้บังคับ)</Alert> : (
              <div>
                <label htmlFor="nid2" className="label">เลขบัตรประชาชน <span className="text-danger">* บังคับสำหรับหลักสูตรนี้</span></label>
                <input id="nid2" className={`input font-mono ${f.nationalId && !isValidNationalId(f.nationalId) ? "input-error" : ""}`} inputMode="numeric" maxLength={17} value={f.nationalId} onChange={(e) => set("nationalId", e.target.value)} />
                {f.nationalId && !isValidNationalId(f.nationalId) && <p className="error-text">เลขบัตรไม่ถูกต้อง — ตรวจว่าครบ 13 หลักและพิมพ์ถูก</p>}
                {!f.nationalId && <p className="hint">ไม่มีเลขบัตร: บันทึกเป็น &quot;ร่าง&quot; ได้ แต่ยืนยันรับเข้าไม่ได้</p>}
              </div>
            ))}
            {criteria?.confirmations?.map((c) => (
              <label key={c.code} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
                <input type="checkbox" className="h-5 w-5" checked={f.confirmations.includes(c.code)} onChange={(e) => set("confirmations", e.target.checked ? [...f.confirmations, c.code] : f.confirmations.filter((x) => x !== c.code))} />
                {c.label}{c.required && <span className="text-danger">*</span>}
              </label>
            ))}
            {criteria?.drugClasses && (
              <fieldset>
                <legend className="label">{criteria.drugClassLabel ?? "ประวัติยาเสพติด"}</legend>
                <div className="flex flex-wrap gap-2" role="radiogroup">
                  {criteria.drugClasses.map((c) => (
                    <button key={c.code} type="button" role="radio" aria-checked={f.drugClass === c.code} onClick={() => set("drugClass", c.code)} className={`min-h-11 rounded-full border px-4 font-semibold ${f.drugClass === c.code ? "border-ink bg-ink text-white" : "border-line bg-white"}`}>{c.label}</button>
                  ))}
                </div>
              </fieldset>
            )}
            {criteria?.priorityFlags?.map((c) => (
              <label key={c.code} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
                <input type="checkbox" className="h-5 w-5" checked={f.priorityFlags.includes(c.code)} onChange={(e) => set("priorityFlags", e.target.checked ? [...f.priorityFlags, c.code] : f.priorityFlags.filter((x) => x !== c.code))} />
                {c.label}
              </label>
            ))}
            {priority && <Alert tone="info">ป้าย <b>&quot;ควรพิจารณาก่อน&quot;</b> — เข้าเกณฑ์พักโทษ/ลดวันต้องโทษ และยังไม่เคยบำบัด</Alert>}
            {criteria?.screeningLabel && (
              <div>
                <label className="label" htmlFor="sc">{criteria.screeningLabel}</label>
                <input id="sc" className={`input w-40 ${screeningOut ? "input-error" : ""}`} inputMode="numeric" value={f.screeningScore} onChange={(e) => set("screeningScore", e.target.value.replace(/\D/g, ""))} />
                {screeningOut && <p className="text-sm font-semibold text-warn">คะแนนอยู่นอกช่วง {criteria.screeningMin}–{criteria.screeningMax} — ตรวจสอบว่าเหมาะกับหลักสูตรนี้หรือไม่</p>}
              </div>
            )}
            {criteria?.exclusions && (
              <fieldset>
                <legend className="label">ลักษณะต้องห้าม (ติ๊กถ้ามี)</legend>
                <div className="space-y-2">
                  {criteria.exclusions.map((x) => (
                    <label key={x.code} className="flex min-h-11 items-center gap-3 rounded-xl border border-line px-3">
                      <input type="checkbox" className="h-5 w-5" checked={f.exclusions.includes(x.code)} onChange={(e) => set("exclusions", e.target.checked ? [...f.exclusions, x.code] : f.exclusions.filter((c) => c !== x.code))} />
                      {x.label}
                    </label>
                  ))}
                </div>
                {f.exclusions.length > 0 && <p className="mt-2 text-sm font-semibold text-warn">มีลักษณะต้องห้าม ควรบันทึกเป็นร่างก่อนยืนยันรับเข้า</p>}
              </fieldset>
            )}
          </div>
        )}

        {step === 5 && (
          <div className="space-y-4">
            <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              <Row k="เลขประจำตัว" v={f.inmateNo} />
              <Row k="ชื่อ-สกุล" v={`${f.prefix}${f.firstName} ${f.lastName}`} />
              <Row k="วันเกิด" v={f.birthDate ? formatThaiDate(f.birthDate) : "-"} />
              <Row k="ฐานความผิด" v={f.offense || "-"} />
              <Row k="แดน/ห้อง" v={`${f.zone || "-"} / ${f.room || "-"}`} />
              <Row k="คะแนนคัดกรอง" v={f.screeningScore || "-"} />
            </dl>

            {evaluation && evaluation.level !== "ok" && (
              <Alert tone={evaluation.level === "block" ? "danger" : "warn"}>
                {evaluation.messages.map((m, i) => <p key={i}>{m}</p>)}
                {evaluation.level === "warn" && (
                  <label className="mt-2 flex items-center gap-2 font-semibold"><input type="checkbox" className="h-5 w-5" checked={ack} onChange={(e) => setAck(e.target.checked)} /> รับทราบคำเตือนแล้ว ต้องการลงทะเบียนต่อ</label>
                )}
                {evaluation.level === "block" && props.canOverride && (
                  <div className="mt-2">
                    <label className="label" htmlFor="ovr">ผู้ดูแลปลดล็อกลงซ้ำ — เหตุผล (บันทึกชื่อผู้อนุมัติ)</label>
                    <textarea id="ovr" className="input" rows={2} value={overrideReason} onChange={(e) => setOverrideReason(e.target.value)} />
                  </div>
                )}
                {evaluation.level === "block" && !props.canOverride && <p className="mt-2 font-semibold">ต้องลงทะเบียนโดยผู้ดูแลระบบพร้อมเหตุผล</p>}
              </Alert>
            )}

            <fieldset className="rounded-2xl border border-line p-4">
              <legend className="px-2 font-semibold">หลักฐานความยินยอม (PDPA)</legend>
              <label className="flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={f.consentSigned} onChange={(e) => { set("consentSigned", e.target.checked); if (e.target.checked) set("consentRefused", false); }} />
                <span>ผู้เข้ารับการฟื้นฟูได้ลงนามในเอกสารยินยอมการจัดเก็บข้อมูลแล้ว (ต้นฉบับเก็บแฟ้ม)</span>
              </label>
              {f.consentSigned && (
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div><label className="label" htmlFor="cd">วันที่ลงนาม</label><ThaiDateInput id="cd" value={f.consentDate} onChange={(v) => set("consentDate", v)} max={today} /></div>
                  <div><span className="label">ผู้รับเอกสาร</span><p className="input flex items-center bg-cream">{props.staff.find((s) => s.id === props.me)?.name} (ตัวคุณ)</p></div>
                </div>
              )}
              <label className="mt-3 flex items-start gap-3">
                <input type="checkbox" className="mt-1 h-5 w-5" checked={f.consentRefused} onChange={(e) => { set("consentRefused", e.target.checked); if (e.target.checked) set("consentSigned", false); }} />
                <span>ไม่ยินยอม</span>
              </label>
              {f.consentRefused && <textarea className="input mt-2" rows={2} placeholder="เหตุผล" value={f.consentRefuseReason} onChange={(e) => set("consentRefuseReason", e.target.value)} />}
              <p className="hint mt-2"><Link href={`/print/consent/${cohortId}`} target="_blank" className="underline">พิมพ์แบบฟอร์มยินยอมเปล่า</Link></p>
            </fieldset>
          </div>
        )}
      </div>

      {error && <Alert tone="danger"><p className="whitespace-pre-line">{error}</p></Alert>}

      <div className="flex flex-wrap items-center gap-3">
        {step > 0 && <button className="btn-ghost" onClick={() => setStep(step - 1)}><ArrowLeft size={20} aria-hidden /> ย้อนกลับ</button>}
        {step < 5 && (
          <button className="btn-primary ml-auto" disabled={!canNext() || pending} onClick={() => setStep(step + 1)}>ถัดไป <ArrowRight size={20} aria-hidden /></button>
        )}
        {step === 5 && (
          <div className="ml-auto flex flex-wrap gap-3">
            <button className="btn-ghost" disabled={pending || (evaluation?.level === "warn" && !ack) || (evaluation?.level === "block" && !overrideReason.trim())} onClick={() => submit(false)}>บันทึกเป็นร่าง</button>
            <button className="btn-primary" disabled={pending || !f.consentSigned || needNid || missingConfirm.length > 0 || (evaluation?.level === "warn" && !ack) || (evaluation?.level === "block" && !overrideReason.trim())} onClick={() => submit(true)}>
              <CheckCircle2 size={20} aria-hidden /> {pending ? "กำลังบันทึก..." : "ยืนยันรับเข้า"}
            </button>
          </div>
        )}
      </div>
      {step === 5 && !f.consentSigned && <p className="text-right text-sm text-muted">ยังไม่มีหลักฐานยินยอม: บันทึกเป็น &quot;ร่าง&quot; ได้ แต่ยืนยันรับเข้าไม่ได้</p>}
      {step === 5 && needNid && <p className="text-right text-sm text-muted">หลักสูตรนี้ต้องมีเลขบัตรประชาชน: บันทึกเป็น &quot;ร่าง&quot; ได้</p>}
      {step === 5 && missingConfirm.length > 0 && <p className="text-right text-sm text-muted">ยังไม่ได้ติ๊กยืนยัน: {missingConfirm.map((c) => c.label).join(", ")}</p>}
    </div>
  );
}

function Field({ label, value, onChange, list, numeric, className = "" }: { label: string; value: string; onChange: (v: string) => void; list?: string[]; numeric?: boolean; className?: string }) {
  const id = `f-${label}`;
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>{label}</label>
      <input id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)} list={list ? `${id}-l` : undefined} inputMode={numeric ? "numeric" : undefined} />
      {list && <datalist id={`${id}-l`}>{list.map((o) => <option key={o} value={o} />)}</datalist>}
    </div>
  );
}

function NumBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-1 items-center gap-1">
      <input className="input" inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, ""))} aria-label={label} />
      <span className="text-sm text-muted">{label}</span>
    </label>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2 border-b border-line/60 py-1">
      <dt className="w-32 shrink-0 text-muted">{k}</dt>
      <dd className="font-medium">{v}</dd>
    </div>
  );
}
