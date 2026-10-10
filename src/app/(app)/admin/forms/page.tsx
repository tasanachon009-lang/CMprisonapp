import Link from "next/link";
import { asc, desc, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/assessments/compute";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import type { Band, Item } from "@/lib/assessments/scoring";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { FormEditor } from "./form-editor";

export const dynamic = "force-dynamic";

export default async function FormsPage({ searchParams }: PageProps<"/admin/forms">) {
  await requirePage("forms.manage");
  const sp = await searchParams;
  const db = getDb();
  const forms = db.select().from(schema.assessmentForms).orderBy(asc(schema.assessmentForms.sortOrder)).all();
  const selected = forms.find((f) => f.code === sp.form) ?? null;
  const versions = selected ? db.select().from(schema.assessmentFormVersions).where(eq(schema.assessmentFormVersions.formId, selected.id)).orderBy(desc(schema.assessmentFormVersions.version)).all() : [];
  const latest = versions[0];
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "คลังแบบประเมิน" }]} />
      <PageHeader en="Assessment Library" title="คลังแบบประเมิน" help="การแก้ไขข้อคำถาม เฉลย และเกณฑ์แปลผล จะบันทึกเป็นเวอร์ชันใหม่ ผลที่ประเมินแล้วใช้เกณฑ์เดิม ณ วันประเมิน" />
      <div className="flex flex-wrap gap-2">
        {forms.map((f) => (
          <Link key={f.id} href={`?form=${f.code}`} className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-semibold ${selected?.id === f.id ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>
            {f.shortName}{f.sensitive && <span className="text-xs">🔒</span>}
          </Link>
        ))}
      </div>
      {selected && latest && (
        <>
          <section className="card">
            <h2 className="text-xl">{selected.name}</h2>
            <p className="text-muted">หมวด{CATEGORY_LABEL[selected.category]} · ชนิด {selected.kind} · รอบ {(selected.rounds as string[]).join(", ")} · หลักสูตร {(selected.courseCodes as string[]).join(", ")}{selected.sensitive ? " · ข้อมูลอ่อนไหว (สถานพยาบาล)" : ""}</p>
            <p className="mt-1 text-sm">เวอร์ชันปัจจุบัน {latest.version} (เริ่มใช้ {formatThaiDate(latest.effectiveFrom)}){latest.note ? ` — ${latest.note}` : ""}</p>
            {selected.code === "PMHQ" && <div className="mt-2"><Alert tone="warn">PMHQ-Thai สงวนลิขสิทธิ์โดยกรมราชทัณฑ์ ใช้ภายในหน่วยงานเท่านั้น</Alert></div>}
          </section>
          {["items", "depression"].includes(selected.kind) ? (
            <FormEditor
              key={latest.id}
              formId={selected.id}
              kind={selected.kind}
              method={(latest.scoring as { method?: string }).method ?? ""}
              items={latest.items as Item[]}
              bands={(latest.scoring as { bands?: Band[] }).bands ?? null}
              today={todayISO()}
            />
          ) : <Alert tone="info">แบบชนิดนี้ ({selected.kind}) ไม่มีข้อคำถามให้แก้ — ตัวเลือกกำหนดในระบบ</Alert>}
          <section className="card">
            <h3 className="font-semibold">ประวัติเวอร์ชัน</h3>
            <ul className="mt-2 text-sm">{versions.map((v) => <li key={v.id}>เวอร์ชัน {v.version} · เริ่มใช้ {formatThaiDate(v.effectiveFrom)}{v.note ? ` · ${v.note}` : ""}</li>)}</ul>
          </section>
        </>
      )}
    </div>
  );
}
