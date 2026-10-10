import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listTemplates } from "@/lib/services/documents";
import { DOC_KIND_LABEL, DOC_VARIABLES, templateDef } from "@/lib/docs/templates";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { TemplateEditor } from "./template-editor";

export const dynamic = "force-dynamic";

/** แม่แบบเอกสารราชการ (สเปก 18.4 "แม่แบบแก้ได้") — แก้แล้วมีผลกับเอกสารที่สร้างใหม่เท่านั้น */
export default async function DocTemplatesPage() {
  await requirePage("docs.templates");
  const db = getDb();
  const templates = listTemplates(db);
  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "แม่แบบเอกสารราชการ" }]} />
      <PageHeader en="Document templates" title="แม่แบบเอกสารราชการ" help="แก้ข้อความตั้งต้นของเอกสารแต่ละชนิด — เอกสารที่สร้างไปแล้วไม่เปลี่ยน" />
      <Alert tone="info">
        พิมพ์ <b>{"{{ชื่อตัวแปร}}"}</b> ตรงจุดที่ต้องการให้ระบบเติมข้อมูลของรุ่น · ขึ้นบรรทัดใหม่ = ย่อหน้าใหม่ · ชื่อหน่วยงานและผู้ลงนามตั้งที่ ตั้งค่าระบบ → เอกสารราชการ
      </Alert>
      <section className="card">
        <h2 className="text-xl">ตัวแปรที่ใช้ได้</h2>
        <ul className="mt-2 grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {DOC_VARIABLES.map((v) => <li key={v.key}><code className="rounded bg-cream px-1">{`{{${v.key}}}`}</code> <span className="text-muted">{v.desc}</span></li>)}
        </ul>
      </section>
      {templates.map((t) => {
        const def = templateDef(t.code)!;
        return (
          <TemplateEditor key={t.code} code={t.code} name={t.name} kindLabel={DOC_KIND_LABEL[t.kind]} customized={t.customized} showTo={t.kind !== "order"}
            known={DOC_VARIABLES.map((v) => v.key)}
            initial={{ subject: t.subject, toLine: t.toLine, body: t.body }}
            defaults={{ subject: def.subject, toLine: def.toLine, body: def.body }} />
        );
      })}
    </div>
  );
}
