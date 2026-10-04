"use client";

import { useEffect, useRef, useState } from "react";
import { saveDraft, loadDraft, clearDraft } from "@/app/(app)/drafts";

/** บันทึกร่างอัตโนมัติทุก 30 วินาที และทันทีเมื่อล็อกหน้าจอ */
export function useAutosave<T>(key: string, value: T, enabled = true) {
  const latest = useRef(value);
  const lastSaved = useRef<string>("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  latest.current = value;

  useEffect(() => {
    if (!enabled) return;
    const save = async () => {
      const s = JSON.stringify(latest.current);
      if (s === lastSaved.current) return;
      const r = await saveDraft(key, latest.current);
      if (r.ok) {
        lastSaved.current = s;
        setSavedAt(Date.now());
      }
    };
    const t = setInterval(save, 30000);
    const onLock = () => void save();
    window.addEventListener("rehab:lock", onLock);
    return () => {
      clearInterval(t);
      window.removeEventListener("rehab:lock", onLock);
    };
  }, [key, enabled]);

  return {
    savedAt,
    load: () => loadDraft(key),
    clear: async () => {
      lastSaved.current = JSON.stringify(latest.current);
      await clearDraft(key);
    },
  };
}
