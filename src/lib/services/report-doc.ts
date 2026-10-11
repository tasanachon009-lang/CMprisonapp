import { eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { getSetting } from "../bootstrap";
import { buildDocView, localizeAnnex, type Endorsement } from "../docs/view";
import { orgInfo } from "./documents";
import { periodEndOf, type WeeklyData } from "./weekly-report";
import { reportModel, reportMemo } from "./report-memo";

type Report = typeof schema.weeklyReports.$inferSelect;

/**
 * รายงานประจำสัปดาห์/เดือน → บันทึกข้อความ (แม่แบบกลาง 18.3A) + สิ่งที่ส่งมาด้วย
 * ใช้ร่วมกันทั้งหน้าพิมพ์ (PDF) และไฟล์ Word เพื่อให้ออกมาเหมือนกัน
 * สายลงนาม (สเปก 2.2-0, 18.2A): ผู้รายงาน → (หัวหน้าสถานฟื้นฟู ถ้าไม่ใช่ผู้รายงาน) → ผอ.สถานพยาบาล (เห็นชอบ) → ผู้บัญชาการ (ทราบ/สั่งการ)
 */
export function reportDocument(db: DB, r: Report) {
  const s = (k: string) => (getSetting<string>(db, k, "") ?? "").trim();
  const org = orgInfo(db);
  const model = reportModel({ ...(r.data as WeeklyData), monday: r.weekStart, sunday: periodEndOf(r) });
  const approver = r.approvedBy ? db.select().from(schema.users).where(eq(schema.users.id, r.approvedBy)).get() : null;
  const signerName = approver ? `${approver.prefix ?? ""}${approver.firstName} ${approver.lastName}` : null;
  const via = s("docs.weeklyTo") || "ผู้อำนวยการสถานพยาบาล", head = s("org.headTitle") || "ผู้บัญชาการเรือนจำ";
  const unitHeadName = s("docs.unitHeadName"), unitHeadTitle = s("docs.unitHeadTitle") || `หัวหน้า${org.unitName}`;
  const signerIsHead = !!signerName && !!unitHeadName && signerName.replace(/\s+/g, "") === unitHeadName.replace(/\s+/g, "");
  const endorsements: Endorsement[] = [
    ...(unitHeadName && !signerIsHead ? [{ heading: "ความเห็นหัวหน้าสถานฟื้นฟูฯ", name: unitHeadName, title: unitHeadTitle }] : []),
    { heading: `ความเห็น${via}`, title: via },
    { heading: "ทราบ / ข้อสั่งการ", name: s("org.headName"), title: head },
  ];
  const { doc, annex } = reportMemo(model, { issues: r.issues, nextPlan: r.nextPlan, note: r.note }, {
    unitName: org.unitName, toLine: `${head} (ผ่าน${via})`,
    signerName, signerTitle: signerIsHead ? unitHeadTitle : approver?.position?.trim() || "ผู้รายงาน",
    docNo: s("org.docPrefix") || null, docDate: r.approvedAt ? r.approvedAt.toISOString().slice(0, 10) : null, endorsements,
  });
  return { model, view: buildDocView(doc, org), annex: localizeAnnex(annex, org.thaiNumerals) };
}
