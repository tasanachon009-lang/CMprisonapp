import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { searchPersons } from "@/lib/queries/persons";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { SearchBox } from "./search-box";

export const dynamic = "force-dynamic";

export default async function PersonsPage({ searchParams }: PageProps<"/persons">) {
  await requirePage("registry.view");
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const results = q ? searchPersons(getDb(), q) : [];
  return (
    <div className="max-w-4xl">
      <Breadcrumb items={[{ label: "ค้นหาบุคคล" }]} />
      <PageHeader title="ค้นหาบุคคล" subtitle="พิมพ์ชื่อ นามสกุล หรือเลขประจำตัว 2–3 ตัวขึ้นไป (กด / จากหน้าใดก็ได้เพื่อมาที่นี่)" />
      <SearchBox initial={q} autoFocus={sp.focus === "1" || !q} />
      <div className="mt-6 space-y-2">
        {q && results.length === 0 && <EmptyState title={`ไม่พบ "${q}"`}>ลองพิมพ์แค่ชื่อ หรือแค่บางส่วนของเลขประจำตัว</EmptyState>}
        {results.map(({ person: p, current, incarcerationCount }) => (
          <Link key={p.id} href={`/persons/${p.id}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white px-4 py-3 hover:border-navy">
            <Avatar first={p.firstName} last={p.lastName} src={current?.thumbPath ? `/api/files/photo/${current.id}?s=thumb` : null} size={48} color="var(--lime)" />
            <div className="flex-1">
              <p className="font-semibold">{p.prefix}{p.firstName} {p.lastName}</p>
              <p className="text-sm text-muted">เลขประจำตัว {current?.inmateNo ?? "-"}{current?.zone ? ` · ${current.zone}` : ""}</p>
            </div>
            {current?.releasedDate && <span className="tag-muted">ออกจากเรือนจำแล้ว</span>}
            {incarcerationCount > 1 && <span className="tag-warn">ต้องโทษ {incarcerationCount} ครั้ง</span>}
          </Link>
        ))}
      </div>
    </div>
  );
}
