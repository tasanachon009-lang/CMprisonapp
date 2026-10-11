/**
 * วางทับ PDF ของระบบกับต้นแบบบันทึกข้อความจริง (สเปก 18.3A: คลาดไม่เกิน 1–2 มม.) — เครื่องพัฒนา + ข้อมูลปลอมเท่านั้น
 *   npx tsx scripts/memo-overlay.ts [pdf ต้นแบบ = docs/screenshots/memo/template.pdf] [pdf ของระบบที่มีอยู่แล้ว เช่นไฟล์ Word ที่แปลงเป็น PDF] [ชื่อผลลัพธ์ = overlay]
 *   ไม่ใส่ pdf ของระบบ = พิมพ์หน้า /print/memo-sample (เนื้อหาเดียวกับต้นแบบ) เป็น PDF แล้วเทียบ
 * ต้นแบบ PDF ได้จากการเปิด docs/forms/memo-template.doc ด้วย Word แล้วบันทึกเป็น PDF
 * ผลลัพธ์ (ไม่เข้า Git) ที่ docs/screenshots/memo/: system.pdf · overlay.png (แดง = ต้นแบบ, น้ำเงิน = ระบบ) · template.png · system.png
 * ต้องเปิด dev server ก่อน
 */
import fs from "node:fs";
import http from "node:http";
import nodePath from "node:path";
import { createRequire } from "node:module";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";

if (config.envLabel === "production") { console.error("❌ ห้ามรันบนเครื่องใช้จริง"); process.exit(1); }
const DIR = "docs/screenshots/memo";
const template = process.argv[2] ?? `${DIR}/template.pdf`;
const given = process.argv[3] ?? null, outName = process.argv[4] ?? "overlay";
const systemPdf = given ?? `${DIR}/system.pdf`;
if (!fs.existsSync(template)) { console.error(`ไม่พบ ${template} — เปิด docs/forms/memo-template.doc ด้วย Word แล้วบันทึกเป็น PDF ไว้ที่นี่ก่อน`); process.exit(1); }
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = drizzle(openDatabase(config.dbPath), { schema }) as DB;
if (!db.select().from(schema.settings).where(eq(schema.settings.key, "app.isDemoData")).get()?.value) { console.error("❌ ฐานข้อมูลนี้ไม่ใช่ข้อมูลปลอม — หยุด"); process.exit(1); }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const require2 = createRequire(import.meta.url);
const pdfDir = nodePath.dirname(require2.resolve("pdfjs-dist/legacy/build/pdf.mjs"));
const MM = 25.4 / 72;

/** จุดที่ต้องตรงกับต้นแบบ: กรอบ (มม. จากมุมซ้ายบนของกระดาษ) ที่ใช้หาขอบหมึกของแต่ละส่วน แล้วเทียบต้นแบบกับระบบ */
const REGIONS: Array<[name: string, x0: number, y0: number, x1: number, y1: number, edges: string]> = [
  ["ครุฑ", 26, 12, 48, 33, "ltrb"],
  ["บันทึกข้อความ", 85, 20, 140, 34, "ltrb"],
  ["ส่วนราชการ (ป้าย)", 28, 33.5, 53.5, 40.2, "ltb"],
  ["เส้นจุด ส่วนราชการ", 54.5, 38.6, 192, 41.2, "ltrb"],
  ["ที่ (ป้าย)", 28, 42.5, 33.5, 49.4, "ltb"],
  ["เส้นจุด ที่", 33.8, 47.9, 109.2, 50.4, "ltrb"],
  ["วันที่ (ป้าย)", 108, 42.5, 118, 49.4, "ltb"],
  ["เส้นจุด วันที่", 118.3, 47.9, 192, 50.4, "ltrb"],
  ["เรื่อง (ป้าย)", 28, 51.6, 38.6, 58.6, "ltb"],
  ["เส้นจุด เรื่อง", 39.6, 57.1, 192, 59.6, "ltrb"],
  ["เรียน", 28, 62, 40, 69.5, "ltb"],
  ["ย่อหน้าแรก (บรรทัดแรก)", 28, 71.5, 192, 79, "ltb"],
  ["ย่อหน้าแรก (บรรทัดที่ 2)", 28, 79.2, 192, 86.3, "lrb"],
  ["ย่อหน้าที่ 2", 28, 103.5, 192, 110.5, "ltb"],
  ["ย่อหน้าที่ 3", 28, 135, 192, 142.3, "ltb"],
  ["ลงชื่อ (ชื่อในวงเล็บ)", 95, 164.5, 150, 172, "ltrb"],
  ["ตำแหน่ง", 95, 172.5, 150, 179.5, "ltrb"],
];

(async () => {
  const everyone = db.select().from(schema.users).all().filter((u) => u.status === "active" && !u.mustChangePassword);
  const dev = randomBytes(24).toString("base64url"), now = new Date();
  db.insert(schema.trustedDevices).values({ id: sha(dev), createdAt: now, expiresAt: new Date(Date.now() + 600000) }).run();
  const sessions: string[] = [];
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1300 }, locale: "th-TH" });
  const page = await ctx.newPage();
  for (const u of everyone) {
    const sess = randomBytes(24).toString("base64url"); sessions.push(sess);
    db.insert(schema.sessions).values({ id: sha(sess), userId: u.id, createdAt: now, lastActiveAt: now, expiresAt: new Date(Date.now() + 600000), mfaVerifiedAt: now }).run();
    await ctx.addCookies([{ name: "rh_dev", value: dev, url: BASE }, { name: "rh_sess", value: sess, url: BASE }]);
    await page.goto(`${BASE}/print/memo-sample?no=1`, { waitUntil: "networkidle", timeout: 60000 });
    if (page.url().includes("/print/memo-sample")) break;
  }
  if (!page.url().includes("/print/memo-sample")) throw new Error("เปิดหน้าตัวอย่างแม่แบบไม่ได้ (ไม่มีผู้ใช้ที่มีสิทธิ์ docs.view)");
  await page.evaluate("document.fonts.ready");
  await page.emulateMedia({ media: "print" });
  if (!given) await page.pdf({ path: systemPdf, preferCSSPageSize: true, printBackground: true });

  // 2) ภาพวางทับ: เรนเดอร์ PDF ทั้งสองด้วย pdf.js ในเบราว์เซอร์ (เสิร์ฟไฟล์ผ่านเซิร์ฟเวอร์ชั่วคราวในเครื่อง)
  const files: Record<string, string> = { "/pdf.mjs": nodePath.join(pdfDir, "pdf.mjs"), "/pdf.worker.mjs": nodePath.join(pdfDir, "pdf.worker.mjs"), "/template.pdf": template, "/system.pdf": systemPdf };
  const html = `<!doctype html><meta charset="utf-8"><body style="margin:0;background:#fff"><canvas id="t"></canvas><canvas id="s"></canvas><canvas id="o"></canvas>
<script>window.REGIONS = ${JSON.stringify(REGIONS)};</script>
<script type="module">
import * as pdfjs from "/pdf.mjs";
pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.mjs";
const SCALE = 300 / 72;
async function render(url, id) {
  const page = await (await pdfjs.getDocument({ url }).promise).getPage(1);
  const vp = page.getViewport({ scale: SCALE });
  const c = document.getElementById(id); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
  const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height);
  await page.render({ canvasContext: g, viewport: vp }).promise;
  return c;
}
const a = await render("/template.pdf", "t"), b = await render("/system.pdf", "s");
const o = document.getElementById("o"); o.width = Math.max(a.width, b.width); o.height = Math.max(a.height, b.height);
const g = o.getContext("2d");
const da = a.getContext("2d").getImageData(0, 0, a.width, a.height).data, dbb = b.getContext("2d").getImageData(0, 0, b.width, b.height).data;
const out = g.createImageData(o.width, o.height);
for (let y = 0; y < o.height; y++) for (let x = 0; x < o.width; x++) {
  const i = (y * o.width + x) * 4;
  const ia = x < a.width && y < a.height ? da[(y * a.width + x) * 4] : 255, ib = x < b.width && y < b.height ? dbb[(y * b.width + x) * 4] : 255;
  const ta = 1 - ia / 255, tb = 1 - ib / 255; // ความเข้มหมึก: ต้นแบบ = แดง, ระบบ = น้ำเงิน, ทับกัน = ม่วงเข้ม
  out.data[i] = 255 - Math.round(255 * tb); out.data[i + 1] = 255 - Math.round(255 * Math.max(ta, tb)); out.data[i + 2] = 255 - Math.round(255 * ta); out.data[i + 3] = 255;
}
g.putImageData(out, 0, 0);
// ขอบหมึกของแต่ละกรอบ (มม.)
const PX = SCALE * 72 / 25.4;
const bbox = (c, d, x0, y0, x1, y1) => {
  let l = 1e9, t = 1e9, r = -1, b = -1;
  for (let y = Math.max(0, Math.floor(y0 * PX)); y < Math.min(c.height, Math.ceil(y1 * PX)); y++) for (let x = Math.max(0, Math.floor(x0 * PX)); x < Math.min(c.width, Math.ceil(x1 * PX)); x++) {
    const i = (y * c.width + x) * 4; if ((d[i] + d[i + 1] + d[i + 2]) / 3 < 150) { if (x < l) l = x; if (x > r) r = x; if (y < t) t = y; if (y > b) b = y; }
  }
  return r < 0 ? null : { l: l / PX, t: t / PX, r: (r + 1) / PX, b: (b + 1) / PX };
};
window.result = (window.REGIONS || []).map(([name, x0, y0, x1, y1, edges]) => ({ name, edges, a: bbox(a, da, x0, y0, x1, y1), b: bbox(b, dbb, x0, y0, x1, y1) }));
window.done = true;
</script>`;
  const server = http.createServer((req, res) => {
    const u = (req.url ?? "/").split("?")[0];
    if (u === "/") { res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html); }
    const f = files[u];
    if (!f) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": u.endsWith(".mjs") ? "text/javascript" : "application/pdf" });
    res.end(fs.readFileSync(f));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as { port: number }).port;
  const p2 = await ctx.newPage();
  p2.on("pageerror", (e) => console.error("pdf.js:", e.message));
  p2.on("console", (m) => { if (m.type() === "error") console.error("pdf.js:", m.text()); });
  await p2.goto(`http://127.0.0.1:${port}/`);
  await p2.waitForFunction("window.done === true", undefined, { timeout: 120000 });
  const result = (await p2.evaluate("window.result")) as Array<{ name: string; edges: string; a: Record<string, number> | null; b: Record<string, number> | null }>;
  for (const [id, name] of [["t", "template"], ["s", given ? `${outName}-system` : "system"], ["o", outName]]) await p2.locator(`#${id}`).screenshot({ path: `${DIR}/${name}.png` });
  server.close();
  await browser.close();
  for (const x of sessions) db.delete(schema.sessions).where(eq(schema.sessions.id, sha(x))).run();
  db.delete(schema.trustedDevices).where(eq(schema.trustedDevices.id, sha(dev))).run();

  const LABEL: Record<string, string> = { l: "ซ้าย", t: "บน", r: "ขวา", b: "ล่าง" };
  const rows = result.map((x) => {
    const d = x.a && x.b ? x.edges.split("").map((e) => [e, Math.round((x.b![e] - x.a![e]) * 10) / 10] as [string, number]) : null;
    return { "จุดที่ตรวจ": x.name, "คลาด (มม.)": d ? d.map(([e, v]) => `${LABEL[e]} ${v > 0 ? "+" : ""}${v}`).join("  ") : "ไม่พบหมึกในกรอบ", "มากสุด": d ? Math.max(...d.map(([, v]) => Math.abs(v))) : 99 };
  });
  const worst = Math.max(...rows.map((r) => r["มากสุด"]));
  console.table(rows);
  fs.writeFileSync(`${DIR}/${outName}-result.json`, JSON.stringify(rows, null, 1));
  console.log(`คลาดมากที่สุด ${worst} มม. ${worst <= 2 ? "✅ อยู่ในเกณฑ์ 2 มม." : "❌ เกิน 2 มม."}`);
  console.log(`ภาพ: ${DIR}/${outName}.png (แดง = ต้นแบบ · น้ำเงิน = ระบบ)`);
  if (worst > 2) process.exit(2);
})().catch((e) => { console.error(e); process.exit(1); });
