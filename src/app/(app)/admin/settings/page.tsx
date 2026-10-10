import { asc, eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { Breadcrumb, PageHeader } from "@/components/ui";
import { OrgForm, DocSettingsForm, OrgCodeForm, AdminSecurityForm, HolidaysEditor, LookupEditor } from "./settings-client";

export const dynamic = "force-dynamic";

const LOOKUP_CATS: Record<string, string> = { tc_team: "ทีมงานของชุมชนบำบัด (งานบำบัด)", tc_position: "ตำแหน่งในบ้านของชุมชนบำบัด (เรียงสูงไปต่ำ)", release_reason: "เหตุผลการออกจากเรือนจำ", drop_reason: "เหตุผลการออกจากหลักสูตร", location: "สถานที่", substance: "สารเสพติด", prisoner_class: "ชั้นนักโทษ" };

export default async function SettingsPage() {
  await requirePage("settings.manage");
  const db = getDb();
  const s = (k: string, d: unknown) => getSetting(db, k, d);
  const holidays = db.select().from(schema.holidays).orderBy(asc(schema.holidays.date)).all();
  const lookups = Object.fromEntries(Object.keys(LOOKUP_CATS).map((c) => [c, db.select().from(schema.lookups).where(eq(schema.lookups.category, c)).orderBy(asc(schema.lookups.sortOrder)).all().map((l) => ({ code: l.code, label: l.label, active: l.active }))]));
  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "ตั้งค่าระบบ" }]} />
      <PageHeader en="System Settings" title="ตั้งค่าระบบ" help="ข้อมูลเอกสารราชการแก้ในเอกสารแต่ละฉบับได้อีกครั้งก่อนพิมพ์ OTP ปิดเป็นค่าเริ่มต้นเพราะไม่สะดวกนำโทรศัพท์เข้าเรือนจำ รหัสหน่วยงานควรเปลี่ยนเมื่อมีเจ้าหน้าที่ย้ายออก วันหยุดใช้คำนวณวันสิ้นสุดรุ่นและการส่ง LINE" />
      <OrgForm initial={{
        "org.name": s("org.name", "") as string, "org.unitName": s("org.unitName", "") as string, "org.type": s("org.type", "") as string,
        "org.address": s("org.address", "") as string, "org.phone": s("org.phone", "") as string, "org.headTitle": s("org.headTitle", "") as string,
        "pdpa.consentRequired": s("pdpa.consentRequired", true) as boolean, "security.idleLockMinutes": s("security.idleLockMinutes", 15) as number,
      }} />
      <DocSettingsForm initial={{
        "org.headName": s("org.headName", "") as string, "org.docPrefix": s("org.docPrefix", "") as string,
        "docs.unitHeadName": s("docs.unitHeadName", "") as string, "docs.unitHeadTitle": s("docs.unitHeadTitle", "") as string, "docs.thaiNumerals": s("docs.thaiNumerals", true) !== false,
      }} />
      <AdminSecurityForm adminOtp={s("security.adminOtp", false) === true} officeHours={s("security.officeHours", { start: "07:00", end: "18:00" }) as { start: string; end: string }} />
      <OrgCodeForm />
      <HolidaysEditor holidays={holidays.map((h) => ({ date: h.date, name: h.name }))} />
      {Object.entries(LOOKUP_CATS).map(([c, title]) => <LookupEditor key={c} category={c} title={title} items={lookups[c]} />)}
    </div>
  );
}
