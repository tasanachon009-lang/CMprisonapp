/**
 * ถ่ายภาพหน้าจอทุกหน้า (คอมพิวเตอร์ + แท็บเล็ต) และตรวจข้อความล้น/ปุ่มเพี้ยน — เครื่องพัฒนาที่มีข้อมูลปลอมเท่านั้น
 *   1) npm run seed   2) เปิด dev server: npm run dev   3) npm run screenshots
 * ผล: docs/screenshots/{desktop,tablet}/*.jpg + docs/screenshots/README.md (รายการปัญหาที่พบ)
 * ใช้ playwright-core กับ Microsoft Edge/Chrome ที่ติดตั้งในเครื่อง (ไม่ดาวน์โหลดเบราว์เซอร์)
 * หมายเหตุ: ขั้นตอนนี้ทดสอบใส่รหัสผิดจนบัญชีทดสอบถูกล็อก — รัน npm run seed ใหม่หลังถ่ายเสร็จ
 */
import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright-core";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, desc, eq, inArray, lte } from "drizzle-orm";
import { openDatabase, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";

if (config.envLabel === "production") { console.error("❌ ห้ามรันบนเครื่องใช้จริง"); process.exit(1); }

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = "docs/screenshots";
// รหัสของข้อมูลปลอม (docs/TEST-ACCOUNTS.md)
const ORG_CODE = process.env.SEED_ORG_CODE ?? "demo-rehab-2569";
const USER_PASSWORD = process.env.SEED_PASSWORD ?? "rehab-2569";
const VIEWPORTS = { desktop: { width: 1366, height: 768 }, tablet: { width: 820, height: 1180 } } as const;
type Device = keyof typeof VIEWPORTS;
const MAX_HEIGHT = 2600;

const db = drizzle(openDatabase(config.dbPath), { schema }) as DB;
if (!db.select().from(schema.settings).where(eq(schema.settings.key, "app.isDemoData")).get()?.value) { console.error("❌ ฐานข้อมูลนี้ไม่ใช่ข้อมูลปลอม — หยุด"); process.exit(1); }
const sha = (s: string) => createHash("sha256").update(s).digest("hex");
const today = new Date().toISOString().slice(0, 10);

// ── เซสชันทดสอบรายบทบาท (แบบเดียวกับ security-check) ──
const deviceToken = randomBytes(24).toString("base64url");
db.insert(schema.trustedDevices).values({ id: sha(deviceToken), createdAt: new Date(), expiresAt: new Date(Date.now() + 3 * 3600000) }).run();
const sessionIds: string[] = [];
function userWithRole(role: string, exclude: string[] = []) {
  const ids = db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(eq(schema.userRoles.role, role)).all().map((r) => r.id);
  const ex = exclude.length ? db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(inArray(schema.userRoles.role, exclude)).all().map((r) => r.id) : [];
  const active = db.select().from(schema.users).where(eq(schema.users.status, "active")).all().filter((u) => !u.mustChangePassword).map((u) => u.id);
  const id = ids.find((i) => !ex.includes(i) && active.includes(i));
  if (!id) throw new Error(`ไม่พบผู้ใช้บทบาท ${role}`);
  return id;
}
function sessionToken(userId: number, locked = false) {
  const t = randomBytes(24).toString("base64url"), now = new Date();
  db.insert(schema.sessions).values({ id: sha(t), userId, createdAt: now, lastActiveAt: now, expiresAt: new Date(Date.now() + 3 * 3600000), lockedAt: locked ? now : null, mfaVerifiedAt: now }).run();
  sessionIds.push(sha(t));
  return t;
}
const cookiesFor = (sess?: string) => [
  { name: "rh_dev", value: deviceToken, url: BASE },
  ...(sess ? [{ name: "rh_sess", value: sess, url: BASE }] : []),
];

// ── เลือกข้อมูลตัวอย่างสำหรับหน้าที่ต้องมี id ──
const course = (code: string) => db.select().from(schema.courses).where(eq(schema.courses.code, code)).get()!;
const cohortOf = (code: string) => {
  const all = db.select().from(schema.cohorts).where(eq(schema.cohorts.courseId, course(code).id)).orderBy(desc(schema.cohorts.startDate)).all();
  return all.find((c) => c.startDate <= today && c.status !== "closed") ?? all.find((c) => c.startDate <= today) ?? all[0];
};
const b12 = cohortOf("B12"), pre3 = cohortOf("PRE3"), fast = cohortOf("FAST");
const enrOf = (cohortId: number) => db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, cohortId), inArray(schema.enrollments.status, ["active", "completed"]))).get();
const eB12 = enrOf(b12.id)!, ePre3 = enrOf(pre3.id);
const personId = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, eB12.incarcerationId)).get()!.personId;
const sess = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, b12.id), lte(schema.cohortSessions.date, today))).orderBy(desc(schema.cohortSessions.date)).get();
const instructor = db.select().from(schema.instructors).get();
const batch = db.select().from(schema.payBatches).where(eq(schema.payBatches.status, "approved")).get() ?? db.select().from(schema.payBatches).get();
const doc = db.select().from(schema.documents).get();
const weekly = db.select().from(schema.weeklyReports).orderBy(desc(schema.weeklyReports.weekStart)).get();
const someUser = userWithRole("rehab", ["admin"]);
const referral = db.select().from(schema.healthReferrals).where(eq(schema.healthReferrals.needsReferral, true)).get();
/** ผู้ช่วยที่ได้รับมอบหมายรายรุ่น (มีเมนู "งานที่ได้รับมอบหมาย") */
const assignedUser = db.select({ id: schema.permissionGrants.userId }).from(schema.permissionGrants).all().map((g) => g.id).find((id) => db.select().from(schema.userRoles).where(and(eq(schema.userRoles.userId, id), eq(schema.userRoles.role, "assistant"))).get());

type Shot = { name: string; url: string };
const APP: Shot[] = [
  { name: "home-admin", url: "/" },
  { name: "courses", url: "/courses" },
  { name: "course-b12", url: "/courses/B12" },
  { name: "cohort-new", url: "/cohorts/new?course=B12" },
  { name: "cohort-overview-b12", url: `/cohorts/${b12.id}` },
  { name: "cohort-roster", url: `/cohorts/${b12.id}/roster` },
  { name: "cohort-attendance", url: `/cohorts/${b12.id}/attendance` },
  { name: "cohort-attendance-quick", url: `/cohorts/${b12.id}/attendance/quick` },
  { name: "cohort-schedule-days", url: `/cohorts/${b12.id}/schedule` },
  { name: "cohort-schedule-week", url: `/cohorts/${b12.id}/schedule?view=week` },
  { name: "cohort-assessments", url: `/cohorts/${b12.id}/assessments` },
  { name: "cohort-assessments-quick", url: `/cohorts/${b12.id}/assessments/quick?form=KNOW&round=pre` },
  { name: "cohort-health", url: `/cohorts/${b12.id}/health` },
  { name: "cohort-budget", url: `/cohorts/${b12.id}/budget` },
  { name: "cohort-report", url: `/cohorts/${b12.id}/report` },
  { name: "cohort-overview-pre3", url: `/cohorts/${pre3.id}` },
  { name: "cohort-pre3-candidates", url: `/cohorts/${pre3.id}/candidates` },
  { name: "cohort-pre3-assessments", url: `/cohorts/${pre3.id}/assessments` },
  { name: "cohort-pre3-assessments-quick", url: `/cohorts/${pre3.id}/assessments/quick?form=ROSE3&round=pre` },
  { name: "cohort-pre3-health", url: `/cohorts/${pre3.id}/health` },
  { name: "cohort-pre3-documents", url: `/cohorts/${pre3.id}/documents` },
  ...(fast ? [{ name: "cohort-overview-fast", url: `/cohorts/${fast.id}` }] : []),
  { name: "register-choose", url: "/register" },
  { name: "register-wizard", url: `/register?cohort=${b12.id}` },
  { name: "import", url: "/import" },
  { name: "enrollment", url: `/enrollments/${eB12.id}` },
  { name: "enrollment-assess-know", url: `/enrollments/${eB12.id}/assess/KNOW?round=pre` },
  { name: "enrollment-assess-dep", url: `/enrollments/${eB12.id}/assess/DEP?round=pre` },
  ...(ePre3 ? [{ name: "enrollment-pre3", url: `/enrollments/${ePre3.id}` }, { name: "enrollment-pre3-assess-rose3", url: `/enrollments/${ePre3.id}/assess/ROSE3?round=pre` }, { name: "enrollment-pre3-referral", url: `/enrollments/${referral?.enrollmentId ?? ePre3.id}/referral` }] : []),
  { name: "persons-search", url: "/persons" },
  { name: "persons-search-results", url: `/persons?q=${encodeURIComponent("สม")}` },
  { name: "person", url: `/persons/${personId}` },
  ...(sess ? [{ name: "session", url: `/sessions/${sess.id}` }] : []),
  { name: "calendar", url: "/calendar" },
  { name: "release", url: "/release" },
  { name: "bst", url: "/bst" },
  { name: "rt101", url: "/rt101" },
  { name: "inbox", url: "/inbox" },
  { name: "incomplete", url: "/incomplete" },
  { name: "notifications", url: "/notifications" },
  { name: "roster-daily", url: "/roster" },
  { name: "instructors", url: "/instructors" },
  { name: "instructor-new", url: "/instructors/new" },
  ...(instructor ? [{ name: "instructor", url: `/instructors/${instructor.id}` }] : []),
  { name: "pay", url: "/pay" },
  { name: "pay-batches", url: "/pay?tab=batches" },
  ...(batch ? [{ name: "pay-batch", url: `/pay/batches/${batch.id}` }] : []),
  { name: "budget", url: "/budget" },
  { name: "reports-weekly", url: "/reports/weekly" },
  ...(weekly ? [{ name: "reports-weekly-one", url: `/reports/weekly/${weekly.id}` }] : []),
  ...(doc ? [{ name: "document", url: `/documents/${doc.id}` }] : []),
  { name: "admin", url: "/admin" },
  { name: "admin-users", url: "/admin/users" },
  { name: "admin-user", url: `/admin/users/${someUser}` },
  { name: "admin-approvals", url: "/admin/approvals" },
  { name: "admin-audit", url: "/admin/audit" },
  { name: "admin-backup", url: "/admin/backup" },
  { name: "admin-consent", url: "/admin/consent" },
  { name: "admin-delegations", url: "/admin/delegations" },
  { name: "admin-doc-templates", url: "/admin/doc-templates" },
  { name: "admin-forms", url: "/admin/forms" },
  { name: "admin-line", url: "/admin/line" },
  { name: "admin-print-offsets", url: "/admin/print-offsets" },
  { name: "admin-rates", url: "/admin/rates" },
  { name: "admin-settings", url: "/admin/settings" },
  { name: "admin-topics", url: "/admin/topics" },
];
/** หน้าแรก/หน้าที่ต่างกันตามบทบาท */
const ROLE_PAGES: Array<{ role: string; exclude?: string[]; userId?: number; shots: Shot[] }> = [
  { role: "rehab", exclude: ["admin"], shots: [{ name: "home-rehab", url: "/" }] },
  { role: "assistant", userId: assignedUser, shots: [{ name: "home-assistant", url: "/" }, { name: "assigned", url: "/assigned" }, { name: "forbidden", url: "/admin" }] },
  { role: "finance", shots: [{ name: "home-finance", url: "/" }] },
  { role: "executive", shots: [{ name: "home-executive", url: "/" }] },
];
const PRINT: Shot[] = [
  { name: "print-cohort", url: `/print/cohort/${b12.id}` },
  { name: "print-sign-sheet", url: `/print/sign-sheet/${b12.id}` },
  { name: "print-consent", url: `/print/consent/${b12.id}` },
  { name: "print-blank-forms", url: `/print/blank-forms/${b12.id}?form=KNOW&round=pre` },
  { name: "print-certificates", url: `/print/certificates/${b12.id}` },
  { name: "print-person", url: `/print/person/${personId}` },
  { name: "print-roster", url: "/print/roster" },
  { name: "print-calendar", url: "/print/calendar" },
  { name: "print-my-schedule", url: "/print/my-schedule" },
  { name: "print-emergency", url: "/print/emergency" },
  { name: "print-bst", url: "/print/bst?s=bst&f=all" },
  { name: "print-instructor-form", url: instructor ? `/print/instructor-form?id=${instructor.id}` : "/print/instructor-form" },
  { name: "print-referral-list", url: `/print/referral-list/${pre3.id}` },
  ...(referral ? [{ name: "print-referral", url: `/print/referral/${referral.enrollmentId}` }] : []),
  ...(sess ? [{ name: "print-session-sheet", url: `/print/session-sheet/${sess.id}` }, { name: "print-speaker-note", url: `/print/speaker-note/${sess.id}` }, { name: "print-session-report", url: `/print/session-report?session=${sess.id}` }] : []),
  ...(batch ? [{ name: "print-pay-bundle", url: `/print/pay-bundle/${batch.id}` }] : []),
  ...(doc ? [{ name: "print-document", url: `/print/document/${doc.id}` }] : []),
  ...(weekly ? [{ name: "print-weekly-report", url: `/print/weekly-report/${weekly.id}` }] : []),
];

// ── ตรวจหน้าจอ ──
type Issue = { device: Device; name: string; kind: string; detail: string };
const issues: Issue[] = [];
const shotsDone: Array<{ device: Device; name: string; url: string; status: number | null }> = [];

/** รันในหน้าเว็บ (เป็นสตริง — ไม่ผ่านตัวแปลง TypeScript) */
const AUDIT_JS = `(() => {
  var out = [];
  var vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) out.push({ kind: "หน้ากว้างเกินจอ", detail: "กว้าง " + document.documentElement.scrollWidth + "px (จอ " + vw + "px)" });
  function text(el) { return (el.textContent || "").trim().slice(0, 50); }
  function scrolls(el) { for (var p = el; p && p !== document.body; p = p.parentElement) { var o = getComputedStyle(p).overflowX; if (o === "auto" || o === "scroll") return true; } return false; }
  var els = Array.from(document.querySelectorAll("button, a[class*='btn'], [class*='tag'], label, th, h1, h2, h3"));
  for (var i = 0; i < els.length; i++) {
    var el = els[i], r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    var cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") continue;
    var tag = "<" + el.tagName.toLowerCase() + '> "' + text(el) + '"';
    if (el.scrollWidth > el.clientWidth + 2 && cs.overflowX !== "visible" && cs.textOverflow !== "ellipsis" && cs.overflowX !== "auto") out.push({ kind: "ข้อความล้นกรอบ", detail: tag });
    if ((r.right > vw + 2 || r.left < -2) && !scrolls(el)) out.push({ kind: "เลยขอบจอ", detail: tag + " (ขวา " + Math.round(r.right) + "px / จอ " + vw + "px)" });
    var cls = typeof el.className === "string" ? el.className : "";
    if ((el.tagName === "BUTTON" || /btn/.test(cls)) && r.height < 43 && !/btn-sm/.test(cls) && text(el).length > 0) out.push({ kind: "ปุ่มเตี้ยกว่า 44px", detail: '"' + text(el) + '" สูง ' + Math.round(r.height) + "px" });
  }
  return out;
})()`;

async function audit(page: Page, device: Device, name: string) {
  const found = (await page.evaluate(AUDIT_JS)) as Array<{ kind: string; detail: string }>;
  const seen = new Set<string>();
  for (const f of found) { const k = f.kind + f.detail; if (seen.has(k)) continue; seen.add(k); issues.push({ device, name, ...f }); }
}

async function shoot(page: Page, device: Device, name: string, opts: { audit?: boolean } = {}) {
  await page.evaluate("document.fonts && document.fonts.ready").catch(() => {});
  await page.waitForTimeout(250);
  if (opts.audit !== false) await audit(page, device, name);
  const file = path.join(OUT, device, `${name}.jpg`);
  const h = (await page.evaluate("document.documentElement.scrollHeight")) as number;
  const vp = VIEWPORTS[device];
  if (h > MAX_HEIGHT) await page.screenshot({ path: file, type: "jpeg", quality: 55, clip: { x: 0, y: 0, width: vp.width, height: MAX_HEIGHT }, fullPage: true });
  else await page.screenshot({ path: file, type: "jpeg", quality: 55, fullPage: true });
}

async function visit(ctx: BrowserContext, device: Device, s: Shot, opts: { audit?: boolean } = {}) {
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let status: number | null = null;
  try {
    const res = await page.goto(BASE + s.url, { waitUntil: "networkidle", timeout: 60000 });
    status = res?.status() ?? null;
    await shoot(page, device, s.name, opts);
    if (status && status >= 400) issues.push({ device, name: s.name, kind: "HTTP ผิดพลาด", detail: `${status} ${s.url}` });
    if (errors.length) issues.push({ device, name: s.name, kind: "ข้อผิดพลาดบนหน้า", detail: errors[0].slice(0, 160) });
    if (!page.url().startsWith(BASE + s.url.split("?")[0]) && !s.name.startsWith("forbidden")) issues.push({ device, name: s.name, kind: "ถูกพาไปหน้าอื่น", detail: `${s.url} → ${page.url().replace(BASE, "")}` });
  } catch (e) {
    issues.push({ device, name: s.name, kind: "เปิดหน้าไม่ได้", detail: String(e).slice(0, 160) });
  }
  shotsDone.push({ device, name: s.name, url: s.url, status });
  await page.close();
}

/** บริบทเบราว์เซอร์ตามขนาดจอ — ซ่อนป้ายเครื่องมือนักพัฒนาของ Next.js ไม่ให้ติดในภาพ */
async function newCtx(browser: Browser, device: Device) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[device], locale: "th-TH" });
  await ctx.addInitScript("addEventListener('DOMContentLoaded',function(){var s=document.createElement('style');s.textContent='nextjs-portal{display:none!important}';document.head.appendChild(s)})");
  return ctx;
}

/** หน้าเข้าระบบทั้งชุด รวมข้อความผิดพลาด (ใช้บัญชีทดสอบ "ทดลอง เข้าครั้งแรก") */
async function authFlow(browser: Browser, device: Device) {
  const trial = db.select().from(schema.users).where(eq(schema.users.mustChangePassword, true)).get() ?? db.select().from(schema.users).where(eq(schema.users.id, someUser)).get()!;
  db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, trial.id)).run();
  const ctx = await newCtx(browser, device);
  const page = await ctx.newPage();
  const done = (name: string) => { shotsDone.push({ device, name, url: page.url().replace(BASE, ""), status: 200 }); return shoot(page, device, name); };
  await page.goto(BASE + "/device", { waitUntil: "networkidle" });
  await done("auth-1-org-code");
  await page.fill("#code", "wrong-code");
  await page.click("button:has-text('ถัดไป')");
  await page.waitForSelector("[role=alert]");
  await done("auth-2-org-code-wrong");
  await page.fill("#code", ORG_CODE);
  await page.click("button:has-text('ถัดไป')");
  await page.waitForURL("**/login");
  await page.waitForLoadState("networkidle");
  await done("auth-3-choose-user");
  await page.goto(`${BASE}/login/${trial.id}`, { waitUntil: "networkidle" });
  await done("auth-4-password");
  await page.fill("#password", "wrong-password-1");
  await page.click("button:has-text('เข้าสู่ระบบ')");
  await page.waitForSelector("[role=alert]");
  await done("auth-5-password-wrong");
  if (trial.mustChangePassword) {
    await page.fill("#password", USER_PASSWORD);
    await page.click("button:has-text('เข้าสู่ระบบ')");
    await page.waitForURL("**/change-password", { timeout: 15000 }).catch(() => {});
    await page.waitForLoadState("networkidle");
    await done("auth-6-change-password");
    await ctx.clearCookies({ name: "rh_sess" });
    await page.goto(`${BASE}/login/${trial.id}`, { waitUntil: "networkidle" });
  }
  // ใส่ผิดจนบัญชีถูกระงับชั่วคราว
  for (let i = 0; i < 6; i++) {
    await page.fill("#password", `wrong-password-${i}`);
    await page.click("button:has-text('เข้าสู่ระบบ')");
    await page.waitForTimeout(900);
    if ((await page.locator("[role=alert]").textContent().catch(() => ""))?.includes("ระงับ")) break;
  }
  await done("auth-7-account-locked");
  db.update(schema.users).set({ failedAttempts: 0, lockedUntil: null }).where(eq(schema.users.id, trial.id)).run();
  await ctx.close();
  // หน้าจอถูกล็อก
  const lockCtx = await newCtx(browser, device);
  await lockCtx.addCookies(cookiesFor(sessionToken(someUser, true)));
  await visit(lockCtx, device, { name: "auth-8-screen-locked", url: "/lock" });
  await lockCtx.close();
}

async function main() {
  for (const d of Object.keys(VIEWPORTS) as Device[]) { fs.rmSync(path.join(OUT, d), { recursive: true, force: true }); fs.mkdirSync(path.join(OUT, d), { recursive: true }); }
  const browser = await chromium.launch({ channel: process.env.PW_CHANNEL ?? "msedge" });
  const admin = userWithRole("admin");
  for (const device of Object.keys(VIEWPORTS) as Device[]) {
    console.log(`── ${device} ──`);
    await authFlow(browser, device);
    const ctx = await newCtx(browser, device);
    await ctx.addCookies(cookiesFor(sessionToken(admin)));
    for (const s of APP) { await visit(ctx, device, s); process.stdout.write("."); }
    // ปุ่ม (?) เปิดแล้วไม่ล้นจอ
    { const page = await ctx.newPage(); await page.goto(BASE + "/pay", { waitUntil: "networkidle" }); await page.click("button[aria-label='วิธีใช้']"); await shoot(page, device, "help-popover-open"); shotsDone.push({ device, name: "help-popover-open", url: "/pay", status: 200 }); await page.close(); }
    if (device === "desktop") for (const s of PRINT) { await visit(ctx, device, s, { audit: false }); process.stdout.write("p"); }
    await ctx.close();
    for (const r of ROLE_PAGES) {
      const c = await newCtx(browser, device);
      await c.addCookies(cookiesFor(sessionToken(r.userId ?? userWithRole(r.role, r.exclude))));
      for (const s of r.shots) await visit(c, device, s);
      await c.close();
    }
    console.log("");
  }
  await browser.close();
  db.delete(schema.sessions).where(inArray(schema.sessions.id, sessionIds)).run();
  db.delete(schema.trustedDevices).where(eq(schema.trustedDevices.id, sha(deviceToken))).run();

  const byPage = new Map<string, Issue[]>();
  for (const i of issues) byPage.set(`${i.device}/${i.name}`, [...(byPage.get(`${i.device}/${i.name}`) ?? []), i]);
  const names = Array.from(new Set(shotsDone.map((s) => s.name)));
  const md = [
    "# ภาพหน้าจอทุกหน้า (ข้อมูลปลอมจาก `npm run seed`)",
    "",
    `ถ่ายด้วย \`npm run screenshots\` · คอมพิวเตอร์ ${VIEWPORTS.desktop.width}×${VIEWPORTS.desktop.height} · แท็บเล็ต ${VIEWPORTS.tablet.width}×${VIEWPORTS.tablet.height} (แนวตั้ง) · หน้าที่ยาวเกิน ${MAX_HEIGHT}px ตัดที่ ${MAX_HEIGHT}px · หน้าพิมพ์ถ่ายเฉพาะขนาดคอมพิวเตอร์ · แถบที่ตรึงขอบล่างจอ (เช่น แถบบันทึก) จะปรากฏกลางภาพในหน้าที่ยาว`,
    "",
    `รวม ${shotsDone.length} ภาพ · ปัญหาที่ตรวจพบอัตโนมัติ ${issues.length} รายการ`,
    "",
    "## ปัญหาที่ตรวจพบอัตโนมัติ (หน้ากว้างเกินจอ · ข้อความล้นกรอบ · เลยขอบจอ · ปุ่มเตี้ยกว่า 44px · HTTP/สคริปต์ผิดพลาด)",
    "",
    ...(issues.length ? Array.from(byPage.entries()).flatMap(([k, list]) => [`- **${k}**`, ...list.map((i) => `  - ${i.kind}: ${i.detail}`)]) : ["ไม่พบ"]),
    "",
    "## รายการภาพ",
    "",
    "| หน้า | ที่อยู่ | คอมพิวเตอร์ | แท็บเล็ต |",
    "|---|---|---|---|",
    ...names.map((n) => { const d = shotsDone.find((s) => s.name === n && s.device === "desktop"), t = shotsDone.find((s) => s.name === n && s.device === "tablet"); return `| ${n} | \`${(d ?? t)!.url}\` | ${d ? `[ภาพ](desktop/${n}.jpg)` : "-"} | ${t ? `[ภาพ](tablet/${n}.jpg)` : "-"} |`; }),
    "",
  ].join("\n");
  fs.writeFileSync(path.join(OUT, "README.md"), md);
  console.log(`เสร็จ: ${shotsDone.length} ภาพ · ปัญหา ${issues.length} รายการ → ${OUT}/README.md`);
}
main().catch((e) => { console.error(e); process.exit(1); });
