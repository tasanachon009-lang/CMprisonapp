import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireTrustedDevice, getAuth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PROFESSIONS } from "@/lib/auth/permissions";
import { initials } from "@/components/avatar";

export const dynamic = "force-dynamic";

/** ชั้นที่ 2: การ์ดบุคลากรแบบ "Our Team" — กดชื่อตัวเอง */
export default async function LoginPage() {
  await requireTrustedDevice();
  const auth = await getAuth();
  if (auth && !auth.locked) redirect("/");
  const users = getDb()
    .select()
    .from(schema.users)
    .where(and(eq(schema.users.status, "active"), isNull(schema.users.deletedAt)))
    .orderBy(asc(schema.users.sortOrder), asc(schema.users.firstName))
    .all();

  return (
    <div className="w-full">
      <p className="mb-6 text-center text-lg text-muted">ขั้นที่ 2 จาก 2 — กดที่ชื่อของคุณ</p>
      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/login/${u.id}`} className="group block rounded-[28px] focus-visible:outline-offset-4">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-periwinkle transition group-hover:-translate-y-1 group-hover:shadow-lg">
                <span aria-hidden className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-lime" />
                <span aria-hidden className="absolute -bottom-10 -left-8 h-32 w-32 rounded-full bg-lime/70" />
                {u.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/user/${u.id}`} alt="" className="relative h-full w-full object-cover grayscale" />
                ) : (
                  <span className="relative flex h-full items-center justify-center font-display text-6xl font-bold text-white/95">
                    {initials(u.firstName, u.lastName)}
                  </span>
                )}
                <div className="absolute inset-x-3 bottom-3 rounded-full bg-white px-3 py-2 text-center shadow">
                  <p className="truncate font-semibold leading-tight">{u.firstName} {u.lastName}</p>
                  <p className="truncate text-sm leading-tight text-muted">{u.titleLabel ?? PROFESSIONS[u.profession] ?? ""}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p className="card text-center">ยังไม่มีบัญชีผู้ใช้ กรุณารันสคริปต์ติดตั้งเพื่อสร้างบัญชีหัวหน้าคนแรก</p>}
    </div>
  );
}
