"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { lockScreen, heartbeat } from "@/app/(auth)/actions";
import { UnlockForm } from "./unlock-form";
import { Avatar } from "./avatar";

/**
 * ล็อกหน้าจอด่วน (สเปก 22B): ปุ่มแม่กุญแจ / Ctrl+L / Esc 2 ครั้ง / ไม่ใช้งานครบกำหนด
 * หน้าจอเบลอทันที ข้อมูลที่พิมพ์ค้างไว้ยังอยู่ในหน้าเดิม ใส่รหัสแล้วทำงานต่อได้
 */
export function QuickLock({ idleMinutes, user }: { idleMinutes: number; user: { firstName: string; lastName: string; fullName: string; color: string | null } }) {
  const router = useRouter();
  const [locked, setLocked] = useState(false);
  const [warn, setWarn] = useState(false);
  const lastActivity = useRef(Date.now());
  const activitySinceBeat = useRef(false);
  const lastEsc = useRef(0);

  const lock = useCallback(() => {
    window.dispatchEvent(new Event("rehab:lock")); // ให้ฟอร์มบันทึกร่างก่อน
    setLocked(true);
    setWarn(false);
    void lockScreen();
  }, []);

  useEffect(() => {
    const onActivity = () => {
      if (locked) return;
      lastActivity.current = Date.now();
      activitySinceBeat.current = true;
      setWarn(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (locked) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "l") {
        e.preventDefault();
        lock();
        return;
      }
      if (e.key === "Escape") {
        const now = Date.now();
        if (now - lastEsc.current < 600) lock();
        lastEsc.current = now;
      }
      if (e.key === "/" && !isTyping(e.target)) {
        e.preventDefault();
        router.push("/persons?focus=1");
      }
      onActivity();
    };
    window.addEventListener("keydown", onKey);
    for (const ev of ["mousedown", "touchstart", "input", "scroll"]) window.addEventListener(ev, onActivity, { passive: true });

    const tick = setInterval(() => {
      if (locked) return;
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMinutes * 60000) lock();
      else if (idle >= (idleMinutes - 1) * 60000) setWarn(true);
    }, 5000);

    const beat = setInterval(async () => {
      if (locked || !activitySinceBeat.current) return;
      activitySinceBeat.current = false;
      try {
        const r = await heartbeat();
        if (!r.loggedIn) window.location.href = "/login";
        else if (r.locked) setLocked(true);
      } catch {
        /* เครือข่ายหลุดชั่วคราว — ลองใหม่รอบหน้า */
      }
    }, 60000);

    return () => {
      window.removeEventListener("keydown", onKey);
      for (const ev of ["mousedown", "touchstart", "input", "scroll"]) window.removeEventListener(ev, onActivity);
      clearInterval(tick);
      clearInterval(beat);
    };
  }, [locked, idleMinutes, lock, router]);

  return (
    <>
      <button onClick={lock} className="btn-secondary min-h-11 px-4" title="ล็อกหน้าจอ (Ctrl+L หรือกด Esc 2 ครั้ง)" aria-label="ล็อกหน้าจอ">
        <Lock size={22} aria-hidden /> <span className="hidden lg:inline">ล็อก</span>
      </button>

      {warn && !locked && (
        <div role="alert" className="fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded-full bg-ink px-5 py-3 text-white shadow-lg">
          ไม่ได้ใช้งานนาน หน้าจอจะล็อกใน 1 นาที — ขยับเมาส์หรือกดแป้นใดก็ได้เพื่อใช้งานต่อ
        </div>
      )}

      {locked && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-cream/60 p-4 backdrop-blur-xl" role="dialog" aria-modal="true" aria-label="หน้าจอถูกล็อก">
          <div className="card w-full max-w-md">
            <div className="flex items-center gap-4">
              <Avatar first={user.firstName} last={user.lastName} color={user.color} size={56} />
              <div>
                <p className="text-sm text-muted">หน้าจอถูกล็อก</p>
                <p className="text-lg font-semibold">{user.fullName}</p>
              </div>
            </div>
            <UnlockForm
              onUnlocked={() => {
                lastActivity.current = Date.now();
                setLocked(false);
              }}
            />
          </div>
        </div>
      )}
    </>
  );
}

function isTyping(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}
