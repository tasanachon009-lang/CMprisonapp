/**
 * ตรวจแม่แบบบันทึกข้อความกับสเปก 18.3A ด้วยการวัดจริงบนหน้าพิมพ์ (เครื่องพัฒนา + ข้อมูลปลอมเท่านั้น)
 *   npx tsx scripts/memo-check.ts <path เช่น print/weekly-report/1> [ชื่อไฟล์ผลลัพธ์]
 * วัดระยะเป็นมิลลิเมตรจากขอบกระดาษ · บันทึก PDF และภาพหน้าแรกไว้ที่ docs/screenshots/memo/ (ไม่เข้า Git)
 * ต้องเปิด dev server ก่อน
 */
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";

if (config.envLabel === "production") { console.error("❌ ห้ามรันบนเครื่องใช้จริง"); process.exit(1); }
const [path = "print/weekly-report/1", name = "memo"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = drizzle(openDatabase(config.dbPath), { schema }) as DB;
if (!db.select().from(schema.settings).where(eq(schema.settings.key, "app.isDemoData")).get()?.value) { console.error("❌ ฐานข้อมูลนี้ไม่ใช่ข้อมูลปลอม — หยุด"); process.exit(1); }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const admin = db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(eq(schema.userRoles.role, "admin")).all().map((r) => r.id);
// ผู้ดูแลที่ยังไม่รับทราบข้อความเวรสีแดงจะถูกพาไปกล่องจดหมายเวร → ลองทีละคนจนเปิดหน้าได้
const everyone = db.select().from(schema.users).all().filter((u) => u.status === "active" && !u.mustChangePassword);
const admins = [...everyone.filter((u) => admin.includes(u.id)), ...everyone.filter((u) => !admin.includes(u.id))];
const dev = randomBytes(24).toString("base64url"), now = new Date();
db.insert(schema.trustedDevices).values({ id: sha(dev), createdAt: now, expiresAt: new Date(Date.now() + 600000) }).run();
const sessions: string[] = [];
const login = (userId: number) => { const sess = randomBytes(24).toString("base64url"); sessions.push(sess); db.insert(schema.sessions).values({ id: sha(sess), userId, createdAt: now, lastActiveAt: now, expiresAt: new Date(Date.now() + 600000), mfaVerifiedAt: now }).run(); return sess; };

// วัดในหน้า: ระยะเป็น มม. จากมุมซ้ายบนของแผ่นบันทึก (= ขอบกระดาษ) — ส่งเป็นข้อความเพราะ tsx แทรกตัวช่วยที่เบราว์เซอร์ไม่รู้จัก
const MEASURE = `(() => {
  const mm = (px) => Math.round((px * 25.4 / 96) * 10) / 10, pt = (px) => Math.round(parseFloat(px) * 0.75 * 10) / 10;
  const sheet = document.querySelector(".sheet.official.memo"); if (!sheet) return null;
  const o = sheet.getBoundingClientRect();
  const box = (el) => { const r = el.getBoundingClientRect(); return { left: mm(r.left - o.left), top: mm(r.top - o.top), right: mm(r.right - o.left), bottom: mm(r.bottom - o.top), width: mm(r.width), height: mm(r.height) }; };
  const cs = (el) => getComputedStyle(el);
  const garuda = sheet.querySelector(".memo-head .garuda, .memo-head .garuda-empty"), title = sheet.querySelector(".memo-head .title");
  const range = document.createRange(); range.selectNodeContents(title); const tr = range.getBoundingClientRect();
  const fields = [...sheet.querySelectorAll(".field")].map((f) => ({ label: f.querySelector("b").textContent, labelPt: pt(cs(f.querySelector("b")).fontSize), labelBold: cs(f.querySelector("b")).fontWeight, textPt: pt(cs(f.querySelector(".fill")).fontSize), line: cs(f.querySelector(".fill")).borderBottomStyle, labelLeft: box(f.querySelector("b")).left, lineRight: box(f.querySelector(".fill")).right, bottom: box(f).bottom }));
  const body = [...sheet.querySelectorAll(".body p")];
  const first = body.find((p) => !p.className), heading = body.find((p) => p.className === "heading");
  const sign = sheet.querySelector(".sign"), to = sheet.querySelector(".memo-to");
  const last = body[body.length - 1];
  const endorse = [...sheet.querySelectorAll(".endorse-box")].map(box);
  const all = [...sheet.children].map((c) => c.getBoundingClientRect().bottom - o.top);
  return {
    sheet: { width: mm(o.width), paddingLeft: mm(parseFloat(cs(sheet).paddingLeft)), paddingRight: mm(parseFloat(cs(sheet).paddingRight)), paddingTop: mm(parseFloat(cs(sheet).paddingTop)), paddingBottom: mm(parseFloat(cs(sheet).paddingBottom)), font: cs(sheet).fontFamily.split(",")[0], fontLoaded: document.fonts.check('16pt "TH Sarabun New"') },
    garuda: { ...box(garuda), isImage: garuda.tagName === "IMG" },
    title: { text: title.textContent, pt: pt(cs(title).fontSize), bold: cs(title).fontWeight, centerX: mm((tr.left + tr.right) / 2 - o.left), bottom: box(title).bottom },
    fields,
    to: { top: box(to).top, gapAfterSubject: Math.round((box(to).top - fields[fields.length - 1].bottom) * 10) / 10, pt: pt(cs(to).fontSize) },
    body: { pt: pt(cs(first).fontSize), indentMm: mm(parseFloat(cs(first).textIndent)), align: cs(first).textAlign, lineHeight: Math.round((parseFloat(cs(first).lineHeight) / parseFloat(cs(first).fontSize)) * 100) / 100, left: box(first).left, right: box(first).right, headingPt: heading ? pt(cs(heading).fontSize) : null, headingBold: heading ? cs(heading).fontWeight : null, paragraphs: body.length, tables: sheet.querySelectorAll("table").length, bigHeadings: sheet.querySelectorAll("h1,h2,h3").length },
    sign: { centerX: mm((sign.getBoundingClientRect().left + sign.getBoundingClientRect().right) / 2 - o.left), centerPctOfPage: Math.round(((sign.getBoundingClientRect().left + sign.getBoundingClientRect().right) / 2 - o.left) / o.width * 1000) / 10, gapAboveLines: Math.round(((sign.getBoundingClientRect().top - last.getBoundingClientRect().bottom) / parseFloat(cs(first).lineHeight)) * 10) / 10 },
    endorse,
    contentBottom: mm(Math.max(...all)), sheetHeight: mm(o.height),
    annex: [...document.querySelectorAll(".sheet.annex")].map((a) => ({ title: a.querySelector(".annex-title").textContent, tables: a.querySelectorAll("table").length, rows: a.querySelectorAll("tbody tr").length, tablePt: a.querySelector("table") ? pt(cs(a.querySelector("table")).fontSize) : null, overflow: [...a.querySelectorAll("td")].some((td) => td.scrollWidth > td.clientWidth + 1) })),
  };
})()`;

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 1300 }, locale: "th-TH", deviceScaleFactor: 2 });
  await ctx.addInitScript("addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');s.textContent='nextjs-portal{display:none!important}';document.head.appendChild(s)})");
  const page = await ctx.newPage();
  let res = null;
  for (const u of admins) {
    await ctx.addCookies([{ name: "rh_dev", value: dev, url: BASE }, { name: "rh_sess", value: login(u.id), url: BASE }]);
    res = await page.goto(`${BASE}/${path.replace(/^\//, "")}`, { waitUntil: "networkidle", timeout: 60000 });
    if (!page.url().includes("/inbox") && !page.url().includes("/forbidden")) break;
  }
  await page.evaluate("document.fonts.ready");
  const m = await page.evaluate(MEASURE);
  const dir = "docs/screenshots/memo";
  fs.mkdirSync(dir, { recursive: true });
  const first = page.locator(".sheet.official.memo");
  await first.screenshot({ path: `${dir}/${name}-page1.png` });
  const annex = page.locator(".sheet.annex").first();
  if (await annex.count()) await annex.screenshot({ path: `${dir}/${name}-annex.png` });
  await page.emulateMedia({ media: "print" });
  const pdf = await page.pdf({ path: `${dir}/${name}.pdf`, preferCSSPageSize: true, printBackground: true });
  const pages = (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;
  console.log(JSON.stringify({ status: res?.status(), pdfPages: pages, ...((m as object) ?? { error: "ไม่พบแผ่นบันทึกข้อความ" }) }, null, 1));
  await browser.close();
  for (const x of sessions) db.delete(schema.sessions).where(eq(schema.sessions.id, sha(x))).run();
  db.delete(schema.trustedDevices).where(eq(schema.trustedDevices.id, sha(dev))).run();
})().catch((e) => { console.error(e); process.exit(1); });
