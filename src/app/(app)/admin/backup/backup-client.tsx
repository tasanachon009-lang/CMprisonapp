"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { HardDriveDownload, ShieldCheck, Usb } from "lucide-react";
import { Alert } from "@/components/ui";
import { backupNow, restoreTestNow, saveBackupDirs, requestDualAction } from "../actions";

export function BackupActions() {
  const router = useRouter();
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string; data?: { name: string } }>, okText: string) =>
    start(async () => {
      const r = await fn();
      setMsg(r.ok ? { tone: "ok", text: r.message ?? `${okText}${r.data?.name ? ` (${r.data.name})` : ""}` } : { tone: "danger", text: r.error! });
      router.refresh();
    });
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ทำทันที</h2>
      <div className="flex flex-wrap gap-2">
        <button className="btn-primary" disabled={pending} onClick={() => run(() => backupNow("manual"), "สำรองข้อมูลสำเร็จ")}><HardDriveDownload size={20} aria-hidden /> สำรองข้อมูลทันที</button>
        <button className="btn-secondary" disabled={pending} onClick={() => run(() => backupNow("removable"), "สำรองลงฮาร์ดดิสก์ถอดเก็บสำเร็จ — ถอดดิสก์ไปเก็บที่ปลอดภัยได้")}><Usb size={20} aria-hidden /> สำรองลงฮาร์ดดิสก์ถอดเก็บ</button>
        <button className="btn-ghost" disabled={pending} onClick={() => run(restoreTestNow, "ทดสอบกู้คืนผ่าน")}><ShieldCheck size={20} aria-hidden /> ทดสอบกู้คืนตอนนี้</button>
      </div>
      {pending && <p className="text-muted">กำลังทำงาน กรุณารอสักครู่...</p>}
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
    </section>
  );
}

export function BackupDirsForm({ externalDir, removableDir, localDir }: { externalDir: string; removableDir: string; localDir: string }) {
  const router = useRouter();
  const [ext, setExt] = useState(externalDir);
  const [rem, setRem] = useState(removableDir);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3">
      <h2 className="text-xl">ตำแหน่งเก็บไฟล์สำรอง (หลัก 3-2-1)</h2>
      <p className="text-sm text-muted">ชุดที่ 1 ในเครื่อง: <span className="font-mono">{localDir}</span></p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label><span className="label">ชุดที่ 2: ฮาร์ดดิสก์ภายนอกที่เสียบไว้ตลอด</span><input className="input font-mono" placeholder="เช่น E:\RehabBackup" value={ext} onChange={(e) => setExt(e.target.value)} /></label>
        <label><span className="label">ชุดที่ 3: ฮาร์ดดิสก์ลูกที่ 2 แบบถอดเก็บ</span><input className="input font-mono" placeholder="เช่น F:\RehabBackup" value={rem} onChange={(e) => setRem(e.target.value)} /></label>
      </div>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-secondary" disabled={pending} onClick={() => start(async () => { const r = await saveBackupDirs(ext, rem); setMsg(r.ok ? { tone: "ok", text: "บันทึกแล้ว" } : { tone: "danger", text: r.error }); router.refresh(); })}>บันทึกตำแหน่ง</button>
    </section>
  );
}

export function RestoreRequest({ files }: { files: Array<{ name: string; label: string }> }) {
  const router = useRouter();
  const [file, setFile] = useState("");
  const [reason, setReason] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "danger"; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <section className="card space-y-3 border-danger/40">
      <h2 className="text-xl">กู้คืนข้อมูล</h2>
      <Alert tone="warn">การกู้คืนจะแทนที่ข้อมูลทั้งหมดด้วยข้อมูล ณ เวลาที่เลือก · ต้องมีผู้ดูแลระบบอีกหนึ่งคนยืนยัน</Alert>
      <label className="block"><span className="label">1. เลือกไฟล์สำรองตามวันเวลา</span>
        <select className="input" value={file} onChange={(e) => setFile(e.target.value)}><option value="">— เลือก —</option>{files.map((f) => <option key={f.name} value={f.name}>{f.label}</option>)}</select>
      </label>
      <label className="block"><span className="label">2. เหตุผล</span><textarea className="input" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} /> 3. รับทราบว่าข้อมูลหลังเวลาที่เลือกจะถูกแทนที่</label>
      {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
      <button className="btn-danger" disabled={pending || !file || !reason.trim() || !confirm} onClick={() => start(async () => { const r = await requestDualAction("restore", { file }, reason); setMsg(r.ok ? { tone: "ok", text: r.message ?? "ส่งคำขอแล้ว" } : { tone: "danger", text: r.error }); router.refresh(); })}>ส่งคำขอกู้คืน</button>
    </section>
  );
}
