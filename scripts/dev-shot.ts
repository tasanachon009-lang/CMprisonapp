/**
 * ถ่ายภาพหน้าจอ 1 หน้าด้วยบัญชีทดสอบตามบทบาท (เครื่องพัฒนา + ข้อมูลปลอมเท่านั้น) — ใช้ตรวจหน้าจอระหว่างพัฒนา
 *   npx tsx scripts/dev-shot.ts <path ไม่ต้องมี / นำหน้า เช่น cohorts/6/tc> [role=admin] [desktop|tablet] [out.jpg]
 * ต้องเปิด dev server ก่อน · ภาพไม่เข้า Git (docs/screenshots/ ถูกกันไว้)
 */
import { createHash, randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, inArray } from "drizzle-orm";
import { openDatabase, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";

if (config.envLabel === "production") { console.error("❌ ห้ามรันบนเครื่องใช้จริง"); process.exit(1); }
const [path = "/", role = "admin", device = "desktop", out = "docs/screenshots/dev-shot.jpg"] = process.argv.slice(2);
const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const db = drizzle(openDatabase(config.dbPath), { schema }) as DB;
if (!db.select().from(schema.settings).where(eq(schema.settings.key, "app.isDemoData")).get()?.value) { console.error("❌ ฐานข้อมูลนี้ไม่ใช่ข้อมูลปลอม — หยุด"); process.exit(1); }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

const ids = db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(eq(schema.userRoles.role, role)).all().map((r) => r.id);
const admins = role === "admin" ? [] : db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(eq(schema.userRoles.role, "admin")).all().map((r) => r.id);
const user = db.select().from(schema.users).where(inArray(schema.users.id, ids.length ? ids : [-1])).all().find((u) => u.status === "active" && !u.mustChangePassword && !admins.includes(u.id));
if (!user) { console.error(`ไม่พบผู้ใช้บทบาท ${role}`); process.exit(1); }
const dev = randomBytes(24).toString("base64url"), sess = randomBytes(24).toString("base64url"), now = new Date();
db.insert(schema.trustedDevices).values({ id: sha(dev), createdAt: now, expiresAt: new Date(Date.now() + 600000) }).run();
db.insert(schema.sessions).values({ id: sha(sess), userId: user.id, createdAt: now, lastActiveAt: now, expiresAt: new Date(Date.now() + 600000), mfaVerifiedAt: now }).run();

(async () => {
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  const ctx = await browser.newContext({ viewport: device === "tablet" ? { width: 820, height: 1180 } : { width: 1366, height: 768 }, locale: "th-TH" });
  await ctx.addInitScript("addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');s.textContent='nextjs-portal{display:none!important}';document.head.appendChild(s)})");
  await ctx.addCookies([{ name: "rh_dev", value: dev, url: BASE }, { name: "rh_sess", value: sess, url: BASE }]);
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const res = await page.goto(BASE + (path.startsWith("/") ? path : `/${path}`), { waitUntil: "networkidle", timeout: 60000 });
  await page.waitForTimeout(300);
  // ปิดป๊อปอัปข้อความส่งเวร (ถ้ามี) เพื่อให้เห็นหน้าจริง
  await page.evaluate("document.querySelectorAll('[role=dialog]').forEach(function(d){d.remove()})").catch(() => {});
  await page.screenshot({ path: out, type: "jpeg", quality: 70, fullPage: true });
  const overflow = await page.evaluate("document.documentElement.scrollWidth > document.documentElement.clientWidth + 1");
  console.log(JSON.stringify({ url: page.url().replace(BASE, ""), status: res?.status(), user: `${user.firstName} (${role})`, overflow, errors: errors.slice(0, 5), out }));
  await browser.close();
  db.delete(schema.sessions).where(eq(schema.sessions.id, sha(sess))).run();
  db.delete(schema.trustedDevices).where(eq(schema.trustedDevices.id, sha(dev))).run();
})().catch((e) => { console.error(e); process.exit(1); });
