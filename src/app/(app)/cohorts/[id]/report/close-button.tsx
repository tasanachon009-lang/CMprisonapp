"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Alert } from "@/components/ui";
import { closeCohortAction } from "../../actions";

export function CloseCohortButton({ cohortId, ready, isAdmin }: { cohortId: number; ready: boolean; isAdmin: boolean }) {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="mt-4 space-y-2">
      {!ready && isAdmin && <label className="block"><span className="label">ผู้ดูแล: ปิดทั้งที่ยังไม่ครบ — เหตุผล</span><input className="input" value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
      {error && <Alert tone="danger">{error}</Alert>}
      <button className="btn-primary" disabled={pending || (!ready && !(isAdmin && reason.trim()))} onClick={() => start(async () => {
        if (!confirm("ยืนยันปิดรุ่น? หลังปิดจะลงทะเบียนเพิ่มไม่ได้")) return;
        const r = await closeCohortAction(cohortId, ready ? undefined : reason);
        if (!r.ok) return setError(r.error);
        router.refresh();
      })}><Lock size={20} aria-hidden /> ปิดรุ่น</button>
      {!ready && !isAdmin && <p className="text-sm text-muted">ต้องดำเนินการรายการที่ยังไม่ครบก่อนปิดรุ่น</p>}
    </div>
  );
}
