"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { Alert } from "@/components/ui";
import { approveDualAction, rejectDualAction, regenerateEmergencyCode } from "../actions";

export function ApprovalButtons({ id, isRequester, isRestore }: { id: number; isRequester: boolean; isRestore: boolean }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCode, setShowCode] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const approve = (emergency?: string) => start(async () => {
    const r = await approveDualAction(id, emergency);
    setMsg(r.ok ? { tone: "ok", text: r.message ?? "สำเร็จ" } : { tone: "danger", text: r.error });
    if (r.ok) router.refresh();
  });
  return (
    <div className="mt-3 space-y-2">
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <div className="flex flex-wrap gap-2">
        {!isRequester && <button className="btn-primary" disabled={pending} onClick={() => approve()}>{pending ? (isRestore ? "กำลังสำรองข้อมูลปัจจุบันแล้วกู้คืน..." : "กำลังทำรายการ...") : "ยืนยันและทำรายการ"}</button>}
        <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { await rejectDualAction(id); router.refresh(); })}>{isRequester ? "ยกเลิกคำขอ" : "ไม่อนุมัติ"}</button>
        {isRequester && <button className="btn-ghost" onClick={() => setShowCode(!showCode)}>อีกคนไม่อยู่นาน — ใช้รหัสฉุกเฉิน</button>}
      </div>
      {isRequester && showCode && (
        <div className="rounded-2xl bg-danger/5 p-3">
          <p className="text-sm">ใช้ได้ครั้งเดียว · การใช้งานถูกบันทึก</p>
          <div className="mt-2 flex gap-2">
            <input className="input font-mono" placeholder="รหัสฉุกเฉินจากซองปิดผนึก" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" />
            <button className="btn-danger shrink-0" disabled={pending || !code} onClick={() => approve(code)}>ยืนยันด้วยรหัสฉุกเฉิน</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmergencyCodePanel() {
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card">
      <h2 className="text-xl">รหัสฉุกเฉิน</h2>
      <p className="text-muted">แสดงรหัสครั้งเดียวเท่านั้น กรุณาพิมพ์และเก็บในซองปิดผนึก</p>
      {code ? (
        <div className="mt-3 rounded-2xl border-2 border-dashed border-ink p-6 text-center print:border-black">
          <p className="text-sm">รหัสฉุกเฉิน ระบบสถานฟื้นฟู (สร้างเมื่อ {new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })})</p>
          <p className="mt-2 font-mono text-3xl font-bold tracking-widest">{code}</p>
          <p className="mt-2 text-sm">ใช้แล้วต้องสร้างรหัสใหม่ทันที · ห้ามถ่ายรูป ห้ามส่งทางแชท</p>
          <button className="btn-ghost no-print mt-4" onClick={() => window.print()}><Printer size={18} aria-hidden /> พิมพ์ใส่ซอง</button>
        </div>
      ) : (
        <button className="btn-secondary mt-3" disabled={pending} onClick={() => start(async () => { const r = await regenerateEmergencyCode(); if (r.ok) setCode(r.data!); else setError(r.error); })}>สร้างรหัสฉุกเฉินใหม่ (รหัสเดิมใช้ไม่ได้อีก)</button>
      )}
      {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
    </section>
  );
}
