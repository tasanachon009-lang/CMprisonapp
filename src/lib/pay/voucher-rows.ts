import { SPLIT_LABEL, type PayLine } from "./calc";
import type { VoucherRow } from "./voucher-pages";
import { formatThaiDate } from "../thai-date";

const fmt = (satang: number) => (satang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 });

/** บรรทัดรายการใบสำคัญรับเงิน: "1. วันที่ 5 ต.ค. 2569 หัวข้อ ทักษะการปฏิเสธ 1.5 ชม. × 600 บาท = 900 บาท" (สเปก 11.5C) */
export function voucherRows(lines: PayLine[]): VoucherRow[] {
  return lines.map((l, i) => {
    const h = Math.round(l.hours * l.factor * 100) / 100;
    const split = l.factor !== 1 ? ` (${SPLIT_LABEL[l.splitMethod]} จาก ${l.hours} ชม.)` : "";
    const cap = l.capCutSatang ? ` หักเพดานต่อวัน ${fmt(l.capCutSatang)} บาท` : "";
    return { text: `${i + 1}. วันที่ ${formatThaiDate(l.date)} หัวข้อ ${l.title} ${h} ชม.${split} × ${fmt(l.perHourSatang)} บาท${cap} = ${fmt(l.amountSatang)} บาท`, amountSatang: l.amountSatang };
  });
}
