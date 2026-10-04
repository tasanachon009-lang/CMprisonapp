/**
 * ตรวจความปลอดภัยอัตโนมัติ (สเปก 2.6) — ใช้กับเครื่องพัฒนา/สภาพแวดล้อมทดสอบที่มีข้อมูลปลอมเท่านั้น
 *   1) เปิด dev server:  npm run dev
 *   2) รัน:            npm run security-check
 * ผล: แสดงบนจอ + เขียน docs/security-report.md
 */
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import { openDatabase, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";

if (config.envLabel === "production") {
  console.error("❌ ห้ามรันบนเครื่องใช้จริง");
  process.exit(1);
}

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const sqlite = openDatabase(config.dbPath);
const db = drizzle(sqlite, { schema }) as DB;
const sha = (s: string) => createHash("sha256").update(s).digest("hex");

// ── เตรียม cookie ทดสอบ (เครื่อง + เซสชันรายบทบาท) ──
const deviceToken = randomBytes(24).toString("base64url");
db.insert(schema.trustedDevices).values({ id: sha(deviceToken), createdAt: new Date(), expiresAt: new Date(Date.now() + 3600000) }).run();

function userWithRole(role: string, excludeRoles: string[] = []) {
  const ids = db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(eq(schema.userRoles.role, role)).all().map((r) => r.id);
  const excl = excludeRoles.length ? db.select({ id: schema.userRoles.userId }).from(schema.userRoles).where(inArray(schema.userRoles.role, excludeRoles)).all().map((r) => r.id) : [];
  const id = ids.find((i) => !excl.includes(i));
  if (!id) throw new Error(`ไม่พบผู้ใช้บทบาท ${role} ในข้อมูลปลอม`);
  db.update(schema.users).set({ status: "active", mustChangePassword: false }).where(eq(schema.users.id, id)).run();
  return id;
}
const tokens: string[] = [];
function sessionFor(userId: number, locked = false, mfa = true) {
  const t = randomBytes(24).toString("base64url");
  const now = new Date();
  db.insert(schema.sessions).values({ id: sha(t), userId, createdAt: now, lastActiveAt: now, expiresAt: new Date(Date.now() + 3600000), lockedAt: locked ? now : null, mfaVerifiedAt: mfa ? now : null }).run();
  tokens.push(sha(t));
  return `rh_dev=${deviceToken}; rh_sess=${t}`;
}

const U = {
  admin: userWithRole("admin"),
  rehab: userWithRole("rehab", ["admin"]),
  assistant: userWithRole("assistant"),
  finance: userWithRole("finance"),
  executive: userWithRole("executive"),
  warden: userWithRole("warden"),
};
const C = Object.fromEntries(Object.entries(U).map(([k, v]) => [k, sessionFor(v)])) as Record<keyof typeof U, string>;
const lockedCookie = sessionFor(U.rehab, true);
const adminNoMfa = sessionFor(U.admin, false, false);
// ไม่ให้ป๊อปอัปจดหมายเวรรบกวนการตรวจ: รับทราบข้อความทั้งหมดแทนผู้ใช้ทดสอบ (ข้อมูลปลอม)
for (const m of db.select().from(schema.shiftMessages).all()) for (const uid of Object.values(U)) db.insert(schema.shiftMessageAcks).values({ messageId: m.id, userId: uid, ackAt: new Date() }).onConflictDoNothing().run();
const enrollment = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, db.select().from(schema.cohorts).where(eq(schema.cohorts.status, "active")).get()!.id)).get()!;

// ข้อมูลอ้างอิงในฐานปลอม
const cohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.status, "active")).get()!;
const person = db.select().from(schema.persons).get()!;
const inc = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.personId, person.id)).get()!;
const assistantSessions = db.select({ id: schema.sessionStaff.sessionId }).from(schema.sessionStaff).where(eq(schema.sessionStaff.userId, U.assistant)).all().map((r) => r.id);
const notMine = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohort.id), assistantSessions.length ? notInArray(schema.cohortSessions.id, assistantSessions) : undefined)).get()!;

// XSS: บุคคลปลอมชื่อเป็นโค้ด
const xssName = `<img src=x onerror=alert(1)>`;
const xssPerson = db.insert(schema.persons).values({ firstName: xssName, lastName: "<script>alert(2)</script>", searchKey: "xsstest" }).returning().get();

type Result = { group: string; name: string; ok: boolean; detail: string };
const results: Result[] = [];
const check = (group: string, name: string, ok: boolean, detail: string) => results.push({ group, name, ok, detail });

async function get(path: string, cookie?: string) {
  const r = await fetch(BASE + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  return { status: r.status, location: r.headers.get("location") ?? "", headers: r.headers, text: r.status === 200 ? await r.text() : "" };
}
const isRedirectTo = (r: { status: number; location: string }, p: string) => [303, 307, 308].includes(r.status) && r.location.includes(p);
// หน้าที่ไม่มีสิทธิ์: redirect ไป /forbidden (ใน dev อาจ render ด้วย status 200 + เนื้อหา forbidden ผ่าน RSC redirect)
const denied = (r: { status: number; location: string; text: string }) => isRedirectTo(r, "/forbidden") || r.text.includes("ไม่มีสิทธิ์เข้าหน้านี้");
const allowed = (r: { status: number; text: string }) => r.status === 200 && !r.text.includes("ไม่มีสิทธิ์เข้าหน้านี้");

async function main() {
  const pages = ["/", "/courses", `/cohorts/${cohort.id}`, `/cohorts/${cohort.id}/roster`, `/persons/${person.id}`, "/persons?q=สม", "/release", "/import", `/register?cohort=${cohort.id}`, "/admin", "/admin/users", "/admin/audit", "/admin/backup", "/admin/settings", `/sessions/${notMine.id}`, `/print/sign-sheet/${cohort.id}`, "/roster", "/notifications"];

  // 1) ไม่ล็อกอิน
  for (const p of pages) {
    const r = await get(p);
    check("1. เข้าหน้าโดยไม่ล็อกอิน", p, isRedirectTo(r, "/device"), `HTTP ${r.status} → ${r.location || "(ไม่ redirect)"}`);
  }
  for (const p of [`/api/files/photo/${inc.id}`, "/api/import/template"]) {
    const r = await get(p);
    check("1. เข้าหน้าโดยไม่ล็อกอิน", p, r.status === 401, `HTTP ${r.status}`);
  }
  const dev = await get("/", `rh_dev=${deviceToken}`);
  check("1. เข้าหน้าโดยไม่ล็อกอิน", "มีรหัสหน่วยงานแต่ยังไม่เลือกผู้ใช้", isRedirectTo(dev, "/login"), `→ ${dev.location}`);
  const forged = await get("/", `rh_dev=${deviceToken}; rh_sess=forged-token`);
  check("1. เข้าหน้าโดยไม่ล็อกอิน", "cookie เซสชันปลอม", isRedirectTo(forged, "/login"), `→ ${forged.location}`);
  const lockedR = await get("/courses", lockedCookie);
  check("1. เข้าหน้าโดยไม่ล็อกอิน", "หน้าจอถูกล็อกแล้วเปิด URL ตรง", isRedirectTo(lockedR, "/lock"), `→ ${lockedR.location}`);

  // 2) สิทธิ์ตามบทบาท (ลองเปลี่ยน URL/ID ตรงๆ)
  const matrix: Array<[string, Partial<Record<keyof typeof U, boolean>>]> = [
    ["/admin/users", { admin: true, rehab: false, assistant: false, finance: false, executive: false, warden: false }],
    ["/admin/audit", { admin: true, rehab: false, executive: false }],
    ["/admin/backup", { admin: true, rehab: false, finance: false }],
    ["/admin/settings", { admin: true, rehab: false }],
    [`/persons/${person.id}`, { admin: true, rehab: true, executive: true, assistant: false, finance: false, warden: false }],
    [`/cohorts/${cohort.id}/roster`, { rehab: true, assistant: false, warden: false }],
    [`/register?cohort=${cohort.id}`, { rehab: true, executive: false, finance: false, assistant: false }],
    ["/import", { rehab: true, executive: false, assistant: false }],
    ["/release", { rehab: true, executive: true, assistant: false, warden: false }],
    [`/sessions/${notMine.id}`, { rehab: true, assistant: false, warden: false }],
    [`/print/session-sheet/${notMine.id}`, { rehab: true, assistant: false, warden: false }],
    ["/roster", { warden: true, rehab: true, finance: false, assistant: false }],
    // ขั้นที่ 2
    [`/enrollments/${enrollment.id}`, { rehab: true, executive: true, assistant: false, warden: false }],
    [`/enrollments/${enrollment.id}/assess/DEP?round=pre`, { rehab: true, admin: true, executive: false, finance: false, assistant: false }],
    [`/enrollments/${enrollment.id}/assess/KNOW?round=pre`, { rehab: true, executive: false, assistant: false }],
    [`/cohorts/${cohort.id}/health`, { rehab: true, executive: true, finance: false, assistant: false }],
    ["/bst", { rehab: true, executive: true, finance: false, assistant: false, warden: false }],
    ["/inbox", { rehab: true, assistant: true, finance: true, warden: false }],
    ["/admin/forms", { admin: true, rehab: false, executive: false }],
    ["/incomplete", { rehab: true, assistant: false, warden: false }],
    [`/print/person/${person.id}`, { rehab: true, executive: false, assistant: false }],
    ["/print/emergency", { rehab: true, executive: false, assistant: false }],
  ];
  for (const [p, exp] of matrix) {
    for (const [role, should] of Object.entries(exp)) {
      const r = await get(p, C[role as keyof typeof U]);
      const ok = should ? allowed(r) : denied(r);
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", `${role} → ${p}`, ok, `คาดว่า${should ? "เข้าได้" : "ถูกปฏิเสธ"} · HTTP ${r.status}${r.location ? ` → ${r.location}` : ""}`);
    }
  }
  // ผู้ช่วย/การเงิน/ผู้คุม ห้ามเห็นเลขบัตรหรือหน้าบุคคล; ผู้คุมดูรูปได้ (สำหรับนับยอด)
  const photoWarden = await get(`/api/files/photo/${inc.id}`, C.warden);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้คุม (ดูอย่างเดียว) เปิดรูปได้แต่ไม่เห็นหน้าบุคคล", photoWarden.status === 200 || photoWarden.status === 404, `รูป HTTP ${photoWarden.status}`);
  const tmpl = await get("/api/import/template", C.finance);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "การเงิน → ดาวน์โหลดแม่แบบนำเข้า", tmpl.status === 403, `HTTP ${tmpl.status}`);

  // ผู้ดูแลที่ยังไม่ยืนยัน OTP → เข้าไม่ได้
  const noMfa = await get("/admin/users", adminNoMfa);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้ดูแลที่ยังไม่ยืนยัน OTP → ถูกพาไปหน้า OTP", isRedirectTo(noMfa, "/otp"), `→ ${noMfa.location}`);
  // ผู้บริหารเห็นแท็บสถานพยาบาลแบบไม่ระบุชื่อเท่านั้น
  const execHealth = await get(`/cohorts/${cohort.id}/health`, C.executive);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้บริหาร → แท็บสถานพยาบาล ไม่มีรายชื่อผู้มีผลเสี่ยง", execHealth.status === 200 && !execHealth.text.includes("ผู้มีผลคัดกรองเสี่ยง"), `HTTP ${execHealth.status}`);
  const exp = await get(`/api/export/cohort/${cohort.id}`, C.executive);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้บริหาร → ส่งออก Excel ที่มีชื่อ", exp.status === 403, `HTTP ${exp.status}`);

  // 3) CSRF
  const csrf = await fetch(`${BASE}/api/photos/${inc.id}`, { method: "POST", headers: { cookie: C.admin }, body: new FormData() });
  check("3. CSRF", "POST อัปโหลดรูปโดยไม่มี Origin", csrf.status === 403, `HTTP ${csrf.status}`);
  const csrf2 = await fetch(`${BASE}/api/photos/${inc.id}`, { method: "POST", headers: { cookie: C.admin, origin: "http://evil.example" }, body: new FormData() });
  check("3. CSRF", "POST จากเว็บอื่น (Origin ต่างโดเมน)", csrf2.status === 403, `HTTP ${csrf2.status}`);
  check("3. CSRF", "cookie ตั้ง SameSite=Strict + HttpOnly", fs.readFileSync("src/lib/auth/session.ts", "utf8").match(/sameSite: "strict"/g)?.length === 2, "ตรวจจากโค้ด (Server Action ของ Next ตรวจ Origin ให้อีกชั้น)");

  // 4) SQL injection
  for (const q of ["' OR 1=1 --", "%' UNION SELECT password_hash FROM users --", "\"; DROP TABLE persons; --"]) {
    const r = await get(`/persons?q=${encodeURIComponent(q)}`, C.admin);
    check("4. SQL injection", q, r.status === 200 && !r.text.includes("$argon2") && r.text.includes("ไม่พบ"), `HTTP ${r.status}`);
  }
  check("4. SQL injection", "ตาราง persons ยังอยู่", !!db.select().from(schema.persons).get(), "");

  // 5) XSS
  const x = await get(`/persons/${xssPerson.id}`, C.admin);
  check("5. XSS", "ชื่อที่เป็นโค้ด HTML ถูก escape", x.status === 200 && !x.text.includes(xssName) && x.text.includes("&lt;img"), `HTTP ${x.status}`);
  check("5. XSS", "Content-Security-Policy", (x.headers.get("content-security-policy") ?? "").includes("default-src 'self'"), x.headers.get("content-security-policy")?.slice(0, 60) ?? "-");
  check("5. XSS", "X-Frame-Options / nosniff", x.headers.get("x-frame-options") === "DENY" && x.headers.get("x-content-type-options") === "nosniff", "");
  const cc = x.headers.get("cache-control") ?? "";
  // dev server ของ Next บังคับ "no-cache" เอง — production build ต้องเป็น no-store
  const devServer = !process.env.BASE_URL?.startsWith("https");
  check("5. XSS", "ห้ามแคชหน้าข้อมูลบุคคล", cc.includes("no-store") || (devServer && cc.includes("no-cache")), `${cc}${devServer && !cc.includes("no-store") ? " (dev server — ตรวจซ้ำบน production)" : ""}`);

  // 6) Audit log แก้/ลบไม่ได้
  let blocked = false;
  try { sqlite.prepare("DELETE FROM audit_logs WHERE id = (SELECT min(id) FROM audit_logs)").run(); } catch { blocked = true; }
  check("6. ประวัติการใช้งาน", "ลบ audit log ตรงจากฐานข้อมูล", blocked, blocked ? "ถูกปฏิเสธโดย trigger" : "ลบได้!");

  // ── เก็บกวาด ──
  db.delete(schema.persons).where(eq(schema.persons.id, xssPerson.id)).run();
  db.delete(schema.sessions).where(inArray(schema.sessions.id, tokens)).run();
  db.delete(schema.trustedDevices).where(eq(schema.trustedDevices.id, sha(deviceToken))).run();
  db.update(schema.users).set({ status: "suspended" }).where(eq(schema.users.id, U.warden)).run();

  // ── รายงาน ──
  const pass = results.filter((r) => r.ok).length;
  const lines = [`# รายงานผลตรวจความปลอดภัยอัตโนมัติ`, ``, `- วันเวลา: ${new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`, `- เป้าหมาย: ${BASE} (ข้อมูลปลอม)`, `- ผล: **ผ่าน ${pass}/${results.length} ข้อ**`, ``];
  for (const g of Array.from(new Set(results.map((r) => r.group)))) {
    lines.push(`## ${g}`, "", "| ผล | รายการ | รายละเอียด |", "|---|---|---|");
    for (const r of results.filter((x) => x.group === g)) lines.push(`| ${r.ok ? "✅ ผ่าน" : "❌ ไม่ผ่าน"} | ${r.name.replace(/\|/g, "\\|")} | ${r.detail.replace(/\|/g, "\\|")} |`);
    lines.push("");
  }
  fs.mkdirSync("docs", { recursive: true });
  fs.writeFileSync("docs/security-report.md", lines.join("\n"));
  for (const r of results.filter((x) => !x.ok)) console.log(`❌ [${r.group}] ${r.name} — ${r.detail}`);
  console.log(`\nผ่าน ${pass}/${results.length} ข้อ — รายงานเต็มที่ docs/security-report.md`);
  sqlite.close();
  process.exit(pass === results.length ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
