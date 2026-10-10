"use client";

import { useState, useTransition } from "react";
import { Unlock, UserRoundX } from "lucide-react";
import { unlockScreen, switchUser } from "@/app/(auth)/actions";

export function UnlockForm({ onUnlocked, redirectTo }: { onUnlocked?: () => void; redirectTo?: string }) {
  const [pw, setPw] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await unlockScreen(pw);
      if (r.ok) {
        setPw("");
        setError(null);
        if (onUnlocked) onUnlocked();
        if (redirectTo) window.location.href = redirectTo;
      } else {
        setError(r.error ?? "ปลดล็อกไม่สำเร็จ");
        if (r.error?.includes("ออกจากระบบ")) window.location.href = "/login";
      }
    });
  };

  return (
    <form onSubmit={submit} className="mt-6 space-y-4">
      <div>
        <label htmlFor="unlock-pw" className="label">รหัสผ่าน</label>
        <input id="unlock-pw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus autoComplete="current-password" className={`input ${error ? "input-error" : ""}`} />
        {error && <p className="error-text" role="alert">{error}</p>}
      </div>
      <button className="btn-primary w-full" disabled={pending || !pw}>
        <Unlock size={20} aria-hidden /> {pending ? "กำลังตรวจสอบ..." : "ปลดล็อก"}
      </button>
      <button type="button" className="btn-ghost w-full" onClick={() => start(() => switchUser())}>
        <UserRoundX size={20} aria-hidden /> เปลี่ยนผู้ใช้
      </button>
      <p className="hint text-center">งานที่ค้างไว้จะถูกเก็บเป็นร่าง</p>
    </form>
  );
}
