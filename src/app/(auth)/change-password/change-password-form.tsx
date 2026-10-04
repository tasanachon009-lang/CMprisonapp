"use client";

import { useActionState } from "react";
import { changePassword } from "../actions";

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePassword, undefined);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label htmlFor="current" className="label">รหัสผ่านปัจจุบัน</label>
        <input id="current" name="current" type="password" autoComplete="current-password" required className="input" autoFocus />
      </div>
      <div>
        <label htmlFor="next" className="label">รหัสผ่านใหม่</label>
        <input id="next" name="next" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      <div>
        <label htmlFor="confirm" className="label">พิมพ์รหัสผ่านใหม่อีกครั้ง</label>
        <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required className="input" />
      </div>
      {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "กำลังบันทึก..." : "บันทึกรหัสผ่านใหม่"}</button>
    </form>
  );
}
