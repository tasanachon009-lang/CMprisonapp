"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, DoorOpen, Home, List, Search, Settings, Upload } from "lucide-react";

const ICONS = { home: Home, book: BookOpen, search: Search, door: DoorOpen, upload: Upload, list: List, settings: Settings } as const;

export function NavLinks({ items }: { items: Array<{ href: string; label: string; icon: string }> }) {
  const path = usePathname();
  return (
    <nav aria-label="เมนูหลัก" className="flex flex-wrap gap-1">
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
