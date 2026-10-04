import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingTasks, type BstFilter } from "@/lib/queries/bst";
import { SYSTEM_LABEL, STEP_LABEL } from "@/lib/services/followup";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/** รายชื่อค้างลง บสต./รท.101 พิมพ์เป็นเช็คลิสต์ */
export default async function BstPrint({ searchParams }: PageProps<"/print/bst">) {
  const auth = await requirePage("bst.view");
  const sp = await searchParams;
  const filter = (["today", "week", "overdue", "all"].includes(String(sp.f)) ? sp.f : "all") as BstFilter;
  const rows = pendingTasks(getDb(), filter, todayISO());
  const footer = await logPrint(auth, "bst_checklist", filter);
  return (
    <div className="sheet">
      <DocHeader title="เช็คลิสต์งานค้างลง บสต./รท.101" subtitle={`ณ ${formatThaiDate(todayISO(), "long")} · ${filter === "overdue" ? "เลยกำหนด" : filter === "today" ? "ครบกำหนดวันนี้" : filter === "week" ? "ภายใน 7 วัน" : "ค้างทั้งหมด"} ${rows.length} งาน`} />
      <table>
        <thead><tr><th style={{ width: "5%" }}>☐</th><th>ชื่อ-สกุล</th><th style={{ width: "14%" }}>เลขประจำตัว</th><th style={{ width: "18%" }}>รุ่น</th><th style={{ width: "10%" }}>ระบบ</th><th style={{ width: "18%" }}>ขั้นตอน</th><th style={{ width: "13%" }}>กำหนด</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.t.id}><td className="center">☐</td><td>{r.p.firstName} {r.p.lastName}</td><td>{r.inc.inmateNo}</td><td>{r.label}</td><td>{SYSTEM_LABEL[r.t.system]}</td><td>{STEP_LABEL[r.t.step]}</td><td>{formatThaiDate(r.t.dueDate)}</td></tr>)}</tbody>
      </table>
      <DocFooter text={footer} />
    </div>
  );
}
