/**
 * ภาพธรรมชาติในกรอบมุมบาก (หน้าเข้าระบบ) — วาดด้วย SVG เอง: แสงเช้า ต้นกล้า ต้นไม้ ทางเดิน
 * ไม่มีภาพคน/เรือนจำ/ยาเสพติด ตามสเปก 4.4 และไม่มีลิขสิทธิ์ผู้อื่น
 */
const OLIVE = "#5f6f2a";

function Sunrise() {
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="sky1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#9DB4EC" /><stop offset="1" stopColor="#F4F8D8" /></linearGradient>
      </defs>
      <rect width="200" height="260" fill="url(#sky1)" />
      <circle cx="120" cy="150" r="34" fill="#FFF3B0" />
      <path d="M0 170 Q60 130 120 165 T200 150 V260 H0Z" fill="#C9D98A" />
      <path d="M0 205 Q70 170 140 200 T200 195 V260 H0Z" fill={OLIVE} opacity="0.75" />
    </svg>
  );
}

function Sprout() {
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <rect width="200" height="260" fill="#E8F2B0" />
      <circle cx="160" cy="50" r="22" fill="#F4F8D8" />
      <ellipse cx="100" cy="225" rx="80" ry="22" fill="#C9D98A" />
      <g fill={OLIVE}>
        <rect x="96" y="120" width="8" height="105" rx="4" />
        <path d="M100 150 C 60 140 48 108 52 90 C 84 94 100 118 100 150Z" />
        <path d="M100 135 C 132 120 152 98 154 76 C 122 78 104 102 100 135Z" />
      </g>
    </svg>
  );
}

function Tree() {
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <rect width="200" height="260" fill="#3D5590" />
      <circle cx="40" cy="45" r="16" fill="#9DB4EC" opacity="0.7" />
      <path d="M0 215 Q100 190 200 215 V260 H0Z" fill="#9DB4EC" opacity="0.5" />
      <rect x="93" y="140" width="14" height="80" rx="5" fill="#E8F2B0" opacity="0.9" />
      <circle cx="100" cy="115" r="46" fill="#E8F2B0" />
      <circle cx="66" cy="138" r="26" fill="#E8F2B0" />
      <circle cx="134" cy="138" r="26" fill="#E8F2B0" />
    </svg>
  );
}

function Path() {
  return (
    <svg viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice" className="h-full w-full">
      <defs>
        <linearGradient id="sky2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F4F8D8" /><stop offset="1" stopColor="#E8F2B0" /></linearGradient>
      </defs>
      <rect width="200" height="260" fill="url(#sky2)" />
      <circle cx="70" cy="70" r="22" fill="#FFF3B0" />
      <path d="M0 120 Q40 100 80 116 T160 108 T200 112 V140 H0Z" fill={OLIVE} opacity="0.7" />
      <rect y="138" width="200" height="122" fill="#9DB4EC" />
      <g stroke="#F4F8D8" strokeWidth="3" strokeLinecap="round" opacity="0.9">
        <path d="M40 170h60" /><path d="M110 190h50" /><path d="M30 212h44" /><path d="M96 232h70" />
      </g>
      <ellipse cx="70" cy="160" rx="18" ry="4" fill="#FFF3B0" opacity="0.8" />
    </svg>
  );
}

export function NatureFrames() {
  const frames = [
    { el: <Sunrise />, cls: "notch-tr h-64 mt-0" },
    { el: <Sprout />, cls: "notch-tl h-52 mt-12" },
    { el: <Tree />, cls: "notch-tr h-52 mt-12" },
    { el: <Path />, cls: "notch-tl h-64 mt-0" },
  ];
  return (
    <div aria-hidden className="mt-10 hidden w-full max-w-5xl grid-cols-4 items-start gap-5 md:grid">
      {frames.map((f, i) => (
        <div key={i} className={`overflow-hidden rounded-[32px] ${f.cls}`}>{f.el}</div>
      ))}
    </div>
  );
}
