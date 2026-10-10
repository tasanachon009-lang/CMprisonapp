import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { getDb, schema } from "@/lib/db";
import { requireTrustedDevice } from "@/lib/auth/session";
import { PROFESSIONS } from "@/lib/auth/permissions";
import { Avatar } from "@/components/avatar";
import { StepDots } from "@/components/step-dots";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

export default async function PasswordPage({ params }: PageProps<"/login/[id]">) {
  await requireTrustedDevice();
  const { id } = await params;
  const u = getDb().select().from(schema.users).where(eq(schema.users.id, Number(id))).get();
  if (!u || u.status !== "active" || u.deletedAt) notFound();
  return (
    <div className="card w-full max-w-md">
      <Link href="/login" className="btn-ghost btn-sm mb-4"><ArrowLeft size={18} aria-hidden /> เลือกชื่ออื่น</Link>
      <div className="flex items-center gap-4">
        <Avatar first={u.firstName} last={u.lastName} src={u.photoPath ? `/api/files/user/${u.id}` : null} color={u.color} size={64} />
        <div>
          <p className="text-xl font-semibold">{u.prefix}{u.firstName} {u.lastName}</p>
          <p className="text-muted">{u.titleLabel ?? PROFESSIONS[u.profession]}</p>
        </div>
      </div>
      <PasswordForm userId={u.id} />
      <div className="mt-5"><StepDots current={2} total={2} /></div>
    </div>
  );
}
