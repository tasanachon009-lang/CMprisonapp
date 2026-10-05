import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { listForms, formAccess, versionFor } from "@/lib/services/assessments";
import { cohortLabel } from "@/lib/services/cohorts";
import { logPrint } from "@/lib/print";
import { todayISO } from "@/lib/thai-date";
import type { Item } from "@/lib/assessments/scoring";
import { DocFooter } from "../../doc-header";
import { BlankForm } from "../../pieces";

export const dynamic = "force-dynamic";

/** แบบประเมินเปล่าที่มีชื่อ+เลขประจำตัวพิมพ์ไว้แล้ว ทั้งรุ่น (สเปก 9) — เลือกแบบด้วย ?form=CODE */
export default async function BlankForms({ params, searchParams }: PageProps<"/print/blank-forms/[cohortId]">) {
  const auth = await requirePage("assessment.view", "health.view");
  const { cohortId } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(cohortId));
  if (!row) notFound();
  const all = listForms(db).filter((f) => (f.courseCodes as string[]).includes(row.course.code) && f.kind !== "condition" && formAccess(auth.can, f).view);
  const formCode = typeof sp.form === "string" ? sp.form.toUpperCase() : null;
  const round = sp.round === "pre" || sp.round === "post" ? sp.round : null;
  const q = (o: { form?: string | null; round?: string | null }) => `?${new URLSearchParams(Object.entries({ form: o.form ?? formCode ?? "", round: o.round === undefined ? round ?? "" : o.round ?? "" }).filter(([, v]) => v)).toString()}`;
  const pick = formCode ? all.filter((f) => f.code === formCode) : all.filter((f) => !f.sensitive);
  // ก่อนเรียน = ร่าง/กำลังอบรม · หลังเรียน = กำลังอบรม/ครบหลักสูตร
  const people = cohortRoster(db, row.cohort.id).filter((r) => (round === "post" ? ["active", "completed"] : ["draft", "active"]).includes(r.enrollment.status));
  const footer = await logPrint(auth, "blank_forms", row.cohort.id);
  const label = `${row.course.shortName} ${cohortLabel(row.cohort)}`;
  return (
    <>
      <div className="no-print mx-auto my-3 max-w-[210mm] rounded-xl bg-white p-3 font-sans text-sm">
        <p>เลือกแบบ: <a className="underline" href={q({ form: null })}>ทุกแบบที่ไม่ใช่สุขภาพ</a>
        {all.map((f) => <span key={f.id}> · <a className={formCode === f.code ? "font-bold underline" : "underline"} href={q({ form: f.code })}>{f.shortName}</a></span>)}</p>
        <p className="mt-1">รอบ: {([[null, "ไม่ระบุ (ให้ติ๊กเอง)"], ["pre", "ก่อนเรียน"], ["post", "หลังเรียน"]] as const).map(([r, l]) => <span key={l}> · <a className={round === r ? "font-bold underline" : "underline"} href={q({ round: r })}>{l}</a></span>)}</p>
      </div>
      {pick.flatMap((f) => {
        const v = versionFor(db, f.id, todayISO());
        return people.map((p) => (
          <div className="sheet" key={`${f.id}-${p.enrollment.id}`}>
            <BlankForm title={f.name} person={`${p.person.prefix ?? ""}${p.person.firstName} ${p.person.lastName}`} inmateNo={p.inc.inmateNo} cohort={label} kind={f.kind} items={v.items as Item[]} scoring={v.scoring as Record<string, unknown>}
              code={[f.code, `v${v.version}`, round === "pre" ? "ก่อน" : round === "post" ? "หลัง" : null, `E${p.enrollment.id}`].filter(Boolean).join("-")} round={round} />
            <DocFooter text={footer} />
          </div>
        ));
      })}
      {pick.length === 0 && <div className="sheet">ไม่มีแบบประเมินที่พิมพ์ได้</div>}
    </>
  );
}
