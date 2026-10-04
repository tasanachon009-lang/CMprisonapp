import { redirect } from "next/navigation";
import { getTrustedDeviceId } from "@/lib/auth/session";
import { NatureFrames } from "@/components/nature-frames";
import { OrgCodeForm } from "./org-code-form";

export default async function DevicePage() {
  if (await getTrustedDeviceId()) redirect("/login");
  return (
    <>
      <p lang="en" className="font-display text-xl font-medium text-navy">A New Beginning for Healing &amp; Recovery</p>
      <p className="mb-6 max-w-xl text-center text-muted">พื้นที่ทำงานของเจ้าหน้าที่ — การฟื้นฟูที่ใส่ใจ เริ่มจากข้อมูลที่ถูกต้องและปลอดภัย</p>
      <div className="card w-full max-w-md">
        <h2 className="text-2xl">เข้าสู่ระบบ</h2>
        <p className="mt-1 text-muted">ขั้นที่ 1 จาก 2 — ใส่รหัสหน่วยงาน (ถามหัวหน้าหรือรองหัวหน้า) เครื่องนี้จะจำไว้ 30 วัน</p>
        <OrgCodeForm />
      </div>
      <NatureFrames />
    </>
  );
}
