/**
 * สร้างไฟล์ Word ของบันทึกข้อความตัวอย่าง (เนื้อหาเดียวกับต้นแบบ) ไว้ตรวจทับ — ไม่ใช้ฐานข้อมูล
 *   npx tsx scripts/memo-word-sample.ts  →  docs/screenshots/memo/system-word.docx
 * จากนั้นเปิดด้วย Word บันทึกเป็น PDF แล้วรัน: npx tsx scripts/memo-overlay.ts docs/screenshots/memo/template.pdf docs/screenshots/memo/system-word.pdf overlay-word
 */
import fs from "node:fs";
import { buildDocView } from "../src/lib/docs/view";
import { docxOf } from "../src/lib/docs/docx";

const K = (n: number) => "ก".repeat(n);
const v = buildDocView({ kind: "memo", docNo: "นร ๐๑๐๔/", docDate: null, subject: K(29), toLine: K(32), refs: null, attachments: null, body: [`ภาคเหตุ ${K(265)}`, `ภาคความประสงค์ ${K(238)}`, `ภาคสรุป ${K(45)}`].join("\n"), signerName: "พิมพ์ชื่อเต็ม", signerTitle: "ตำแหน่ง" }, { name: "", unitName: "", address: "", phone: "", thaiNumerals: true });
const garuda = fs.existsSync("public/doc-assets/garuda.png") ? fs.readFileSync("public/doc-assets/garuda.png") : null;
docxOf({ ...v, orgLines: [""] }, garuda).then((buf) => {
  fs.mkdirSync("docs/screenshots/memo", { recursive: true });
  fs.writeFileSync("docs/screenshots/memo/system-word.docx", buf);
  console.log("docs/screenshots/memo/system-word.docx", buf.length, "bytes");
});
