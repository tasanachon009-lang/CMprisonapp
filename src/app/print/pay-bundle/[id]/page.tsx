import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { docContext, payees, reconcile } from "@/lib/services/pay-docs";
import { batchView } from "@/lib/services/pay";
import { formatThaiDate, isValidISODate } from "@/lib/thai-date";

export const dynamic = "force-dynamic";

/**
 * ชุดเอกสารส่งการเงิน — หน้าตั้งค่าก่อนพิมพ์ + ตรวจยอด + ดูตัวอย่าง PDF
 * ตัวเอกสารสร้างเป็น PDF ด้วย pdf-lib (/api/pay-docs/[id]) วางข้อความตามพิกัดบนแบบฟอร์มต้นฉบับ (สเปก 22)
 */
export default async function PayBundle({ params, searchParams }: PageProps<"/print/pay-bundle/[id]">) {
  await requirePage("pay.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  let c;
  try { c = docContext(db, Number(id)); } catch { notFound(); }
  const b = c.batch;
  if (b.status !== "approved") {
    return <div className="sheet"><h1>ยังพิมพ์ไม่ได้</h1><p>รอบเบิกนี้ยังไม่ได้อนุมัติ — เอกสารการเงินพิมพ์ได้เฉพาะรอบที่หัวหน้า/รองอนุมัติแล้ว (ยอดคงที่)</p><p><Link href={`/pay/batches/${b.id}`}>กลับไปที่รอบเบิก</Link></p></div>;
  }
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const who = str("who") === "internal" || str("who") === "external" ? str("who") : "all";
  const keys = str("keys") ? str("keys").split(",").filter(Boolean).slice(0, 200) : undefined;
  const people = payees(db, b.id, { who: who as "all", order: str("order") === "first" ? "first" : "name", keys });
  const v = batchView(db, b.id);
  const issues = reconcile(b, people, v.lines, who !== "all" || !!keys);
  const total = people.reduce((a, p) => a + p.grossSatang, 0);
  const noDate = str("nodate") === "1";
  const date = isValidISODate(str("date")) ? str("date") : b.dateTo;
  // พารามิเตอร์ของ PDF
  const pdfQs = new URLSearchParams({
    parts: str("parts") || "summary,vouchers", who, order: str("order") || "name", ...(keys ? { keys: keys.join(",") } : {}),
    date: noDate ? "none" : date, payer: str("payer") || c.payerName, ktb: str("ktb") || (c.showKtb ? "1" : "0"), ...(str("duplex") === "1" ? { duplex: "1" } : {}),
  }).toString();
  const pdfUrl = `/api/pay-docs/${b.id}?${pdfQs}`;
  const incomplete = people.filter((p) => p.missing.length);

  return (
    <div className="mx-auto my-3 max-w-5xl space-y-3 rounded-xl border border-gray-300 bg-white p-4 font-sans text-sm">
      <h1 className="text-lg font-bold">ชุดเอกสารส่งการเงิน — {c.project} · {formatThaiDate(b.dateFrom)} – {formatThaiDate(b.dateTo)}</h1>
      <form className="flex flex-wrap items-end gap-3" action="">
        <label className="flex flex-col">วันที่ในเอกสาร <input type="date" name="date" defaultValue={date} className="rounded border px-2 py-1" /></label>
        <label className="flex min-h-11 items-center gap-1"><input type="checkbox" name="nodate" value="1" defaultChecked={noDate} /> ไม่ใส่วันที่ (เว้นไว้เขียนมือ)</label>
        <label className="flex flex-col">ผู้จ่ายเงิน <input name="payer" defaultValue={str("payer") || c.payerName} className="rounded border px-2 py-1" placeholder="ชื่อผู้จ่ายเงิน" /></label>
        <label className="flex flex-col">เฉพาะ <select name="who" defaultValue={who} className="rounded border px-2 py-1"><option value="all">ทุกคน</option><option value="internal">ภายใน</option><option value="external">ภายนอก</option></select></label>
        <label className="flex flex-col">เรียง <select name="order" defaultValue={str("order") || "name"} className="rounded border px-2 py-1"><option value="name">ตามชื่อ</option><option value="first">ตามวันที่สอนครั้งแรก</option></select></label>
        <label className="flex flex-col">เอกสาร <select name="parts" defaultValue={str("parts") || "summary,vouchers"} className="rounded border px-2 py-1"><option value="summary,vouchers">สรุป + ใบสำคัญฯ</option><option value="summary,vouchers,detail">สรุป + ใบสำคัญฯ + รายละเอียด</option><option value="vouchers">เฉพาะใบสำคัญฯ</option><option value="summary">เฉพาะสรุป</option></select></label>
        <label className="flex flex-col">แบบ KTB <select name="ktb" defaultValue={str("ktb") || (c.showKtb ? "1" : "0")} className="rounded border px-2 py-1"><option value="1">พิมพ์คู่กัน</option><option value="0">ไม่พิมพ์</option></select></label>
        <label className="flex min-h-11 items-center gap-1"><input type="checkbox" name="duplex" value="1" defaultChecked={str("duplex") === "1"} /> พิมพ์สองหน้า</label>
        {keys && <input type="hidden" name="keys" value={keys.join(",")} />}
        <button className="min-h-11 rounded bg-black px-4 text-white">ใช้ค่านี้</button>
      </form>

      {issues.length ? (
        <div className="rounded border-2 border-red-600 p-3">
          <b>ยอดไม่ตรงกัน — ยังพิมพ์ไม่ได้</b>
          <ul className="list-disc pl-5">{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
          <p><Link className="underline" href={`/pay/batches/${b.id}`}>กลับไปที่รอบเบิก</Link></p>
        </div>
      ) : (
        <>
          <p>✅ ตรวจยอดแล้ว: สรุปใหญ่ = ผลรวมใบสำคัญรับเงิน = ผลรวมรายคาบ{keys || who !== "all" ? "" : " = ยอดที่อนุมัติ"} ({(total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท) · {people.length} คน{keys || who !== "all" ? " · พิมพ์บางส่วน" : ""}</p>
          {incomplete.length > 0 && (
            <div className="rounded border-2 border-amber-600 p-2">
              <b>ข้อมูลวิทยากรไม่ครบ {incomplete.length} คน — เอกสารจะเว้นเส้นจุดไว้ให้เขียนมือ หรือกรอกให้ครบก่อนพิมพ์:</b>
              <ul className="list-disc pl-5">
                {incomplete.map((p) => <li key={p.key}>{p.fullName}: ขาด {p.missing.join(", ")} — {p.instructorId ? <Link className="underline" href={`/instructors/${p.instructorId}`} target="_blank">กรอกข้อมูล</Link> : <Link className="underline" href="/instructors/new" target="_blank">เพิ่มในทะเบียนวิทยากร</Link>}</li>)}
              </ul>
            </div>
          )}
          <p className="flex flex-wrap items-center gap-3">
            <a href={pdfUrl} target="_blank" className="inline-flex min-h-11 items-center rounded bg-black px-4 font-semibold text-white">เปิด PDF เพื่อพิมพ์</a>
            <span className="text-gray-600">เปิด PDF = บันทึกว่า &quot;พิมพ์แล้ว&quot; · ตำแหน่งเยื้อง? ให้ผู้ดูแลปรับที่ ตั้งค่า → ปรับตำแหน่งการพิมพ์</span>
          </p>
          <iframe title="ตัวอย่าง PDF" src={pdfUrl} className="h-[80vh] w-full rounded border" />
        </>
      )}
    </div>
  );
}
