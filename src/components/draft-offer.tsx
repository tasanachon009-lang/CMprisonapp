"use client";

import { Alert } from "./ui";
import { formatThaiDateTime } from "@/lib/thai-date";

/** แถบ "มีร่างที่ยังไม่บันทึก" — ร่างมาจากบันทึกอัตโนมัติทุก 30 วินาที/ก่อนล็อกหน้าจอ (สเปก 4.3, 22B) */
export function DraftOffer({ savedAt, onRestore, onDiscard }: { savedAt: number; onRestore: () => void; onDiscard: () => void }) {
  return (
    <Alert tone="info">
      <p>มีร่างที่ยังไม่ได้บันทึก (บันทึกอัตโนมัติไว้เมื่อ {formatThaiDateTime(savedAt)}) — เช่น ตอนล็อกหน้าจอหรือกด &quot;ไม่ใช่ฉัน&quot;</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className="btn-secondary btn-sm" onClick={onRestore}>ทำต่อจากร่าง</button>
        <button type="button" className="btn-ghost btn-sm" onClick={onDiscard}>ไม่ใช้ร่าง (ลบ)</button>
      </div>
    </Alert>
  );
}

export function DraftSavedHint({ savedAt }: { savedAt: number | null }) {
  if (!savedAt) return null;
  return <span className="text-xs text-muted">บันทึกร่างอัตโนมัติแล้ว {formatThaiDateTime(savedAt)}</span>;
}
