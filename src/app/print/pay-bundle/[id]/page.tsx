import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { docContext, payees, reconcile, markPrinted } from "@/lib/services/pay-docs";
import { batchView } from "@/lib/services/pay";
import { logPrint } from "@/lib/print";
import { formatThaiDate, isValidISODate } from "@/lib/thai-date";
import { Voucher, KtbForm, BundleSummary, DetailTable, voucherRows, type DocCtx } from "./docs";
import { paginateVoucher } from "@/lib/pay/voucher-pages";

export const dynamic = "force-dynamic";

/**
 * ชุดเอกสารส่งการเงิน (สเปก 11.5C/D): 1) สรุปใหญ่ 2) ใบสำคัญรับเงิน + แบบแจ้งรับเงินโอน KTB เรียงเป็นคู่ 3) รายละเอียดรายคาบ (ตัวเลือก)
 * - เฉพาะรอบที่อนุมัติแล้ว · ตรวจยอดตรงกันทุกจุดก่อนพิมพ์ (ไม่ตรง = ไม่แสดงเอกสาร)
 * - ไม่มีท้ายกระดาษ "พิมพ์โดย" (ตามแบบราชการ) แต่บันทึกการพิมพ์ในประวัติ + สถานะ "พิมพ์แล้ว" รายใบ
 * ?parts=summary,vouchers,detail · who=all|internal|external · order=name|first · keys=u1,i2 · date= · payer= · duplex=1
 */
export default async function PayBundle({ params, searchParams }: PageProps<"/print/pay-bundle/[id]">) {
  const auth = await requirePage("pay.view");
  const { id } = await params;
  const sp = await searchParams;
  const db = getDb();
  let ctx0;
  try { ctx0 = docContext(db, Number(id)); } catch { notFound(); }
  const b = ctx0.batch;
  if (b.status !== "approved") {
    return <div className="sheet"><h1>ยังพิมพ์ไม่ได้</h1><p>รอบเบิกนี้ยังไม่ได้อนุมัติ — เอกสารการเงินพิมพ์ได้เฉพาะรอบที่หัวหน้า/รองอนุมัติแล้ว (ยอดคงที่)</p><p><Link href={`/pay/batches/${b.id}`}>กลับไปที่รอบเบิก</Link></p></div>;
  }
  const str = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const parts = new Set((str("parts") || "summary,vouchers").split(","));
  const who = str("who") === "internal" || str("who") === "external" ? (str("who") as "internal" | "external") : "all";
  const order = str("order") === "first" ? "first" : "name";
  const keys = str("keys") ? str("keys").split(",").filter(Boolean).slice(0, 200) : undefined;
  const date = isValidISODate(str("date")) ? str("date") : b.dateTo;
  const ctx: DocCtx = { ...ctx0, payerName: str("payer").slice(0, 120) || ctx0.payerName };
  const showKtb = str("ktb") ? str("ktb") === "1" : ctx0.showKtb;
  const duplex = str("duplex") === "1";
  const people = payees(db, b.id, { who, order, keys });
  const v = batchView(db, b.id);
  const filtered = who !== "all" || !!keys;
  const issues = reconcile(b, people, v.lines, filtered);
  const total = people.reduce((a, p) => a + p.grossSatang, 0);
  const period = `${formatThaiDate(b.dateFrom, "long")} – ${formatThaiDate(b.dateTo, "long")}`;

  if (issues.length) {
    return (
      <div className="sheet">
        <h1>ยอดไม่ตรงกัน — ยังพิมพ์ไม่ได้</h1>
        <ul>{issues.map((x, i) => <li key={i}>{x}</li>)}</ul>
        <p>แก้ตามรายการข้างบนแล้วเปิดหน้านี้ใหม่ · <Link href={`/pay/batches/${b.id}`}>กลับไปที่รอบเบิก</Link></p>
      </div>
    );
  }
  await logPrint(auth, "pay_bundle", b.id);
  if (parts.has("vouchers")) markPrinted(db, b.id, people, { userId: auth.user.id });
  const incomplete = people.filter((p) => p.missing.length);
  const qs = (o: Record<string, string>) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([, x]) => typeof x === "string")) as Record<string, string>, ...o }).toString()}`;
  const odd = (n: number) => duplex && n % 2 === 1;

  return (
    <>
      <div className="no-print mx-auto my-3 max-w-[210mm] space-y-2 rounded-xl border border-gray-300 bg-white p-3 font-sans text-sm">
        <form className="flex flex-wrap items-end gap-2" action="">
          <label>วันที่ในเอกสาร <input type="date" name="date" defaultValue={date} className="rounded border px-2 py-1" /></label>
          <label>ผู้จ่ายเงิน <input name="payer" defaultValue={ctx.payerName} className="rounded border px-2 py-1" placeholder="ชื่อผู้จ่ายเงิน" /></label>
          <label>เฉพาะ <select name="who" defaultValue={who} className="rounded border px-2 py-1"><option value="all">ทุกคน</option><option value="internal">ภายใน</option><option value="external">ภายนอก</option></select></label>
          <label>เรียง <select name="order" defaultValue={order} className="rounded border px-2 py-1"><option value="name">ตามชื่อ</option><option value="first">ตามวันที่สอนครั้งแรก</option></select></label>
          <label>เอกสาร <select name="parts" defaultValue={[...parts].join(",")} className="rounded border px-2 py-1"><option value="summary,vouchers">สรุป + ใบสำคัญฯ</option><option value="summary,vouchers,detail">สรุป + ใบสำคัญฯ + รายละเอียด</option><option value="vouchers">เฉพาะใบสำคัญฯ</option><option value="summary">เฉพาะสรุป</option></select></label>
          <label>แบบ KTB <select name="ktb" defaultValue={showKtb ? "1" : "0"} className="rounded border px-2 py-1"><option value="1">พิมพ์คู่กัน</option><option value="0">ไม่พิมพ์</option></select></label>
          <label><input type="checkbox" name="duplex" value="1" defaultChecked={duplex} /> พิมพ์สองหน้า (เอกสารใหม่เริ่มหน้าหน้าเสมอ)</label>
          <button className="rounded bg-black px-3 py-1 text-white">ใช้ค่านี้</button>
        </form>
        <p>✅ ตรวจยอดแล้ว: สรุปใหญ่ = ผลรวมใบสำคัญรับเงิน = ผลรวมรายคาบ = ยอดที่อนุมัติ ({(total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท) · {people.length} คน</p>
        {incomplete.length > 0 && (
          <div className="rounded border-2 border-red-600 p-2">
            <b>ข้อมูลวิทยากรไม่ครบ {incomplete.length} คน — เอกสารจะเว้นเส้นจุดไว้ให้เขียนมือ หรือกรอกให้ครบก่อนพิมพ์:</b>
            <ul style={{ paddingLeft: 20 }}>
              {incomplete.map((p) => <li key={p.key}>{p.fullName}: ขาด {p.missing.join(", ")} — {p.instructorId ? <Link className="underline" href={`/instructors/${p.instructorId}`} target="_blank">กรอกข้อมูล</Link> : <Link className="underline" href="/instructors/new" target="_blank">เพิ่มในทะเบียนวิทยากร</Link>}</li>)}
            </ul>
          </div>
        )}
        {filtered && <p>พิมพ์บางส่วน · <Link className="underline" href={qs({ who: "all", keys: "" })}>พิมพ์ทุกคน</Link></p>}
      </div>

      {parts.has("summary") && <><BundleSummary people={people} ctx={ctx} period={period} total={total} tax={v.tax} />{odd(1) && <div className="blank-sheet" />}</>}
      {parts.has("vouchers") && people.map((p) => {
        const voucherPages = paginateVoucher(voucherRows(p)).length;
        return (
          <div key={p.key}>
            <Voucher p={p} ctx={ctx} date={date} tax={v.tax} />
            {odd(voucherPages) && <div className="blank-sheet" />}
            {showKtb && <><KtbForm p={p} ctx={ctx} date={date} />{duplex && <div className="blank-sheet" />}</>}
          </div>
        );
      })}
      {parts.has("detail") && <DetailTable people={people} ctx={ctx} />}
    </>
  );
}
