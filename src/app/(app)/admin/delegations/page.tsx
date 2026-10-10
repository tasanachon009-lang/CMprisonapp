import { redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listDelegations } from "@/lib/services/delegation";
import { dutyCandidates } from "@/lib/services/duty";
import { DELEGATION_SCOPES, type DelegationScope } from "@/lib/auth/permissions";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState } from "@/components/ui";
import { DelegationForm, RevokeButton } from "./delegations-client";

export const dynamic = "force-dynamic";

/** มอบอำนาจอนุมัติชั่วคราว (สเปก 22B) — หัวหน้า/รองเท่านั้น */
export default async function DelegationsPage() {
  const auth = await requirePage("users.manage");
  if (!auth.isAdmin) redirect("/forbidden");
  const db = getDb();
  const today = todayISO();
  const names = userNameMap(db);
  const rows = listDelegations(db);
  const status = (r: (typeof rows)[number]) => (r.revokedAt ? "ยกเลิกแล้ว" : r.endDate < today ? "หมดเวลาแล้ว" : r.startDate > today ? "ยังไม่ถึงวันเริ่ม" : "มีผลอยู่");
  return (
    <div className="max-w-4xl space-y-5">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "มอบอำนาจอนุมัติชั่วคราว" }]} />
      <PageHeader en="Delegation" title="มอบอำนาจอนุมัติชั่วคราว" help="สิทธิ์คืนอัตโนมัติเมื่อครบกำหนด การอนุมัติแทนทุกครั้งถูกบันทึกพร้อมชื่อผู้มอบ ผู้รับมอบไม่สามารถอนุมัติค่าตอบแทนของตนเอง งานที่ต้องยืนยัน 2 คนมอบอำนาจไม่ได้" />
      <DelegationForm people={dutyCandidates(db)} scopes={Object.entries(DELEGATION_SCOPES).map(([k, v]) => [k, v.label])} today={today} />
      <section className="space-y-2">
        <h2 className="text-xl">รายการมอบอำนาจ</h2>
        {rows.length === 0 ? <EmptyState title="ยังไม่มีการมอบอำนาจ" /> : rows.map((r) => {
          const st = status(r);
          return (
            <article key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-white px-4 py-3">
              <span>
                <b>{names.get(r.toUserId)}</b> — {((r.scopes as string[]) ?? []).map((s) => DELEGATION_SCOPES[s as DelegationScope]?.label ?? s).join(", ")}
                <span className="block text-sm text-muted">{formatThaiDate(r.startDate)} – {formatThaiDate(r.endDate)} · มอบโดย {names.get(r.fromUserId)}{r.reason ? ` · ${r.reason}` : ""}{r.revokedAt ? ` · ยกเลิกโดย ${names.get(r.revokedBy ?? 0)} ${formatThaiDateTime(r.revokedAt)}` : ""}</span>
              </span>
              <span className="flex items-center gap-2">
                <span className={st === "มีผลอยู่" ? "tag-ok" : st === "ยังไม่ถึงวันเริ่ม" ? "tag-warn" : "tag-muted"}>{st}</span>
                {!r.revokedAt && r.endDate >= today && <RevokeButton id={r.id} />}
              </span>
            </article>
          );
        })}
      </section>
    </div>
  );
}
