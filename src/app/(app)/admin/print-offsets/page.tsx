import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { printOffsets, PRINT_FORMS } from "@/lib/pdf/offsets";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { OffsetsForm } from "./offsets-client";

export const dynamic = "force-dynamic";

/** ปรับตำแหน่งการพิมพ์ (สเปก 22) — เครื่องพิมพ์แต่ละเครื่องเยื้องไม่เท่ากัน เลื่อนทั้งหน้าได้ ±15 มม. */
export default async function PrintOffsetsPage() {
  await requirePage("settings.manage");
  const db = getDb();
  return (
    <div className="max-w-3xl space-y-5">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "ปรับตำแหน่งการพิมพ์" }]} />
      <PageHeader en="Print Alignment" title="ปรับตำแหน่งการพิมพ์" help="ใช้เมื่อเครื่องพิมพ์พิมพ์เอกสารการเงินเยื้องจากแบบฟอร์ม ปรับเลื่อนทั้งหน้าเป็นมิลลิเมตร" />
      <Alert tone="info">
        วิธีตรวจ: กด &quot;พิมพ์ใบทดสอบ&quot; → สั่งพิมพ์แบบ <b>ขนาดจริง 100% (ไม่ย่อให้พอดีหน้า)</b> → ใช้ไม้บรรทัดวัดเครื่องหมาย + ที่มุม ต้องห่างขอบซ้ายและขอบบน 20 มม.
        ถ้าวัดได้ 22 มม. จากขอบซ้าย ให้ใส่ −2 ในช่อง ซ้าย/ขวา แล้วบันทึกและพิมพ์ใหม่
      </Alert>
      <OffsetsForm initial={printOffsets(db)} labels={PRINT_FORMS} />
    </div>
  );
}
