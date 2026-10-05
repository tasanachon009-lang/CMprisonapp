import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { lookupsOf } from "@/lib/queries/lookups";
import { addDays, formatThaiDate, todayISO, weekdayOf } from "@/lib/thai-date";
import { userNameMap, instructorNameMap } from "@/lib/queries/names";
import { listInstructors } from "@/lib/services/instructors";
import { listTopics } from "@/lib/services/pay-setup";
import { scheduleIssues, maxStaffOf } from "@/lib/services/schedule";
import { payableOverage, locationConflicts } from "@/lib/services/schedule-edit";
import { ACTIVITY_TYPE_LABEL } from "@/lib/reference-data";
import { makeupNeeded, invitationText } from "@/lib/services/session-close";
import { getSetting } from "@/lib/bootstrap";
import { cohortLabel } from "@/lib/services/cohorts";
import { Alert } from "@/components/ui";
import { StaffNames, SessionStaffEditor, type StaffView } from "./schedule-client";
import { AddSessionButton, ReplaceStaffButton, WeekBoard } from "./schedule-tools";

export const dynamic = "force-dynamic";

const WD = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** ตารางกิจกรรมของรุ่น (สเปก 11.4) — การ์ดรายวัน / ปฏิทินรายสัปดาห์ลากย้ายได้ · วิทยากรหลายคนต่อคาบ · ตรวจความทับซ้อน */
export default async function SchedulePage({ params, searchParams }: PageProps<"/cohorts/[id]/schedule">) {
  const auth = await requirePage("course.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const view = sp.view === "week" ? "week" : "days";
  const sessions = cohortSessions(db, row.cohort.id);
  const { staff, issues } = scheduleIssues(db, sessions);
  const payOver = payableOverage(db, sessions);
  const locClash = new Map(sessions.filter((s) => s.status !== "cancelled").map((s) => [s.id, locationConflicts(db, s)] as const).filter(([, l]) => l.length));
  const names = userNameMap(db);
  const insNames = instructorNameMap(db);
  const topicRows = listTopics(db, row.course.id);
  const topics = new Map(topicRows.map((t) => [t.id, t]));
  const locations = lookupsOf(db, "location").map((l) => l.label);
  const canEdit = auth.can("schedule.edit") && row.cohort.status !== "closed";
  const externals = canEdit ? listInstructors(db).filter((i) => i.kind === "external" && i.active).map((i) => ({ id: i.id, name: i.displayName, org: i.organization, ready: i.readiness.ready })) : [];
  const today = todayISO();
  const makeups = makeupNeeded(db, row.cohort.id);
  const org = `${getSetting<string>(db, "org.unitName", "")} ${getSetting<string>(db, "org.name", "")}`.trim();
  const label = `${row.course.shortName} ${cohortLabel(row.cohort)}`;
  const days = Array.from(new Set(sessions.map((s) => s.date)));
  const active = sessions.filter((s) => s.status !== "cancelled");
  const totalHours = active.reduce((s, x) => s + x.hours, 0);
  const options = canEdit
    ? db.select({ id: schema.users.id, f: schema.users.firstName, l: schema.users.lastName }).from(schema.users)
      .where(and(eq(schema.users.status, "active"), isNull(schema.users.deletedAt))).orderBy(asc(schema.users.sortOrder)).all()
      .map((u) => ({ id: u.id, name: `${u.f} ${u.l}` }))
    : [];
  const people = [...options.map((o) => ({ key: `u${o.id}`, label: `${o.name} (ใน)`, userId: o.id, instructorId: null })), ...externals.map((e) => ({ key: `i${e.id}`, label: `${e.name} (นอก)`, userId: null, instructorId: e.id }))];
  const topicOpts = topicRows.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, standardHours: t.standardHours }));
  const fmtConflict = (c: { title: string; label: string; startTime: string; endTime: string }) => `${c.title} (${c.label}) ${c.startTime}–${c.endTime}`;
  const staffView = (sessionId: number): StaffView[] => {
    const iss = issues.get(sessionId);
    const s = sessions.find((x) => x.id === sessionId)!;
    return staff
      .filter((x) => x.sessionId === sessionId)
      .sort((a, b) => (a.role === "lead" ? -1 : 0) - (b.role === "lead" ? -1 : 0) || a.id - b.id)
      .map((x) => ({
        id: x.id, userId: x.userId, instructorId: x.instructorId, name: x.userId ? names.get(x.userId) ?? "-" : x.instructorId ? insNames.get(x.instructorId) ?? "-" : x.externalName ?? "-", external: !x.userId, unregistered: !x.userId && !x.instructorId, role: x.role,
        conflicts: (iss?.conflicts.find((c) => c.staffId === x.id)?.with ?? []).map(fmtConflict),
        ...(!x.userId ? {
          // สเปก 11.5A: สถานะการเชิญ · เตือนเมื่ออีก ≤ 14 วันยังไม่ตอบรับ/ยืนยัน
          invite: x.inviteStatus ?? "none",
          inviteWarn: s.status !== "cancelled" && s.date >= today && s.date <= addDays(today, 14) && !["accepted", "confirmed"].includes(x.inviteStatus ?? "none"),
          inviteText: invitationText({ name: x.instructorId ? insNames.get(x.instructorId) ?? "-" : x.externalName ?? "-", title: s.title, date: s.date, startTime: s.startTime, endTime: s.endTime, location: s.location, cohortLabel: label, org }, (d) => formatThaiDate(d, "full")),
        } : {}),
      }));
  };
  const counts = { noStaff: 0, overMax: 0, conflicts: 0 };
  for (const v of issues.values()) {
    if (v.noStaff) counts.noStaff++;
    if (v.overMax != null) counts.overMax++;
    counts.conflicts += v.conflicts.length;
  }

  const card = (s: (typeof sessions)[number], compact = false) => {
    const who = staffView(s.id);
    const iss = issues.get(s.id);
    const max = maxStaffOf(db, s);
    const po = payOver.get(s.id);
    const lc = locClash.get(s.id) ?? [];
    const lockedReason = row.cohort.status === "closed" ? "รุ่นนี้ปิดแล้ว แก้ตารางไม่ได้" : s.lockedAt ? "คาบนี้ล็อกแล้ว (อนุมัติค่าตอบแทนแล้ว)" : s.status === "cancelled" ? "คาบนี้ถูกยกเลิก" : null;
    return (
      <div className={s.status === "cancelled" ? "opacity-60" : ""}>
        <p className="font-display text-sm font-semibold text-navy">{s.startTime}–{s.endTime} · {s.hours} ชม.</p>
        <p className={`font-medium ${s.status === "cancelled" ? "line-through" : ""}`}>{s.title} {s.topicId && topics.get(s.topicId)?.payable && <span title="คาบที่เบิกค่าตอบแทนได้" aria-label="เบิกได้">💰</span>}{s.status === "cancelled" && <span className="tag-muted ml-1 no-underline">ยกเลิก</span>}</p>
        {!compact && s.category && <p className="text-xs text-muted">{s.category}</p>}
        {s.location && <p className={`text-xs ${lc.length ? "font-semibold text-danger" : "text-muted"}`}>📍 {s.location}{lc.length ? ` — ใช้ซ้อนกับ ${lc.map(fmtConflict).join(", ")}` : ""}</p>}
        <div className="mt-1"><StaffNames staff={who} /></div>
        {iss?.overMax != null && <p className="mt-1 text-sm text-danger">วิทยากรเกินจำนวนสูงสุด ({iss.overMax} คน)</p>}
        {makeups.get(s.id) && !makeups.get(s.id)!.makeupId && <p className="mt-1"><Link href={`/sessions/${s.id}`} className="tag-warn">ควรจัดสอนชดเชย ({makeups.get(s.id)!.count} คน)</Link></p>}
        {s.makeupOfId && <p className="mt-1"><span className="tag-navy">คาบชดเชย</span></p>}
        {!compact && s.status !== "cancelled" && s.date <= today && <p className="mt-1 text-xs">{s.taughtAt ? <span className="tag-ok">บันทึกผลแล้ว</span> : <Link href={`/sessions/${s.id}`} className="tag-danger">ยังไม่บันทึกผล</Link>}</p>}
        {po && <p className="mt-1 text-sm text-warn">เกินที่เบิกได้: {ACTIVITY_TYPE_LABEL[po.type]} เบิกได้ {po.limit} คน (มี {po.count})</p>}
        {(canEdit || who.length > 0) && (
          <SessionStaffEditor
            cohortId={row.cohort.id}
            session={{ id: s.id, title: s.title, startTime: s.startTime, endTime: s.endTime, hours: s.hours, category: s.category, status: s.status, date: s.date, location: s.location, topicId: s.topicId, checked: !!s.attendanceCheckedAt }}
            staff={who}
            options={options}
            externals={externals}
            topics={topicOpts}
            locations={locations}
            max={Number.isFinite(max) ? max : null}
            editable={canEdit && !lockedReason}
            lockedReason={canEdit ? lockedReason : null}
          />
        )}
      </div>
    );
  };

  // สัปดาห์ที่แสดง (จันทร์–อาทิตย์)
  const weekStart = (() => {
    const base = typeof sp.week === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today >= row.cohort.startDate && today <= row.cohort.endDate ? today : row.cohort.startDate;
    const wd = weekdayOf(base);
    return addDays(base, wd === 0 ? -6 : 1 - wd);
  })();
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)).filter((d, i) => i < 5 || sessions.some((s) => s.date === d));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {([["days", "การ์ดรายวัน"], ["week", "ปฏิทินรายสัปดาห์"]] as const).map(([v, l]) => (
          <Link key={v} href={`?view=${v}`} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${view === v ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{l}</Link>
        ))}
        <span className="ml-auto flex flex-wrap gap-2">
          {canEdit && <AddSessionButton cohortId={row.cohort.id} topics={topicOpts} locations={locations} defaultDate={today >= row.cohort.startDate && today <= row.cohort.endDate ? today : row.cohort.startDate} />}
          {canEdit && <ReplaceStaffButton cohortId={row.cohort.id} people={people} dateFrom={today > row.cohort.startDate && today <= row.cohort.endDate ? today : row.cohort.startDate} dateTo={row.cohort.endDate} />}
        </span>
      </div>
      <Alert tone="info">
        รวม {days.length} วัน {totalHours} ชั่วโมง (เป้าหมายหลักสูตร {row.course.totalHours} ชม.){totalHours !== row.course.totalHours && <b className="text-danger"> — ชั่วโมงไม่ตรงเป้า ({totalHours > row.course.totalHours ? "เกิน" : "ขาด"} {Math.abs(totalHours - row.course.totalHours)} ชม.)</b>}
        <span className="block text-sm text-muted">{canEdit ? "กด \"แก้คาบ / วิทยากร\" เพื่อเปลี่ยนวัน เวลา สถานที่ หรือวิทยากร · ปฏิทินรายสัปดาห์ลากย้ายคาบได้" : "ดูอย่างเดียว"} · 💰 = คาบที่เบิกค่าตอบแทนได้</span>
      </Alert>
      {(counts.noStaff > 0 || counts.overMax > 0 || counts.conflicts > 0 || payOver.size > 0 || locClash.size > 0) && (
        <Alert tone="warn">
          ตรวจตาราง:{counts.noStaff > 0 && ` ไม่มีผู้รับผิดชอบ ${counts.noStaff} คาบ`}{counts.conflicts > 0 && ` · วิทยากรสอนซ้อนเวลา ${counts.conflicts} รายการ`}{locClash.size > 0 && ` · สถานที่ใช้ซ้อน ${locClash.size} คาบ`}{counts.overMax > 0 && ` · วิทยากรเกินจำนวนสูงสุด ${counts.overMax} คาบ`}{payOver.size > 0 && ` · วิทยากรเกินที่เบิกได้ ${payOver.size} คาบ`}
        </Alert>
      )}

      {view === "week" ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`?view=week&week=${addDays(weekStart, -7)}`} className="btn-ghost btn-sm">← สัปดาห์ก่อน</Link>
            <span className="font-semibold">{formatThaiDate(weekStart)} – {formatThaiDate(addDays(weekStart, 6))}</span>
            <Link href={`?view=week&week=${addDays(weekStart, 7)}`} className="btn-ghost btn-sm">สัปดาห์ถัดไป →</Link>
          </div>
          <WeekBoard
            cohortId={row.cohort.id}
            editable={canEdit}
            days={weekDates.map((d) => ({ date: d, label: `${WD[weekdayOf(d)]} ${formatThaiDate(d)}${days.includes(d) ? ` · วันที่ ${days.indexOf(d) + 1}` : ""}`, isToday: d === today, inCohort: d >= row.cohort.startDate && d <= addDays(row.cohort.endDate, 14) }))}
            cards={sessions.filter((s) => weekDates.includes(s.date)).map((s) => ({ id: s.id, date: s.date, movable: !s.lockedAt && !s.attendanceCheckedAt && s.status !== "cancelled", node: card(s, true) }))}
          />
        </>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {days.map((d, i) => (
            <section key={d} className={`panel p-4 ${d === today ? "ring-2 ring-navy" : ""}`}>
              <h2 className="text-lg">วันที่ {i + 1}</h2>
              <p className="text-sm text-muted">{formatThaiDate(d, "full")}</p>
              <ul className="mt-2 space-y-2">
                {sessions.filter((s) => s.date === d).map((s) => <li key={s.id} className="rounded-xl bg-cream px-3 py-2">{card(s)}</li>)}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
