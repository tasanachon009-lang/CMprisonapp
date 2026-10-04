import type { Permission } from "@/lib/auth/permissions";

/** เมนูกลาง (สเปก 4.1) — เมนูที่ไม่มีสิทธิ์จะถูกซ่อน (และหน้าเองก็ตรวจสิทธิ์ที่เซิร์ฟเวอร์อีกชั้น) */
export type NavItem = { href: string; label: string; icon: string; any?: Permission[] };

export const NAV: NavItem[] = [
  { href: "/", label: "หน้าแรก", icon: "home" },
  { href: "/courses", label: "หลักสูตร", icon: "book", any: ["course.view"] },
  { href: "/persons", label: "ค้นหาบุคคล", icon: "search", any: ["registry.view"] },
  { href: "/release", label: "บันทึกออกจากเรือนจำ", icon: "door", any: ["release.view"] },
  { href: "/import", label: "นำเข้า Excel", icon: "upload", any: ["registry.import"] },
  { href: "/roster", label: "ใบรายชื่อนับยอด", icon: "list", any: ["roster.view", "registry.view"] },
  { href: "/admin", label: "ตั้งค่า", icon: "settings", any: ["settings.manage", "users.manage", "backup.manage", "audit.view"] },
];
