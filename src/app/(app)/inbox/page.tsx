import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { messagesFor, LEVEL_LABEL } from "@/lib/services/shift";
import { userNameMap } from "@/lib/queries/names";
import { formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, Alert, EmptyState } from "@/components/ui";
import { Compose, AckButton, ResolveForm } from "./inbox-client";

export const dynamic = "force-dynamic";

const LEVEL_CLS: Record<string, string> = { normal: "border-line bg-white", important: "border-warn-bg/70 bg-warn-bg/10", red: "border-danger/60 bg-danger/5" };
const LEVEL_TAG: Record<string, string> = { normal: "tag-muted", important: "tag-warn", red: "tag-danger" };

/** กล่องจดหมายเวร (Shift Handoff) */
export default async function InboxPage({ searchParams }: PageProps<"/inbox">) {
  const auth = await requirePage("shift.use");
  const sp = await searchParams;
  const db = getDb();
  const v = { userId: auth.user.id, roles: auth.user.roles, canHealth: auth.can("health.view") };
  const msgs = messagesFor(db, v);
  const names = userNameMap(db);
  const persons = new Map(
    msgs.filter((m) => m.personId).map((m) => {
      const p = db.select().from(schema.persons).where(eq(schema.persons.id, m.personId!)).get();
      return [m.personId!, p ? `${p.firstName} ${p.lastName}` : ""];
    }),
  );
  const staff = db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users).where(eq(schema.users.status, "active")).all().filter((u) => u.id !== auth.user.id);
  const pendingAck = msgs.filter((m) => !m.mine && !m.ackedByMe);
  const today = todayISO();
  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb items={[{ label: "จดหมายเวร" }]} />
      <PageHeader en="Shift Handoff" title="กล่องจดหมายเวร" subtitle="ส่งต่องานระหว่างเวร — ผู้รับต้องกด &quot;รับทราบภารกิจ&quot; ทีละข้อ ระบบบันทึกว่าใครรับทราบเมื่อไร" />
      {sp.must && pendingAck.some((m) => m.level === "red") && <Alert tone="danger">มีข้อความระดับสีแดงที่ยังไม่รับทราบ — ต้องกด &quot;รับทราบภารกิจ&quot; ก่อนจึงจะเข้าเมนูอื่นได้</Alert>}
      <Compose staff={staff.map((s) => ({ id: s.id, name: `${s.f} ${s.l}` }))} canHealth={auth.can("health.view")} today={today} />
      <section className="space-y-3">
        {msgs.length === 0 && <EmptyState title="ยังไม่มีข้อความ" />}
        {msgs.map((m) => (
          <article key={m.id} className={`rounded-2xl border p-4 ${LEVEL_CLS[m.level]}`}>
            <div className="flex flex-wrap items-center gap-2">
              <span className={LEVEL_TAG[m.level]}>{LEVEL_LABEL[m.level]}</span>
              {m.healthRelated && <span className="tag-orange">เรื่องสุขภาพ</span>}
              {m.needsAction && (m.status === "done" ? <span className="tag-ok">ดำเนินการแล้ว</span> : <span className={m.dueDate && m.dueDate < today ? "tag-danger" : "tag-warn"}>ต้องติดตาม{m.dueDate ? ` · กำหนด ${formatThaiDate(m.dueDate)}` : ""}</span>)}
              <span className="ml-auto text-sm text-muted">{names.get(m.authorId)} · {formatThaiDateTime(m.createdAt)} · ถึง {m.recipientType === "all" ? "ทุกคน" : m.recipientType === "next_shift" ? "ผลัดถัดไป" : names.get(m.recipientUserId ?? 0)}</span>
            </div>
            <p className={`mt-2 whitespace-pre-line ${m.masked ? "italic text-muted" : "text-lg"}`}>{m.body}</p>
            {m.personId && !m.masked && <p className="mt-1 text-sm">เกี่ยวกับ: <Link href={`/persons/${m.personId}`} className="underline">{persons.get(m.personId)}</Link></p>}
            {m.status === "done" && m.resolution && <p className="mt-2 rounded-xl bg-ok/10 px-3 py-2 text-sm"><b>ผล:</b> {m.resolution} — {names.get(m.resolvedBy ?? 0)} {formatThaiDateTime(m.resolvedAt)}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!m.mine && !m.ackedByMe && <AckButton id={m.id} />}
              {!m.mine && m.ackedByMe && <span className="tag-ok">รับทราบแล้ว</span>}
              {m.mine && <span className="text-sm text-muted">อ่านแล้ว {m.acks.length} คน{m.acks.length ? `: ${m.acks.map((a) => names.get(a.userId)).join(", ")}` : " (ยังไม่มีใครอ่าน)"}</span>}
              {m.needsAction && m.status === "open" && !m.masked && <ResolveForm id={m.id} />}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
