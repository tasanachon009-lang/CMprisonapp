import { redirect } from "next/navigation";
import { getAuth } from "@/lib/auth/session";
import { Avatar } from "@/components/avatar";
import { UnlockForm } from "@/components/unlock-form";

export const dynamic = "force-dynamic";

export default async function LockPage() {
  const auth = await getAuth();
  if (!auth) redirect("/login");
  if (!auth.locked) redirect("/");
  const u = auth.user;
  return (
    <div className="card w-full max-w-md">
      <div className="flex items-center gap-4">
        <Avatar first={u.firstName} last={u.lastName} color={u.color} size={64} />
        <div>
          <p className="text-sm text-muted">หน้าจอถูกล็อก</p>
          <p className="text-xl font-semibold">{u.fullName}</p>
        </div>
      </div>
      <UnlockForm redirectTo="/" />
    </div>
  );
}
