import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { pendingTasks, type BstFilter, type TaskSystem } from "@/lib/queries/bst";
import { SYSTEM_LABEL, STEP_LABEL } from "@/lib/services/followup";
import { formatThaiDate, todayISO } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/** รายชื่อค้างลง บสต. หรือ รท.101 (แยกกัน) พิมพ์เป็นเช็คลิสต์ */
export default async function BstPrint({ searchParams }: PageProps<"/print/bst">) {
  const auth = await requirePage("bst.view");
  const sp = await searchParams;
  const system: TaskSystem = sp.s === "rt101" ? "rt101" : "bst";
  const filter = (["today", "week", "overdue", "all"].includes(String(sp.f)) ? sp.f : "all") as BstFilter;
  const rows = pendingTasks(getDb(), system, filter, todayISO());
  const footer = await logPrint(auth, `${system}_checklist`, filter);
  const isBst = system === "bst";
  return (
    <div className="sheet">
      <DocHeader title={`เช็คลิสต์งานค้างลง ${SYSTEM_LABEL[system]}`} subtitle={`ณ ${formatThaiDate(todayISO(), "long")} · ${filter === "overdue" ? "เลยกำหนด" : filter === "today" ? "ครบกำหนดวันนี้" : filter === "week" ? "ภายใน 7 วัน" : "ค้างทั้งหมด"} ${rows.length} ${isBst ? "งาน" : "คน"}`} />
      <table>
        <thead><tr><th style={{ width: "5%" }}>☐</th><th>ชื่อ-สกุล</th><th style={{ width: "15%" }}>เลขประจำตัว</th><th style={{ width: "22%" }}>รุ่น</th>{isBst && <th style={{ width: "20%" }}>ขั้นตอน</th>}<th style={{ width: "14%" }}>ครบกำหนด</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.t.id}><td className="center">☐</td><td>{r.p.firstName} {r.p.lastName}</td><td>{r.inc.inmateNo}</td><td>{r.label}</td>{isBst && <td>{STEP_LABEL[r.t.step]}</td>}<td>{formatThaiDate(r.t.dueDate)}</td></tr>)}</tbody>
      </table>
      <DocFooter text={footer} />
    </div>
  );
}
