import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { listRates } from "@/lib/services/pay-setup";
import { currentFiscalYear } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { RatesEditor, PaySettingsForm } from "./rates-client";

export const dynamic = "force-dynamic";

/** อัตราค่าตอบแทน (สเปก 11.1) — ผู้ดูแล + การเงิน */
export default async function RatesPage() {
  await requirePage("rates.manage");
  const db = getDb();
  const rates = listRates(db);
  const samples = rates.filter((r) => r.isSample && r.active);
  return (
    <div className="max-w-5xl space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "อัตราค่าตอบแทน" }]} />
      <PageHeader en="Rates" title="อัตราค่าตอบแทนวิทยากร" help="ตั้งปีละครั้ง ค่าตอบแทนแต่ละคาบใช้อัตราที่มีผล ณ ปีงบของวันสอน การแก้อัตราภายหลังไม่กระทบคาบที่อนุมัติแล้ว จำนวนวิทยากรที่เบิกได้ต่อคาบเป็นค่าตัวอย่างตามระเบียบค่าใช้จ่ายในการฝึกอบรม ควรให้การเงินตรวจ ระบบเตือนเมื่อเกิน" />
      {samples.length > 0 && <Alert tone="warn">ยังมีอัตราตัวอย่าง {samples.length} รายการ ({samples.map((r) => r.name).join(", ")}) — แก้เป็นอัตราจริงของหน่วยงานก่อนเริ่มเบิกจ่าย</Alert>}
      <RatesEditor fy={currentFiscalYear()} rates={rates.map((r) => ({ id: r.id, name: r.name, kind: r.kind as "internal", externalType: r.externalType, perHourBaht: r.perHourSatang / 100, dailyCapBaht: r.dailyCapSatang == null ? null : r.dailyCapSatang / 100, fromFiscalYear: r.fromFiscalYear, active: r.active, isSample: r.isSample, note: r.note }))} />
      <PaySettingsForm
        maxPayableByType={getSetting<Record<string, number>>(db, "pay.maxPayableByType", { lecture: 1, panel: 5, group: 2, practice: 2, other: 1 })}
      />
    </div>
  );
}
