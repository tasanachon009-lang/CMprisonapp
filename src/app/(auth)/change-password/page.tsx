import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const dynamic = "force-dynamic";

export default async function ChangePasswordPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  return (
    <div className="card w-full max-w-md">
      <h2 className="text-2xl">ตั้งรหัสผ่านใหม่</h2>
      {auth.user.mustChangePassword ? (
        <p className="mt-1 text-muted">เข้าใช้ครั้งแรก (หรือผู้ดูแลเพิ่งรีเซ็ตรหัส) กรุณาตั้งรหัสผ่านของคุณเองก่อนใช้งาน</p>
      ) : (
        <p className="mt-1 text-muted">{auth.user.fullName}</p>
      )}
      <ul className="mt-3 list-disc pl-6 text-sm text-muted">
        <li>ยาวอย่างน้อย 8 ตัว มีทั้งตัวอักษรและตัวเลข</li>
        <li>ห้ามใช้ชื่อ/นามสกุลของตัวเอง หรือ 12345678</li>
        <li>ห้ามบอกรหัสผ่านต่อกัน ห้ามจดติดหน้าจอ</li>
      </ul>
      <ChangePasswordForm />
    </div>
  );
}
