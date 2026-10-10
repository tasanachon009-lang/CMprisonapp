import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { DEFAULT_CONSENT_TEXT, DEFAULT_CONSENT_TITLE } from "@/lib/consent-text";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { ConsentEditor } from "./consent-editor";

export const dynamic = "force-dynamic";

/** แก้ข้อความแบบฟอร์มยินยอม PDPA (สเปก 22B) */
export default async function ConsentTextPage() {
  await requirePage("settings.manage");
  const db = getDb();
  const title = getSetting<string | null>(db, "pdpa.consentTitle", null);
  const paragraphs = getSetting<string[] | null>(db, "pdpa.consentText", null);
  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "แบบฟอร์มยินยอม PDPA" }]} />
      <PageHeader en="Consent Form" title="ข้อความแบบฟอร์มยินยอม PDPA" subtitle="ใช้กับแบบฟอร์มยินยอมที่พิมพ์จากหน้ารายชื่อรุ่น" help="ชื่อเรือนจำและชื่อหน่วยเติมจากตั้งค่าหน่วยงาน ชื่อผู้ต้องขัง เลขประจำตัว ช่องยินยอม/ไม่ยินยอม และช่องลงชื่อ ระบบใส่ให้" />
      <Alert tone="warn">กรุณาให้ผู้รับผิดชอบ PDPA ของหน่วยงานตรวจข้อความก่อนใช้งาน · การแก้ไขทุกครั้งถูกบันทึก</Alert>
      <ConsentEditor
        initialTitle={title ?? DEFAULT_CONSENT_TITLE}
        initialParagraphs={paragraphs ?? DEFAULT_CONSENT_TEXT}
        isDefault={title == null && paragraphs == null}
        org={getSetting(db, "org.name", "")}
        unit={getSetting(db, "org.unitName", "")}
      />
    </div>
  );
}
