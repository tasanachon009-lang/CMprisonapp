import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort } from "@/lib/queries/cohorts";
import { userNameMap } from "@/lib/queries/names";
import { houseMembers } from "@/lib/services/tc-house";
import { cohortRecords, openItems, recordSummary, tcList, recordLabel, RECORD_KIND_LABEL, LEVEL_LABEL, type RecordKind } from "@/lib/services/tc-tools";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { Alert, EmptyState } from "@/components/ui";
import { HelpButton } from "@/components/help-button";
import { RecordForm, RowActions } from "./tools-client";

export const dynamic = "force-dynamic";

const KIND_TAG: Record<string, string> = { tool: "tag-navy", cardinal: "tag-danger", violation: "tag-warn", reward: "tag-ok" };

/** เครื่องมือบ้าน · กฎ 5 ข้อใหญ่ · วินัย · รางวัล (สเปก 16) */
export default async function ToolsPage({ params, searchParams }: PageProps<"/cohorts/[id]/tc/tools">) {
  const auth = await requirePage("tc.view", "tc.summary");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row || row.course.code !== "FAST") notFound();
  const today = todayISO();
  const summary = recordSummary(db, row.cohort.id);

  const Summary = (
    <section className="card">
      <h2 className="flex items-center gap-1 text-xl">สรุปเครื่องมือบ้านและวินัย {!auth.can("tc.view") && <span className="tag-muted ml-2 align-middle text-sm">สรุปไม่ระบุชื่อ</span>}
        <HelpButton>เครื่องมือบ้านเรียงตามความรุนแรง 5 ขั้น: Talking to, Pull up, Hair cut, Shot down, House meeting ส่วน Confrontation, Hot chair และ Learning Experience ใช้ได้ทุกระยะ เมื่อเลือกสมาชิกและเรื่อง ระบบแนะนำขั้นถัดไปถ้าผิดซ้ำเรื่องเดิม Shot down และ Learning Experience ต้องกดปลดเมื่อครบกำหนด การละเมิดกฎ 5 ข้อใหญ่แจ้งผู้ดูแลระบบทันที</HelpButton>
      </h2>
      <div className="mt-3 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {([["เครื่องมือบ้าน", summary.tools], ["กฎ 5 ข้อใหญ่", summary.cardinal], ["ความผิดวินัย", summary.violations], ["รางวัล/สิทธิพิเศษ", summary.rewards]] as const).map(([title, list]) => (
          <div key={title}>
            <p className="font-semibold">{title} <span className="font-normal text-muted">({list.reduce((t, x) => t + x.n, 0)})</span></p>
            <ul className="mt-1 text-sm">{list.filter((x) => x.n > 0).map((x) => <li key={x.code} className="flex justify-between border-b border-line py-1"><span>{x.label}</span><span className="font-semibold">{x.n}</span></li>)}{list.every((x) => x.n === 0) && <li className="text-muted">ยังไม่มี</li>}</ul>
          </div>
        ))}
      </div>
    </section>
  );
  if (!auth.can("tc.view")) return Summary;

  const canEdit = auth.can("tc.edit") && row.cohort.status !== "closed";
  const names = userNameMap(db);
  const open = openItems(db, row.cohort.id, today);
  const records = cohortRecords(db, row.cohort.id);
  const members = houseMembers(db, row.cohort.id, today);
  const opts = (k: RecordKind) => tcList(db, k).filter((x) => x.active).map((x) => ({ value: x.code, label: x.label }));
  const topics = db.select().from(schema.lookups).where(and(eq(schema.lookups.category, "behavior_category"), eq(schema.lookups.active, true))).orderBy(asc(schema.lookups.sortOrder)).all().map((l) => ({ value: l.code, label: l.label }));
  const topicLabel = new Map(topics.map((t) => [t.value, t.label]));

  // แปลงจากบันทึกพฤติกรรมด่วน (สเปก 22B): เปิดหน้านี้พร้อม ?note=<id>
  const noteId = Number(sp.note) || 0;
  const note = noteId ? db.select().from(schema.behaviorNotes).where(and(eq(schema.behaviorNotes.id, noteId), isNull(schema.behaviorNotes.deletedAt))).get() : null;
  const noteMember = note && !note.convertedTo ? members.find((m) => m.incarcerationId === note.incarcerationId) : null;
  const prefill = note && noteMember ? { enrollmentId: noteMember.enrollmentId, behavior: note.text, topic: note.category && topicLabel.has(note.category) ? note.category : null, noteId: note.id, date: note.noteDate } : null;

  return (
    <div className="space-y-6">
      {(open.due.length > 0 || open.cardinal.length > 0) && (
        <div className="space-y-2">
          {open.due.length > 0 && <Alert tone="warn">ครบกำหนดปลดแล้ว {open.due.length} รายการ: {open.due.map((x) => `${x.p.firstName} ${x.p.lastName} (${recordLabel(db, "tool", x.r.code)} ครบ ${formatThaiDate(x.r.endDate)})`).join(" · ")}</Alert>}
          {open.cardinal.length > 0 && <Alert tone="danger">ละเมิดกฎ 5 ข้อใหญ่ที่ยังไม่บันทึกผลการดำเนินการ {open.cardinal.length} เรื่อง</Alert>}
        </div>
      )}
      {Summary}
      {canEdit && (
        <section className="card">
          <h2 className="text-xl">บันทึกรายการใหม่</h2>
          {noteId > 0 && !prefill && <div className="mt-3"><Alert tone="warn">ไม่พบบันทึกพฤติกรรมต้นทาง หรือถูกแปลงไปแล้ว</Alert></div>}
          <div className="mt-3">
            <RecordForm key={prefill?.noteId ?? 0} cohortId={row.cohort.id} today={today} prefill={prefill} topics={topics}
              members={members.map((m) => ({ value: String(m.enrollmentId), label: `${m.name} (${m.inmateNo})` }))}
              options={{ tool: opts("tool"), cardinal: opts("cardinal"), violation: opts("violation"), reward: opts("reward") }} />
          </div>
        </section>
      )}
      <section className="card">
        <h2 className="text-xl">รายการที่บันทึก</h2>
        {records.length === 0 ? <EmptyState title="ยังไม่มีรายการ" /> : (
          <div className="mt-3 overflow-x-auto">
            <table className="table-plain">
              <thead><tr><th>วันที่</th><th className="min-w-44">สมาชิก</th><th>รายการ</th><th className="min-w-64">พฤติกรรม / ผลลัพธ์</th><th>สถานะ</th>{canEdit && <th />}</tr></thead>
              <tbody>
                {records.map(({ r, p }) => {
                  const d = r.details as { requester?: string; when?: string | null; advisers?: string[] } | null;
                  return (
                    <tr key={r.id} className="align-top">
                      <td className="whitespace-nowrap">{formatThaiDate(r.recordDate)}</td>
                      <td><Link href={`/enrollments/${r.enrollmentId}/book`} className="hover:underline">{p.prefix}{p.firstName} {p.lastName}</Link></td>
                      <td><span className={KIND_TAG[r.kind] ?? "tag-muted"}>{RECORD_KIND_LABEL[r.kind as RecordKind] ?? r.kind}</span><span className="block font-semibold">{recordLabel(db, r.kind, r.code)}{r.level ? ` · ${LEVEL_LABEL[r.level] ?? r.level}` : ""}</span>{r.topic && <span className="block text-sm text-muted">เรื่อง {topicLabel.get(r.topic) ?? r.topic}</span>}</td>
                      <td>
                        <p>{r.behavior}</p>
                        {r.kind === "tool" && <p className="text-sm text-muted">ผู้ใช้เครื่องมือ {names.get(r.appliedBy ?? 0) ?? "-"}{r.observer ? ` · ผู้สังเกตการณ์ ${r.observer}` : ""}</p>}
                        {d?.requester && <p className="text-sm text-muted">ผู้ขอ {d.requester}{d.when ? ` · ${d.when}` : ""} · ผู้ให้คำแนะนำ {(d.advisers ?? []).join(", ")}</p>}
                        {r.startDate && <p className="text-sm text-muted">{formatThaiDate(r.startDate)} – {formatThaiDate(r.endDate)}{r.releasedDate ? ` · ปลด ${formatThaiDate(r.releasedDate)}` : ""}</p>}
                        {r.outcome && <p className="text-sm">ผลลัพธ์: {r.outcome}</p>}
                      </td>
                      <td>{r.status === "open" ? <span className={r.endDate && r.endDate <= today ? "tag-danger" : "tag-warn"}>{r.kind === "cardinal" ? "รอผลการดำเนินการ" : r.endDate && r.endDate <= today ? "ครบกำหนดปลด" : "อยู่ระหว่างใช้"}</span> : r.status === "cancelled" ? <span className="tag-muted">ยกเลิก (ออกจากเรือนจำ)</span> : <span className="tag-ok">เรียบร้อย</span>}</td>
                      {canEdit && <td className="text-right"><RowActions cohortId={row.cohort.id} id={r.id} open={r.status === "open"} today={today} closeLabel={r.kind === "cardinal" ? "บันทึกผล" : "ปลด"} /></td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
