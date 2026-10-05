/**
 * สร้างไฟล์ที่อยู่ไทยแบบย่อ (ใช้งานออฟไลน์) จากชุดข้อมูลเปิด kongvut/thai-province-data (MIT)
 * https://github.com/kongvut/thai-province-data — ไฟล์ api/latest/{province,district,sub_district}.json
 * ใช้: node scripts/build-thai-address.mjs <โฟลเดอร์ที่มี 3 ไฟล์>
 * ผลลัพธ์: src/lib/data/thai-address.json
 *   p: [id, ชื่อจังหวัด] · d: [id, provinceId, ชื่ออำเภอ/เขต] · s: [id, districtId, ชื่อตำบล/แขวง, รหัสไปรษณีย์]
 */
import fs from "node:fs";
import path from "node:path";

const dir = process.argv[2];
if (!dir) throw new Error("ระบุโฟลเดอร์ที่มี province.json district.json sub_district.json");
const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), "utf8")).filter((x) => !x.deleted_at);
const p = read("province").map((x) => [x.id, x.name.th.trim()]);
const d = read("district").map((x) => [x.id, x.province_id, x.name.th.trim()]);
const s = read("sub_district").map((x) => [x.id, x.district_id, x.name.th.trim(), x.zip_code ? String(x.zip_code) : ""]);
const out = path.resolve("src/lib/data/thai-address.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ source: "kongvut/thai-province-data (MIT)", builtAt: new Date().toISOString().slice(0, 10), p, d, s }));
console.log(`จังหวัด ${p.length} · อำเภอ ${d.length} · ตำบล ${s.length} · ${(fs.statSync(out).size / 1024).toFixed(0)} KB → ${out}`);
