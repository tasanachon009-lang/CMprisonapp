/** เครื่องหมายของระบบ: วงกลม + ครึ่งวงกลม (สื่อการเติบโต/ฟื้นตัว) โทน navy–periwinkle */
export function LogoMark({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="13" cy="13" r="11" fill="var(--periwinkle)" />
      <path d="M26 2a11 11 0 0 1 0 22Z" fill="var(--navy)" />
      <path d="M2 27h22a11 11 0 0 1-22 0Z" fill="var(--navy)" />
      <path d="M27 27h11a11 11 0 0 1-11 11Z" fill="var(--periwinkle)" />
    </svg>
  );
}
