import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { OtpSetup } from "./setup-client";

export const dynamic = "force-dynamic";

export default async function OtpSetupPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  // ไม่ได้เปิดใช้ OTP (ค่าเริ่มต้น) → ไม่ต้องตั้ง
  if (!auth.otpRequired) redirect("/");
  if (auth.totpEnabled && !auth.mfaOk) redirect("/otp");
  return (
    <div className="card w-full max-w-lg">
      <h2 className="text-2xl">ตั้งค่า OTP สำหรับผู้ดูแลระบบ</h2>
      <ol className="mt-3 list-decimal space-y-1 pl-6 text-muted">
        <li>ติดตั้งแอป <b>Google Authenticator</b> หรือ <b>Microsoft Authenticator</b> ในโทรศัพท์ (ฟรี)</li>
        <li>ในแอป กด &quot;+&quot; แล้วสแกน QR ด้านล่าง (หรือพิมพ์รหัสลับ)</li>
        <li>ใส่รหัส 6 หลักที่แอปแสดง เพื่อยืนยันว่าตั้งค่าสำเร็จ</li>
      </ol>
      <OtpSetup />
    </div>
  );
}
