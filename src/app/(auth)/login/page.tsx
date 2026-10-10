import Link from "next/link";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireTrustedDevice, getAuth } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { PROFESSIONS } from "@/lib/auth/permissions";
import { initials } from "@/components/avatar";
import { StepDots } from "@/components/step-dots";

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
      <p lang="en" className="text-center font-display text-sm font-medium uppercase tracking-[0.18em] text-navy">Our Team</p>
      <h2 className="mb-3 mt-1 text-center text-2xl">เลือกชื่อผู้ใช้งาน</h2>
      <div className="mb-6"><StepDots current={2} total={2} /></div>
      <ul className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {users.map((u) => (
          <li key={u.id}>
            <Link href={`/login/${u.id}`} className="group block rounded-[28px] focus-visible:outline-offset-4">
              <div className="relative aspect-[4/5] overflow-hidden rounded-[28px] bg-periwinkle transition group-hover:-translate-y-1 group-hover:shadow-lg">
                {/* ลายครึ่งวงกลมสีมะนาวด้านหลัง แบบการ์ด "Our Team" */}
                <svg aria-hidden viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute inset-x-0 top-[12%] h-[52%] w-full">
                  <path d="M0 0a18 18 0 0 1 0 36Z M0 40a18 18 0 0 1 0 36Z M100 0a18 18 0 0 0 0 36Z M100 40a18 18 0 0 0 0 36Z M32 0h36v76h-36Z" fill="var(--lime)" />
                </svg>
                {u.photoPath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={`/api/files/user/${u.id}`} alt="" className="relative h-full w-full object-cover grayscale" />
                ) : (
                  <span className="relative flex h-[80%] items-center justify-center">
                    <span className="flex h-28 w-28 items-center justify-center rounded-full bg-navy font-display text-5xl font-bold text-white shadow-md">
                      {initials(u.firstName, u.lastName)}
                    </span>
                  </span>
                )}
                <div className="absolute inset-x-3 bottom-3 rounded-[22px] bg-white px-3 py-2.5 text-center shadow">
                  <p className="truncate font-semibold leading-tight">{u.firstName} {u.lastName}</p>
                  <p className="truncate text-sm leading-tight text-muted">{u.titleLabel ?? PROFESSIONS[u.profession] ?? ""}</p>
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {users.length === 0 && <p className="card text-center">ยังไม่มีบัญชีผู้ใช้ กรุณาติดต่อผู้ดูแลระบบ</p>}
    </div>
  );
}
