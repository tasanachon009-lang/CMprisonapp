import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";

export function DocHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  const db = getDb();
  return (
    <header className="center" style={{ marginBottom: 8 }}>
      <p style={{ margin: 0 }}>{getSetting(db, "org.unitName", "")} {getSetting(db, "org.name", "")}</p>
      <h1>{title}</h1>
      {subtitle && <p style={{ margin: 0 }}>{subtitle}</p>}
    </header>
  );
}

export function DocFooter({ text }: { text: string }) {
  return (
    <div className="doc-footer">
      <span>{text}</span>
      <span>เอกสารภายใน — ข้อมูลบุคคลเป็นความลับ</span>
    </div>
  );
}
