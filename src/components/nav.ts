import type { Permission } from "@/lib/auth/permissions";

/** เมนูกลาง (สเปก 4.1) — เมนูที่ไม่มีสิทธิ์จะถูกซ่อน (และหน้าเองก็ตรวจสิทธิ์ที่เซิร์ฟเวอร์อีกชั้น) */
/** scoped = แสดงเมื่อได้รับมอบหมายงานรายรุ่น (กลุ่ม B) */
export type NavItem = { href: string; label: string; icon: string; any?: Permission[]; scoped?: boolean };

export const NAV: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/courses", label: "หลักสูตร", icon: "book", any: ["course.view"] },
  { href: "/persons", label: "ค้นหาบุคคล", icon: "search", any: ["registry.view"] },
  { href: "/release", label: "ออกจากเรือนจำ", icon: "door", any: ["release.view"] },
  { href: "/bst", label: "บสต./ติดตาม", icon: "clipboard", any: ["bst.view"] },
  { href: "/rt101", label: "รท.101", icon: "check", any: ["bst.view"] },
  { href: "/assigned", label: "งานที่ได้รับมอบหมาย", icon: "users", scoped: true },
  { href: "/inbox", label: "จดหมายเวร", icon: "mail", any: ["shift.use"] },
  { href: "/import", label: "นำเข้า Excel", icon: "upload", any: ["registry.import"] },
  { href: "/roster", label: "นับยอด", icon: "list", any: ["roster.view", "registry.view"] },
  { href: "/admin", label: "ตั้งค่า", icon: "settings", any: ["settings.manage", "users.manage", "backup.manage", "audit.view"] },
];
