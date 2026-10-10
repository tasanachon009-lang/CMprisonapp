import type { PhaseDef } from "@/lib/fast/phases";

/**
 * แถบ 5 ระยะการบำบัดแบบ "How It Works" (สเปก 4.4, 16): เลข 01–05 + ชื่อระยะ + ช่วงสัปดาห์ + จำนวนสมาชิก
 * ระยะตามปฏิทินของรุ่นเน้นสี — มีข้อความกำกับเสมอ (ไม่พึ่งสีอย่างเดียว)
 */
export function PhaseSteps({ phases, scheduledNo, week }: { phases: Array<{ phase: PhaseDef; n: number | null }>; scheduledNo: number | null; week: number }) {
  return (
    <ol className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" aria-label="ระยะการบำบัด 5 ระยะ">
      {phases.map(({ phase: p, n }) => {
        const state = scheduledNo == null ? "todo" : p.no < scheduledNo ? "done" : p.no === scheduledNo ? "now" : "todo";
        return (
          <li key={p.code} aria-current={state === "now" ? "step" : undefined}
            className={`rounded-3xl border p-4 ${state === "now" ? "border-navy bg-navy text-white" : state === "done" ? "border-line bg-lime-soft" : "border-line bg-white"}`}>
            <p className={`font-display text-3xl font-bold ${state === "now" ? "text-lime" : "text-navy"}`}>0{p.no}</p>
            <p className="font-semibold">{p.name}</p>
            <p className={`text-sm ${state === "now" ? "text-white/90" : "text-muted"}`}>{p.nameTh} · {p.desc}</p>
            <p className="mt-2 text-sm font-semibold">
              {state === "now" ? `ขณะนี้${p.toWeek ? ` (สัปดาห์ที่ ${week})` : ""}` : state === "done" ? "ผ่านแล้ว" : "ยังไม่ถึง"}
              {n != null && ` · สมาชิก ${n} คน`}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
