import { radarPoints } from "@/lib/assessments/distribution";
import { POST_COLOR } from "./prepost-chart";

/**
 * กราฟเรดาร์ (สเปก 17: ทบทวนสถานภาพ 11 ด้าน) — ศูนย์กลาง = ค่าต่ำสุด ขอบ = ค่าสูงสุด เส้นประ = ค่า 0
 * มีตัวเลขกำกับทุกแกน (ไม่พึ่งรูปร่างอย่างเดียว) และตารางค่าอยู่คู่กันในหน้าที่เรียกใช้
 */
export function RadarChart({ labels, values, min, max, title }: { labels: string[]; values: Array<number | null>; min: number; max: number; title: string }) {
  const size = 360, cx = size / 2, cy = size / 2 + 4, radius = 112;
  const ring = (v: number) => radarPoints(labels.map(() => v), min, max, radius, cx, cy).map((p) => `${p.x},${p.y}`).join(" ");
  const pts = radarPoints(values, min, max, radius, cx, cy);
  const outer = radarPoints(labels.map(() => max), min, max, radius, cx, cy);
  const fmt = (v: number | null) => (v == null ? "-" : v > 0 ? `+${v}` : String(v));
  return (
    <figure className="w-full max-w-md">
      <svg viewBox={`0 0 ${size} ${size + 8}`} className="w-full" role="img" aria-label={`${title}: ${labels.map((l, i) => `${l} ${fmt(values[i])}`).join(", ")}`}>
        {[max, (max + min) / 2 + (max - min) / 4].map((v) => <polygon key={v} points={ring(v)} fill="none" stroke="var(--line)" />)}
        {min < 0 && max > 0 && <polygon points={ring(0)} fill="none" stroke="var(--muted)" strokeDasharray="4 3" />}
        {outer.map((p, i) => <line key={i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="var(--line)" />)}
        <polygon points={pts.map((p) => `${p.x},${p.y}`).join(" ")} fill={POST_COLOR} fillOpacity={0.22} stroke={POST_COLOR} strokeWidth={2} />
        {pts.map((p, i) => values[i] != null && <circle key={i} cx={p.x} cy={p.y} r={3.5} fill={POST_COLOR} />)}
        {outer.map((p, i) => {
          const lx = cx + Math.cos(p.ang) * (radius + 16), ly = cy + Math.sin(p.ang) * (radius + 16);
          const anchor = Math.abs(Math.cos(p.ang)) < 0.2 ? "middle" : Math.cos(p.ang) > 0 ? "start" : "end";
          return (
            <text key={i} x={lx} y={ly} fontSize="11" textAnchor={anchor} dominantBaseline="middle" fill="var(--ink)">
              {labels[i]} <tspan fontWeight="700" fill={POST_COLOR}>{fmt(values[i])}</tspan>
            </text>
          );
        })}
      </svg>
      <figcaption className="text-sm text-muted">ศูนย์กลาง = {min} · ขอบนอก = +{max}{min < 0 ? " · เส้นประ = 0" : ""}</figcaption>
    </figure>
  );
}
