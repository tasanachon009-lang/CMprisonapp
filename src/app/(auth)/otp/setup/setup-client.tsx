"use client";

import { useState, useTransition } from "react";
import { QrCode } from "lucide-react";
import { Alert } from "@/components/ui";
import { startOtpSetup } from "../../actions";
import { OtpForm } from "../otp-form";

export function OtpSetup() {
  const [data, setData] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  if (!data) {
    return (
      <div className="mt-6 space-y-3">
        {error && <Alert tone="danger">{error}</Alert>}
        <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { const r = await startOtpSetup(); if (r.ok) setData({ secret: r.secret!, qrSvg: r.qrSvg! }); else setError(r.error ?? "ผิดพลาด"); })}>
          <QrCode size={20} aria-hidden /> แสดง QR สำหรับสแกน
        </button>
      </div>
    );
  }
  return (
    <div className="mt-6">
      {/* QR สร้างในเครื่องเซิร์ฟเวอร์ (ไม่ส่งรหัสลับออกนอกหน่วยงาน) */}
      <div className="mx-auto w-56 rounded-2xl border border-line bg-white p-2" dangerouslySetInnerHTML={{ __html: data.qrSvg }} />
      <p className="mt-2 text-center text-sm text-muted">หรือพิมพ์รหัสลับ: <span className="font-mono font-semibold text-ink">{data.secret.replace(/(.{4})/g, "$1 ").trim()}</span></p>
      <OtpForm />
    </div>
  );
}
