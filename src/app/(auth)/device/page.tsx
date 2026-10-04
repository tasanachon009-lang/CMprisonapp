import { redirect } from "next/navigation";
import { getTrustedDeviceId } from "@/lib/auth/session";
import { OrgCodeForm } from "./org-code-form";

export default async function DevicePage() {
  if (await getTrustedDeviceId()) redirect("/login");
  return (
    <div className="card w-full max-w-md">
      <h2 className="text-2xl">เข้าสู่ระบบ</h2>
      <p className="mt-1 text-muted">ขั้นที่ 1 จาก 2 — ใส่รหัสหน่วยงาน (ถามหัวหน้าหรือรองหัวหน้า) เครื่องนี้จะจำไว้ 30 วัน</p>
      <OrgCodeForm />
    </div>
  );
}
