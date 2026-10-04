"use client";

import { useActionState, useState } from "react";
import { Eye, EyeOff, LogIn } from "lucide-react";
import { login } from "../../actions";

export function PasswordForm({ userId }: { userId: number }) {
  const [state, action, pending] = useActionState(login, undefined);
  const [show, setShow] = useState(false);
  return (
    <form action={action} className="mt-6 space-y-4">
      <input type="hidden" name="userId" value={userId} />
      <div>
        <label htmlFor="password" className="label">รหัสผ่าน</label>
        <div className="relative">
          <input
            id="password" name="password" type={show ? "text" : "password"} autoComplete="current-password"
            autoFocus required className={`input pr-12 ${state?.error ? "input-error" : ""}`}
          />
          <button type="button" onClick={() => setShow(!show)} className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full p-2 text-muted hover:bg-lime-soft" aria-label={show ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"}>
            {show ? <EyeOff size={20} /> : <Eye size={20} />}
          </button>
        </div>
        {state?.error && <p className="error-text" role="alert">{state.error}</p>}
      </div>
      <button className="btn-primary w-full" disabled={pending}>
        <LogIn size={20} aria-hidden /> {pending ? "กำลังเข้าสู่ระบบ..." : "เข้าสู่ระบบ"}
      </button>
    </form>
  );
}
