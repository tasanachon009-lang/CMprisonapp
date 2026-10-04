import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { OtpForm } from "./otp-form";

export const dynamic = "force-dynamic";

/** ผู้ดูแลระบบ: ยืนยันตัวตนขั้นที่ 2 ด้วยรหัสจากแอปมือถือ */
export default async function OtpPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.otpRequired || auth.mfaOk) redirect("/");
  if (!auth.totpEnabled) redirect("/otp/setup");
  return (
    <div className="card w-full max-w-md">
      <h2 className="text-2xl">ยืนยันรหัส OTP</h2>
      <p className="mt-1 text-muted">ผู้ดูแลระบบต้องยืนยันตัวตน 2 ขั้น — เปิดแอป Authenticator ในโทรศัพท์ แล้วใส่รหัส 6 หลัก</p>
      <OtpForm />
      <p className="hint mt-4">โทรศัพท์หาย/เปลี่ยนเครื่อง: ให้ผู้ดูแลอีกคนขอ &quot;รีเซ็ต OTP&quot; ในหน้าผู้ใช้ (ยืนยัน 2 คน) หรือใช้ขั้นตอนรหัสฉุกเฉินใน README</p>
    </div>
  );
}
