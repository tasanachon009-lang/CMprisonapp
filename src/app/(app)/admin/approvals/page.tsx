import { desc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { DUAL_ACTIONS } from "@/lib/services/admin";
import { userNameMap } from "@/lib/queries/names";
import { getSetting } from "@/lib/bootstrap";
import { formatThaiDateTime } from "@/lib/thai-date";
import { Breadcrumb, PageHeader, EmptyState, Alert } from "@/components/ui";
import { ApprovalButtons, EmergencyCodePanel } from "./approval-client";

export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { pending: "รอยืนยัน", approved: "ยืนยันแล้ว", rejected: "ไม่อนุมัติ/ยกเลิก", executed: "ทำรายการแล้ว", expired: "หมดอายุ" };

export default async function ApprovalsPage() {
  const auth = await requirePage("users.manage");
  const db = getDb();
  const rows = db.select().from(schema.dualApprovals).orderBy(desc(schema.dualApprovals.id)).limit(50).all();
  const names = userNameMap(db);
  const emergencySet = !!getSetting(db, "auth.emergencyCodeHash", null);
  const usedAt = getSetting<number | null>(db, "auth.emergencyCodeUsedAt", null);
  return (
    <div className="max-w-4xl space-y-6">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "ยืนยัน 2 คน" }]} />
      <PageHeader title="การกระทำที่ต้องยืนยัน 2 คน" subtitle="กู้คืนข้อมูล ลบข้อมูลถาวร เปลี่ยนสิทธิ์ผู้ดูแล — คนหนึ่งขอ อีกคนกดยืนยัน (มอบอำนาจไม่ได้)" />
      {!emergencySet && <Alert tone="danger">ยังไม่มีรหัสฉุกเฉิน{usedAt ? ` (ถูกใช้ไปเมื่อ ${formatThaiDateTime(usedAt)})` : ""} — กรุณาสร้างใหม่และพิมพ์ใส่ซองปิดผนึก</Alert>}
      <section className="space-y-3">
        {rows.length === 0 && <EmptyState title="ยังไม่มีคำขอ" />}
        {rows.map((r) => (
          <div key={r.id} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg">{DUAL_ACTIONS[r.action as keyof typeof DUAL_ACTIONS] ?? r.action}</h2>
              <span className={r.status === "pending" ? "tag-warn" : r.status === "executed" ? "tag-ok" : "tag-muted"}>{STATUS[r.status]}</span>
            </div>
            <p className="mt-1 text-sm text-muted">ขอโดย {names.get(r.requestedBy)} เมื่อ {formatThaiDateTime(r.requestedAt)} · เหตุผล: {r.reason}</p>
            <p className="text-sm">{r.action === "restore" ? `ไฟล์: ${(r.payload as { file?: string })?.file}` : (r.payload as { userId?: number })?.userId ? `ผู้ใช้: ${names.get((r.payload as { userId: number }).userId)}` : ""}</p>
            {r.decidedBy && <p className="text-sm text-muted">ตัดสินโดย {names.get(r.decidedBy)} เมื่อ {formatThaiDateTime(r.decidedAt)}{r.result ? ` · ${r.result}` : ""}</p>}
            {r.status === "pending" && <ApprovalButtons id={r.id} isRequester={r.requestedBy === auth.user.id} isRestore={r.action === "restore"} />}
          </div>
        ))}
      </section>
      <EmergencyCodePanel />
    </div>
  );
}
