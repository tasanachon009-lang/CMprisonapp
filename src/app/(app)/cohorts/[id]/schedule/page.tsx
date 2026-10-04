import { notFound } from "next/navigation";
import { and, inArray, isNull } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getCohort, cohortSessions } from "@/lib/queries/cohorts";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { userNameMap } from "@/lib/queries/names";
import { Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

/** ตารางกิจกรรมของรุ่น — ขั้นนี้ดูอย่างเดียว (จัดตาราง/วิทยากร/ค่าตอบแทน อยู่ในขั้นที่ 3) */
export default async function SchedulePage({ params }: PageProps<"/cohorts/[id]/schedule">) {
  await requirePage("course.view");
  const { id } = await params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) notFound();
  const sessions = cohortSessions(db, row.cohort.id);
  const staff = sessions.length
    ? db.select().from(schema.sessionStaff).where(and(inArray(schema.sessionStaff.sessionId, sessions.map((s) => s.id)), isNull(schema.sessionStaff.deletedAt))).all()
    : [];
  const names = userNameMap(db);
  const today = todayISO();
  const days = Array.from(new Set(sessions.map((s) => s.date)));
  const totalHours = sessions.reduce((s, x) => s + x.hours, 0);

  return (
    <div className="space-y-4">
      <Alert tone="info">
        รวม {days.length} วัน {totalHours} ชั่วโมง (เป้าหมายหลักสูตร {row.course.totalHours} ชม.){totalHours !== row.course.totalHours && <b className="text-danger"> — ชั่วโมงไม่ตรงเป้า</b>}
        <span className="block text-sm text-muted">การจัด/เปลี่ยนผู้สอน ลากย้ายคาบ และค่าตอบแทน จะเปิดใช้ในขั้นที่ 3 · แม่แบบตาราง 12 วันเป็นร่าง ต้องตรวจกับคู่มือ</span>
      </Alert>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {days.map((d, i) => (
          <section key={d} className={`panel p-4 ${d === today ? "ring-2 ring-navy" : ""}`}>
            <h2 className="text-lg">วันที่ {i + 1}</h2>
            <p className="text-sm text-muted">{formatThaiDate(d, "full")}</p>
            <ul className="mt-2 space-y-2">
              {sessions.filter((s) => s.date === d).map((s) => {
                const who = staff.filter((x) => x.sessionId === s.id).map((x) => (x.userId ? names.get(x.userId) : x.externalName)).filter(Boolean);
                return (
                  <li key={s.id} className="rounded-xl bg-cream px-3 py-2">
                    <p className="font-display text-sm font-semibold text-navy">{s.startTime}–{s.endTime} · {s.hours} ชม.</p>
                    <p className="font-medium">{s.title}</p>
                    <p className="text-sm text-muted">{s.category ?? ""}{who.length ? ` · ${who.join(", ")}` : " · ยังไม่ระบุผู้รับผิดชอบ"}</p>
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
