"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, ClipboardList, DoorOpen, Home, List, Mail, Search, Settings, Upload, Users, BadgeCheck, CalendarDays } from "lucide-react";

const ICONS = { home: Home, book: BookOpen, search: Search, door: DoorOpen, upload: Upload, list: List, settings: Settings, clipboard: ClipboardList, mail: Mail, users: Users, check: BadgeCheck, calendar: CalendarDays } as const;

export function NavLinks({ items }: { items: Array<{ href: string; label: string; icon: string }> }) {
  const path = usePathname();
  return (
    <nav aria-label="เมนูหลัก" className="flex gap-1 whitespace-nowrap">
      {items.map((it) => {
        const active = it.href === "/" ? path === "/" : path.startsWith(it.href) || (it.href === "/courses" && path.startsWith("/cohorts"));
        const Icon = ICONS[it.icon as keyof typeof ICONS] ?? Home;
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`inline-flex min-h-11 items-center gap-2 rounded-full px-4 font-medium transition ${active ? "bg-ink text-white" : "text-ink hover:bg-lime"}`}
          >
            <Icon size={20} aria-hidden /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
