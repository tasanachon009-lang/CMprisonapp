import Link from "next/link";
import { asc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { listRates, listTopics } from "@/lib/services/pay-setup";
import { listInstructors } from "@/lib/services/instructors";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { TopicsEditor } from "./topics-client";
import { TopicChipsEditor, ReportChoicesEditor } from "./chips-client";
import { getSetting } from "@/lib/bootstrap";

export const dynamic = "force-dynamic";

/** คลังหัวข้อ (สเปก 11.3) — ตั้งครั้งเดียวต่อหลักสูตร */
export default async function TopicsPage({ searchParams }: PageProps<"/admin/topics">) {
  await requirePage("topics.manage");
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
      <PageHeader en="Topic Library" title="คลังหัวข้อ" subtitle="ชั่วโมงมาตรฐาน ลักษณะกิจกรรม ผู้รับผิดชอบ (รายบุคคล/ทั้งทีม) การเบิก อัตรา และวิธีแบ่งค่าตอบแทน — ใช้กับทุกรุ่นของหลักสูตร" />
      <div className="flex flex-wrap gap-2">
        {courses.map((c) => (
          <Link key={c.id} href={`?course=${c.code}`} className={`inline-flex min-h-11 items-center rounded-full px-4 font-semibold ${c.id === course.id ? "bg-ink text-white" : "border border-line bg-white hover:bg-lime-soft"}`}>{c.shortName}</Link>
        ))}
      </div>
      <Alert tone="info">หัวข้อนำเข้าจากคู่มือไว้ให้แล้ว (12 วันยังเป็นร่างเดียวกับแม่แบบตาราง) — ตรวจแก้ให้ตรงคู่มือ · &quot;ทั้งทีม&quot; = ใส่เจ้าหน้าที่หลักทุกคนให้อัตโนมัติเมื่อสร้างรุ่น (เอาออกได้) ค่าเริ่มต้นไม่เบิก</Alert>
      <TopicsEditor
        courseId={course.id}
        courseColor={course.color}
        topics={topics.map((t) => ({ ...t, externalRates: (t.externalRates as Record<string, number | null> | null) ?? null, defaultStaff: (t.defaultStaff as Array<{ userId?: number; instructorId?: number }> | null) ?? [] }))}
        rates={rates.map((r) => ({ id: r.id, name: r.name, kind: r.kind, perHourBaht: r.perHourSatang / 100, isSample: r.isSample }))}
        people={people.map((p) => ({ key: p.userId ? `u${p.userId}` : `i${p.id}`, userId: p.userId, instructorId: p.userId ? null : p.id, name: p.displayName, kind: p.kind }))}
      />
      <section className="card space-y-3">
        <h2 className="text-xl">ชิป &quot;สิ่งที่ได้&quot; สำหรับบันทึกผลหลังสอน</h2>
        <p className="text-muted">ผู้บันทึกกดเลือกชิปแทนการพิมพ์ ระบบประกอบเป็นประโยคสรุปให้ (สเปก 22B)</p>
        {topics.some((t) => t.active && !t.chipsReviewedAt) && <Alert tone="warn">ชิปที่มีป้าย &quot;ร่าง&quot; ระบบร่างจากชื่อหัวข้อ เพราะยังไม่มีไฟล์คู่มือหลักสูตรในระบบ — กรุณาตรวจกับ &quot;จุดประสงค์การเรียนรู้&quot; ในคู่มือ แล้วกดบันทึก</Alert>}
        <TopicChipsEditor topics={topics.filter((t) => t.active).map((t) => ({ id: t.id, name: t.name, chips: (t.outcomeChips as string[] | null) ?? [], draft: !t.chipsReviewedAt }))} />
      </section>
      <section className="card space-y-3">
        <h2 className="text-xl">ชิปทั่วไปและเหตุผลสำเร็จรูป (ทุกหลักสูตร)</h2>
        <ReportChoicesEditor generalChips={getSetting<string[]>(db, "report.generalChips", [])} reasons={getSetting<{ partial: string[]; not_done: string[] }>(db, "report.reasons", { partial: [], not_done: [] })} />
      </section>
    </div>
  );
}
