/**
 * กราฟแท่งเปรียบเทียบ ก่อน-หลัง (ค่าเฉลี่ย) — สีผ่านการตรวจ colorblind-safe (validate_palette)
 * ก่อน = olive #8A9A2E · หลัง = navy #3D5590 · มีป้ายตัวเลขและคำอธิบายสีเสมอ (ไม่พึ่งสีอย่างเดียว)
 */
export const PRE_COLOR = "#8A9A2E";
export const POST_COLOR = "#3D5590";

export type PrePostRow = { label: string; max: number; pre: number | null; post: number | null; preN: number; postN: number; unit?: string };

/** individual = คะแนนของคนเดียว (ไม่ใช่ค่าเฉลี่ย) */
export function PrePostChart({ rows, title, individual }: { rows: PrePostRow[]; title?: string; individual?: boolean }) {
  const barH = 14, gap = 2, rowH = barH * 2 + gap + 22, labelW = 150, width = 640, plotW = width - labelW - 70;
  const height = rows.length * rowH + 8;
  return (
    <figure className="w-full">
      {title && <figcaption className="mb-2 font-semibold">{title}</figcaption>}
      <div className="mb-2 flex gap-4 text-sm" aria-hidden>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: PRE_COLOR }} /> ก่อนเรียน</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-3 rounded-sm" style={{ background: POST_COLOR }} /> หลังเรียน</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label={title ?? "กราฟเปรียบเทียบก่อน-หลัง"}>
        {rows.map((r, i) => {
          const y = i * rowH + 4;
          const w = (v: number | null) => (v == null ? 0 : Math.max(2, (v / r.max) * plotW));
          return (
            <g key={r.label}>
              <text x={0} y={y + barH + 4} fontSize="13" fill="var(--ink)">{r.label}</text>
              <line x1={labelW} x2={labelW} y1={y - 2} y2={y + barH * 2 + gap + 2} stroke="var(--line)" />
              {([["pre", r.pre, r.preN, PRE_COLOR, 0], ["post", r.post, r.postN, POST_COLOR, barH + gap]] as const).map(([k, v, n, color, dy]) => (
                <g key={k}>
                  {/* พื้นที่ชี้ใหญ่กว่าแท่ง สำหรับ tooltip */}
                  <rect x={labelW} y={y + dy - 1} width={plotW} height={barH + 2} fill="transparent">
                    <title>{`${r.label} ${k === "pre" ? "ก่อนเรียน" : "หลังเรียน"}: ${v == null ? "ยังไม่มีข้อมูล" : individual ? `${v} จาก ${r.max}${r.unit ?? ""}` : `เฉลี่ย ${v} จาก ${r.max}${r.unit ?? ""}`}${individual ? "" : ` (n=${n})`}`}</title>
                  </rect>
                  {v != null && <rect x={labelW + 1} y={y + dy} width={w(v)} height={barH} rx={4} fill={color} pointerEvents="none" />}
                  <text x={labelW + 1 + w(v) + 6} y={y + dy + barH - 3} fontSize="12" fill="var(--muted)" pointerEvents="none">{v == null ? "ยังไม่ทำ" : individual ? `${v}/${r.max}` : `${v}`}</text>
                </g>
              ))}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}
