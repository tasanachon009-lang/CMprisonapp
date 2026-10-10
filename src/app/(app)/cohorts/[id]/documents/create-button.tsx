"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createDocumentAction } from "../../../documents/actions";

export function CreateDocButton({ cohortId, code }: { cohortId: number; code: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <button type="button" className="btn-primary btn-sm" disabled={pending}
        onClick={() => start(async () => {
          setError(null);
          const r = await createDocumentAction(cohortId, code);
          if (!r.ok) return setError(r.error);
          router.push(`/documents/${r.data!.id}`);
        })}>{pending ? "กำลังสร้าง..." : "สร้าง"}</button>
      {error && <span role="alert" className="block text-sm text-danger">{error}</span>}
    </>
  );
}
