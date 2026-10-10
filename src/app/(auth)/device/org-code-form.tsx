"use client";

import { useActionState } from "react";
import { KeyRound } from "lucide-react";
import { verifyOrgCode } from "../actions";

export function OrgCodeForm({ trustDays }: { trustDays: number }) {
  const [state, action, pending] = useActionState(verifyOrgCode, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="code" className="label">รหัสหน่วยงาน</label>
        <input id="code" name="code" type="password" autoComplete="off" autoFocus required className={`input ${state?.error ? "input-error" : ""}`} />
        {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      </div>
      <label className="flex min-h-11 items-center gap-3">
        <input type="checkbox" name="remember" defaultChecked className="h-5 w-5" />
        <span>จดจำเครื่องนี้ {trustDays} วัน</span>
      </label>
      <button className="btn-primary w-full" disabled={pending}>
        <KeyRound size={20} aria-hidden /> {pending ? "กำลังตรวจสอบ..." : "ถัดไป"}
      </button>
    </form>
  );
}
