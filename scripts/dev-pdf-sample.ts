// dev helper (ไม่ใช้ในระบบจริง): สร้าง PDF ตัวอย่างด้วยข้อมูลปลอมไว้ตรวจด้วยตา → public/dev-preview/ (ไม่เข้า Git)
// รัน: npx tsx --conditions=react-server scripts/dev-pdf-sample.ts
import fs from "node:fs";
import { createPdf } from "../src/lib/pdf/core";
import { drawKtb } from "../src/lib/pdf/ktb";
import { drawVoucher } from "../src/lib/pdf/voucher";
import type { Payee } from "../src/lib/services/pay-docs";

const base: Payee = {
  key: "x", kind: "external", userId: null, instructorId: 1, prefix: "นาย", firstName: "ตัวอย่าง", lastName: "ยาวมาก", fullName: "นายตัวอย่าง ยาวมาก", position: null, organization: null,
  nationalId: "1101700230705", phone: "0812345678", email: "sample@example.com",
  addr: { houseNo: "123/45", moo: "12", soi: "ร่วมใจ 3", road: "ซุปเปอร์ไฮเวย์เชียงใหม่-ลำปาง", subdistrict: "ฟ้าฮ่าม", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50000" },
  payeeType: "company", companyName: "ห้างหุ้นส่วนจำกัด ฟื้นฟูใจ (ข้อมูลปลอม)", bank: "ธนาคารกรุงไทย", bankBranch: "ป่าตัน", accountType: "current", accountName: "หจก. ฟื้นฟูใจ", accountNo: "9876543210", notifyChannel: "both",
  missing: [], updatedAt: null, grossSatang: 0, taxSatang: 0, netSatang: 0, sessions: 0, hours: 0, firstDate: "2026-10-01", lines: [],
};
const lines = Array.from({ length: 34 }, (_, i) => ({ sessionId: i, cohortId: 1, staffId: i, key: "x", name: "", kind: "external" as const, userId: null, instructorId: 1, date: `2026-10-${String((i % 28) + 1).padStart(2, "0")}`, startTime: "09:00", title: i % 4 === 0 ? "การจัดการอารมณ์ (โกรธ รับรู้ความเครียด ลดความเครียด) และการฟื้นฟูสัมพันธภาพในครอบครัว" : "ทักษะการปฏิเสธ", hours: 1.5, factor: i % 3 === 0 ? 0.5 : 1, splitMethod: (i % 3 === 0 ? "equal" : "full") as "equal" | "full", rateId: 1, perHourSatang: 60000, grossSatang: 0, capCutSatang: 0, amountSatang: i % 3 === 0 ? 45000 : 90000, payable: true, note: null }));
const p: Payee = { ...base, lines, grossSatang: lines.reduce((a, l) => a + l.amountSatang, 0) };
p.taxSatang = Math.round(p.grossSatang * 0.03); p.netSatang = p.grossSatang - p.taxSatang;
async function main() {
const pdf = await createPdf();
const n = await drawVoucher(pdf, p, { orgName: "เรือนจำกลางเชียงใหม่", project: "ปรับเปลี่ยนพฤติกรรม 12 วัน รุ่นที่ 1/2570", corner: "เอกสารหมายเลข ๑", payerName: "นางตัวอย่าง จ่ายเงิน", date: null, tax: { enabled: true, pct: 3 } });
await drawKtb(pdf, p, { orgName: "เรือนจำกลางตัวอย่างมีชื่อยาว", headTitle: "ผู้บัญชาการเรือนจำกลางตัวอย่างมีชื่อยาว", date: "2026-10-19" });
fs.mkdirSync("public/dev-preview", { recursive: true });
fs.writeFileSync("public/dev-preview/sample.pdf", await pdf.doc.save());
console.log("voucher pages", n, "→ public/dev-preview/sample.pdf");
}
void main();