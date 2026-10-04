"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCheck, Mail } from "lucide-react";
import { ackShiftMessage } from "@/app/(app)/inbox/actions";

type Msg = { id: number; level: string; body: string; author: string; when: string; healthRelated: boolean };
const CLS: Record<string, string> = { normal: "border-line", important: "border-warn-bg", red: "border-danger bg-danger/5" };
const TAG: Record<string, [string, string]> = { normal: ["tag-muted", "ปกติ"], important: ["tag-warn", "สำคัญ"], red: ["tag-danger", "สีแดง"] };

/** ป๊อปอัปบังจอเมื่อเข้าระบบ: ข้อความส่งเวรที่ค้างอ่าน ต้องกด "รับทราบภารกิจ" ทีละข้อ (สเปก 20) */
export function InboxGate({ messages }: { messages: Msg[] }) {
  const router = useRouter();
  const [left, setLeft] = useState(messages);
  const [pending, start] = useTransition();
  if (!left.length) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="ข้อความส่งเวรที่ยังไม่รับทราบ">
      <div className="card max-h-[85vh] w-full max-w-2xl overflow-y-auto">
        <h2 className="flex items-center gap-2 text-2xl"><Mail aria-hidden /> ข้อความส่งเวร ({left.length})</h2>
        <p className="text-muted">กรุณาอ่านและกด &quot;รับทราบภารกิจ&quot; ทีละข้อ</p>
        <ul className="mt-4 space-y-3">
          {left.map((m) => (
            <li key={m.id} className={`rounded-2xl border-2 p-4 ${CLS[m.level]}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className={TAG[m.level][0]}>{TAG[m.level][1]}</span>
                {m.healthRelated && <span className="tag-orange">เรื่องสุขภาพ</span>}
                <span className="text-muted">{m.author} · {m.when}</span>
              </div>
              <p className="mt-2 whitespace-pre-line text-lg">{m.body}</p>
              <button className="btn-primary btn-sm mt-3" disabled={pending} onClick={() => start(async () => {
                const r = await ackShiftMessage(m.id);
                if (r.ok) {
                  const rest = left.filter((x) => x.id !== m.id);
                  setLeft(rest);
                  if (!rest.length) router.refresh();
                }
              })}><CheckCheck size={18} aria-hidden /> รับทราบภารกิจ</button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
