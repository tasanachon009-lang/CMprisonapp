"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setFormActive } from "../actions";

/** เปิด/ปิดใช้งานแบบประเมิน (เช่น SCL-90-R ที่ใส่ไว้ในคลังแต่ปิดไว้ก่อน — สเปก 16B) */
export function ActiveToggle({ formId, active }: { formId: number; active: boolean }) {
  const router = useRouter();
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className={active ? "tag-ok" : "tag-muted"}>{active ? "เปิดใช้งาน" : "ปิดใช้งาน"}</span>
      <button type="button" className="btn-ghost btn-sm" disabled={pending}
        onClick={() => { if (!confirm(active ? "ยืนยันการปิดใช้งานแบบประเมินนี้" : "ยืนยันการเปิดใช้งานแบบประเมินนี้")) return; start(async () => { const r = await setFormActive(formId, !active); if (!r.ok) setErr(r.error); else router.refresh(); }); }}>
        {active ? "ปิดใช้งาน" : "เปิดใช้งาน"}
      </button>
      {err && <span className="text-sm text-danger">{err}</span>}
    </span>
  );
}
