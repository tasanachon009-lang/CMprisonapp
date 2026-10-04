/** รูปผู้ใช้/ผู้ต้องขัง หรือตัวอักษรย่อ */
export function initials(first: string, last: string) {
  // ตัดสระนำหน้า (เ แ โ ใ ไ) ให้ได้พยัญชนะต้น
  const firstChar = (s: string) => (s.match(/[ก-ฮA-Za-z]/)?.[0] ?? s.charAt(0));
  return firstChar(first) + firstChar(last);
}

export function Avatar({
  first, last, src, size = 40, color, className = "",
}: { first: string; last: string; src?: string | null; size?: number; color?: string | null; className?: string }) {
  const style = { width: size, height: size, fontSize: Math.max(11, size * 0.38) };
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt={`${first} ${last}`} width={size} height={size} className={`shrink-0 rounded-full object-cover ${className}`} style={style} loading="lazy" />;
  }
  return (
    <span
      aria-label={`${first} ${last}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-display font-bold text-ink ${className}`}
      style={{ ...style, background: color ?? "var(--periwinkle)" }}
    >
      {initials(first, last)}
    </span>
  );
}
