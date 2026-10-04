import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { userNameMap } from "@/lib/queries/names";
import { scheduleIssues, maxStaffOf } from "@/lib/services/schedule";
import { Alert } from "@/components/ui";
import { StaffNames, SessionStaffEditor, type StaffView } from "./schedule-client";

export const dynamic = "force-dynamic";

/** ตารางกิจกรรมของรุ่น — จัดวิทยากรได้หลายคนต่อคาบ (สเปก 11.4) · ลากย้ายคาบ/ค่าตอบแทนอยู่ในขั้นที่ 3 */
export default async function SchedulePage({ params }: PageProps<"/cohorts/[id]/schedule">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const sessions = cohortSessions(db, row.cohort.id);
  const { staff, issues } = scheduleIssues(db, sessions);
  const names = userNameMap(db);
  const today = todayISO();
  const days = Array.from(new Set(sessions.map((s) => s.date)));
  const totalHours = sessions.reduce((s, x) => s + x.hours, 0);
  const canEdit = auth.can("schedule.edit") && row.cohort.status !== "closed";
  const options = canEdit
    ? db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users)
      .where(and(eq(schema.users.status, "active"), isNull(schema.users.deletedAt))).orderBy(asc(schema.users.sortOrder)).all()
      .map((u) => ({ id: u.id, name: `${u.f} ${u.l}` }))
    : [];
  const fmtConflict = (c: { title: string; label: string; startTime: string; endTime: string }) => `${c.title} (${c.label}) ${c.startTime}–${c.endTime}`;
  const staffView = (sessionId: number): StaffView[] => {
    const iss = issues.get(sessionId);
    return staff
      .filter((x) => x.sessionId === sessionId)
      .sort((a, b) => (a.role === "lead" ? -1 : 0) - (b.role === "lead" ? -1 : 0) || a.id - b.id)
      .map((x) => ({
        id: x.id, userId: x.userId, name: x.userId ? names.get(x.userId) ?? "-" : x.externalName ?? "-", external: !x.userId, role: x.role,
        conflicts: (iss?.conflicts.find((c) => c.staffId === x.id)?.with ?? []).map(fmtConflict),
      }));
  };
  const counts = { noStaff: 0, overMax: 0, conflicts: 0 };
  for (const v of issues.values()) {
    if (v.noStaff) counts.noStaff++;
    if (v.overMax != null) counts.overMax++;
    counts.conflicts += v.conflicts.length;
  }

  return (
    <div className="space-y-4">
      <Alert tone="info">
        รวม {days.length} วัน {totalHours} ชั่วโมง (เป้าหมายหลักสูตร {row.course.totalHours} ชม.){totalHours !== row.course.totalHours && <b className="text-danger"> — ชั่วโมงไม่ตรงเป้า</b>}
        <span className="block text-sm text-muted">1 คาบมีวิทยากรได้หลายคน (ภายใน/ภายนอก) — {canEdit ? "กดปุ่ม \"วิทยากร\" ในการ์ดคาบเพื่อเพิ่ม/เอาออก" : "ดูอย่างเดียว"} · ลากย้ายคาบและค่าตอบแทนจะเปิดใช้ในขั้นที่ 3</span>
      </Alert>
      {(counts.noStaff > 0 || counts.overMax > 0 || counts.conflicts > 0) && (
        <Alert tone="warn">
          ตรวจตาราง:{counts.noStaff > 0 && ` ไม่มีผู้รับผิดชอบ ${counts.noStaff} คาบ`}{counts.conflicts > 0 && ` · สอนซ้อนเวลา ${counts.conflicts} รายการ`}{counts.overMax > 0 && ` · วิทยากรเกินจำนวน ${counts.overMax} คาบ`}
        </Alert>
      )}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d, i) => (
          <section key={d} className={`panel p-4 ${d === today ? "ring-2 ring-navy" : ""}`}>
            <h2 className="text-lg">วันที่ {i + 1}</h2>
            <p className="text-sm text-muted">{formatThaiDate(d, "full")}</p>
            <ul className="mt-2 space-y-2">
              {sessions.filter((s) => s.date === d).map((s) => {
                const who = staffView(s.id);
                const iss = issues.get(s.id);
                const max = maxStaffOf(db, s);
                const lockedReason = row.cohort.status === "closed" ? "รุ่นนี้ปิดแล้ว แก้ตารางไม่ได้" : s.lockedAt ? "คาบนี้ล็อกแล้ว (อนุมัติค่าตอบแทนแล้ว)" : s.status === "cancelled" ? "คาบนี้ถูกยกเลิก" : null;
                return (
                  <li key={s.id} className={`rounded-xl px-3 py-2 ${s.status === "cancelled" ? "bg-line/40 line-through" : "bg-cream"}`}>
                    <p className="font-display text-sm font-semibold text-navy">{s.startTime}–{s.endTime} · {s.hours} ชม.</p>
                    <p className="font-medium">{s.title}</p>
                    {s.category && <p className="text-xs text-muted">{s.category}</p>}
                    <div className="mt-1"><StaffNames staff={who} /></div>
                    {iss?.overMax != null && <p className="mt-1 text-sm text-danger">วิทยากรเกินจำนวนสูงสุด ({iss.overMax} คน)</p>}
                    {(canEdit || who.length > 0) && (
                      <SessionStaffEditor
                        cohortId={row.cohort.id}
                        session={{ id: s.id, title: s.title, startTime: s.startTime, endTime: s.endTime, hours: s.hours, category: s.category, status: s.status }}
                        staff={who}
                        options={options}
                        max={Number.isFinite(max) ? max : null}
                        editable={canEdit && !lockedReason}
                        lockedReason={canEdit ? lockedReason : null}
                      />
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
