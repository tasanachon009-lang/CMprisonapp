/** สเปก 4.3A: บอกขั้นตอนด้วยจุด ● ○ แทนข้อความ */
export function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex justify-center gap-2" role="img" aria-label={`ขั้นที่ ${current} จาก ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-full border border-navy ${i + 1 === current ? "bg-navy" : "bg-transparent"}`} />
      ))}
    </div>
  );
}
