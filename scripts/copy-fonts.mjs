// คัดลอกฟอนต์เอกสาร TH Sarabun New จาก assets/fonts → public/fonts (รันอัตโนมัติก่อน dev/build)
import fs from "node:fs";
const files = ["THSarabunNew.ttf", "THSarabunNew Bold.ttf", "THSarabunNew Italic.ttf", "THSarabunNew BoldItalic.ttf"];
fs.mkdirSync("public/fonts", { recursive: true });
const missing = [];
for (const f of files) {
  if (fs.existsSync(`assets/fonts/${f}`)) fs.copyFileSync(`assets/fonts/${f}`, `public/fonts/${f}`);
  else missing.push(f);
}
if (missing.length) console.warn(`! ไม่พบฟอนต์: ${missing.join(", ")} (ดู README หัวข้อฟอนต์)`);
