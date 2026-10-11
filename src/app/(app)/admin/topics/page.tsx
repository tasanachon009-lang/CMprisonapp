import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { listRates, listTopics } from "@/lib/services/pay-setup";
import { listInstructors } from "@/lib/services/instructors";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { TopicsEditor } from "./topics-client";
import { TopicQuickSetup } from "./quick-client";
import { TopicChipsEditor, ReportChoicesEditor } from "./chips-client";
import { getSetting } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

/** คลังหัวข้อ (สเปก 11.3) — ตั้งครั้งเดียวต่อหลักสูตร */
export default async function TopicsPage({ searchParams }: PageProps<"/admin/topics">) {
  const auth = await requirePage("topics.manage");
  const sp = await searchParams;
  const db = getDb();
  const courses = db.select().from(schema.courses).orderBy(asc(schema.courses.sortOrder)).all();
  const course = courses.find((c) => c.code === sp.course) ?? courses[0];
  const topics = listTopics(db, course.id);
  const rates = listRates(db).filter((r) => r.active);
  const people = listInstructors(db).filter((i) => i.active);
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "คลังหัวข้อ" }]} />
      <PageHeader en="Topic Library" title="คลังหัวข้อ" help="เลือกเบิกหรือไม่เบิกของแต่ละหัวข้อ และเลือกผู้สอนพร้อมหน่วยงาน ระบบบันทึกทันที การเบิกมีผลกับคาบที่ยังไม่อนุมัติเบิกจ่าย ผู้สอนที่เลือกจะเติมให้รุ่นที่สร้างใหม่ รุ่นเดิมแก้ผู้สอนได้ที่ตารางของรุ่น ชั่วโมง อัตรา และวิธีแบ่งค่าตอบแทนอยู่ในตั้งค่าละเอียด" />
      <div className="flex flex-wrap gap-2">
        {courses.map((c) => (
          <Link key={c.id} href={`?course=${c.code}`} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${c.id === course.id ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{c.shortName}</Link>
        ))}
      </div>
      
      <TopicQuickSetup
        canAddInstructor={auth.can("instructors.manage")}
        topics={topics.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, hours: t.standardHours, payable: t.payable, team: t.staffingType === "team", staff: t.staffingType === "team" ? [] : ((t.defaultStaff as Array<{ userId?: number; instructorId?: number }> | null) ?? []) }))}
        people={people.map((p) => ({ key: p.userId ? `u${p.userId}` : `i${p.id}`, userId: p.userId, instructorId: p.userId ? null : p.id, name: p.displayName, org: p.organization ?? (p.kind === "internal" ? "เจ้าหน้าที่ของหน่วยงาน" : "ภายนอก") }))}
      />
      <details>
        <summary className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line bg-white px-4 font-semibold hover:bg-lime-soft">ตั้งค่าละเอียด (ชั่วโมง ลักษณะกิจกรรม อัตรา วิธีแบ่ง เพิ่มหัวข้อ)</summary>
        <div className="mt-3">
      <TopicsEditor
        courseId={course.id}
        courseColor={course.color}
        topics={topics.map((t) => ({ ...t, externalRates: (t.externalRates as Record<string, number | null> | null) ?? null, defaultStaff: (t.defaultStaff as Array<{ userId?: number; instructorId?: number }> | null) ?? [] }))}
        rates={rates.map((r) => ({ id: r.id, name: r.name, kind: r.kind, perHourBaht: r.perHourSatang / 100, isSample: r.isSample }))}
        people={people.map((p) => ({ key: p.userId ? `u${p.userId}` : `i${p.id}`, userId: p.userId, instructorId: p.userId ? null : p.id, name: p.displayName, kind: p.kind }))}
      />
        </div>
      </details>
      <section className="card space-y-3">
        <h2 className="text-xl">ชิป &quot;สิ่งที่ได้&quot; สำหรับบันทึกผลหลังสอน</h2>
        <p className="text-muted">ข้อความสำเร็จรูปสำหรับบันทึกผลหลังสอน</p>
        {topics.some((t) => t.active && !t.chipsReviewedAt) && <Alert tone="warn">รายการที่มีป้าย &quot;ร่าง&quot; ยังไม่ได้ตรวจกับจุดประสงค์การเรียนรู้ในคู่มือ กรุณาตรวจแล้วกดบันทึก</Alert>}
        <TopicChipsEditor topics={topics.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, chips: (t.outcomeChips as string[] | null) ?? [], draft: !t.chipsReviewedAt }))} />
      </section>
      <section className="card space-y-3">
        <h2 className="text-xl">ชิปทั่วไปและเหตุผลสำเร็จรูป (ทุกหลักสูตร)</h2>
        <ReportChoicesEditor generalChips={getSetting<string[]>(db, "report.generalChips", [])} reasons={getSetting<{ partial: string[]; not_done: string[] }>(db, "report.reasons", { partial: [], not_done: [] })} />
      </section>
    </div>
  );
}
