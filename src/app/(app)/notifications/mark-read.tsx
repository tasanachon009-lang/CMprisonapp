"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck } from "lucide-react";
import { markNotificationsRead } from "../admin/actions";

export function MarkAllRead({ ids }: { ids: number[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { await markNotificationsRead(ids); router.refresh(); })}>
      <CheckCheck size={20} aria-hidden /> ทำเครื่องหมายว่าอ่านแล้วทั้งหมด
    </button>
  );
}
