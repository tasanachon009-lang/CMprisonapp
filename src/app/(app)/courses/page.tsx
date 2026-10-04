import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { listCourses } from "@/lib/queries/cohorts";
import { Breadcrumb, Eyebrow } from "@/components/ui";

export const dynamic = "force-dynamic";

/** หน้าเลือกหลักสูตร: การ์ด 3 ใบบนพื้น navy แบบ "Treatment Programs" */
export default async function CoursesPage() {
  await requirePage("course.view");
  const courses = listCourses(getDb());
  return (
    <div>
      <Breadcrumb items={[{ label: "หลักสูตร" }]} />
      <section className="rounded-[32px] bg-navy px-6 py-10 text-white sm:px-10">
        <div className="text-center">
          <Eyebrow light>Treatment Programs</Eyebrow>
          <h1 className="text-4xl text-white">เลือกหลักสูตร</h1>
          <p className="mx-auto mt-2 max-w-xl text-white/75">หลักสูตรการฟื้นฟูสมรรถภาพผู้ติดยาเสพติด — กดเลือกเพื่อดูรุ่นในแต่ละปีงบประมาณ</p>
        </div>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {courses.map((c) => {
            const inner = (
              <div className={`flex h-full flex-col rounded-[32px] bg-white p-6 text-ink ${c.enabled ? "transition group-hover:-translate-y-1 group-hover:shadow-xl" : ""}`}>
                <div className="flex items-start justify-between gap-2">
                  <h2 className="text-xl leading-snug">{c.name}</h2>
                  {c.enabled && <ArrowUpRight className="shrink-0 text-navy" aria-hidden />}
                </div>
                <div className={`my-6 ${c.enabled ? "" : "opacity-60 grayscale"}`}><CourseArt code={c.code} /></div>
                <p className="text-sm text-muted">{c.durationDays >= 100 ? "24 สัปดาห์" : `${c.durationDays} วัน`}{c.totalHours ? ` · ${c.totalHours} ชั่วโมง` : ""}</p>
                <div className="mt-auto flex gap-6 pt-3">
                  <div>
                    <p className="font-display text-3xl font-bold text-navy">{c.runningCohorts}</p>
                    <p className="text-sm text-muted">รุ่นที่ดำเนินการ</p>
                  </div>
                  <div>
                    <p className="font-display text-3xl font-bold text-navy">{c.activePeople}</p>
                    <p className="text-sm text-muted">คนตอนนี้</p>
                  </div>
                </div>
                {!c.enabled && <p className="tag-muted mt-3 self-start">จะเปิดใช้ในขั้นถัดไป</p>}
              </div>
            );
            return c.enabled ? (
              <Link key={c.id} href={`/courses/${c.code.toLowerCase()}`} className="group block rounded-[28px]">{inner}</Link>
            ) : (
              <div key={c.id} aria-disabled>{inner}</div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

/** ภาพประกอบทรงแคปซูล โทน duotone เขียวมะนาว (วาดด้วย SVG — ไม่ต้องโหลดรูปจากเน็ต) */
function CourseArt({ code }: { code: string }) {
  const motif = code === "B12" ? "sprout" : code === "FAST" ? "tree" : "sun";
  return (
    <div className="relative h-32 overflow-hidden rounded-full bg-lime" aria-hidden>
      <span className="absolute inset-2 z-10 rounded-full border border-white/80" />
      <svg viewBox="0 0 200 100" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
        <rect width="200" height="100" fill="var(--lime)" />
        <circle cx="160" cy="25" r="16" fill="var(--lime-soft)" />
        <path d="M0 80 Q 50 60 100 78 T 200 74 V100 H0Z" fill="#5f6f2a" opacity="0.25" />
        {motif === "sprout" && (
          <g fill="#5f6f2a" opacity="0.85">
            <rect x="98" y="50" width="4" height="34" rx="2" />
            <path d="M100 58 C 80 52 74 38 76 30 C 92 32 100 44 100 58Z" />
            <path d="M100 52 C 116 44 126 34 128 24 C 112 24 102 36 100 52Z" />
          </g>
        )}
        {motif === "tree" && (
          <g fill="#5f6f2a" opacity="0.85">
            <rect x="96" y="52" width="8" height="32" rx="3" />
            <circle cx="100" cy="42" r="22" />
            <circle cx="80" cy="52" r="14" />
            <circle cx="120" cy="52" r="14" />
          </g>
        )}
        {motif === "sun" && (
          <g fill="#5f6f2a" opacity="0.85">
            <circle cx="100" cy="70" r="20" />
            {[...Array(7)].map((_, i) => {
              const a = Math.PI + (i * Math.PI) / 6;
              return <rect key={i} x={100 + Math.cos(a) * 30 - 2} y={70 + Math.sin(a) * 30 - 6} width="4" height="12" rx="2" transform={`rotate(${(a * 180) / Math.PI + 90} ${100 + Math.cos(a) * 30} ${70 + Math.sin(a) * 30})`} />;
            })}
          </g>
        )}
      </svg>
    </div>
  );
}
