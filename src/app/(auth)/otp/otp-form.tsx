"use client";

import { useActionState } from "react";
import { ShieldCheck } from "lucide-react";
import { verifyOtp } from "../actions";

export function OtpForm() {
  const [state, action, pending] = useActionState(verifyOtp, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="code" className="label">รหัส 6 หลัก</label>
        <input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={7} autoFocus required className={`input text-center font-display text-2xl tracking-[0.4em] ${state?.error ? "input-error" : ""}`} />
        {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      </div>
      <button className="btn-primary w-full" disabled={pending}><ShieldCheck size={20} aria-hidden /> {pending ? "กำลังตรวจสอบ..." : "ยืนยัน"}</button>
    </form>
  );
}
