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
      <p className="hint mt-4">กรณีโทรศัพท์สูญหายหรือเปลี่ยนเครื่อง กรุณาติดต่อผู้ดูแลระบบ</p>
    </div>
  );
}
