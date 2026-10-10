/**
 * ตรวจความปลอดภัยอัตโนมัติ (สเปก 2.6) — ใช้กับเครื่องพัฒนา/สภาพแวดล้อมทดสอบที่มีข้อมูลปลอมเท่านั้น
 *   1) เปิด dev server:  npm run dev
 *   2) รัน:            npm run security-check
 * ผล: แสดงบนจอ + เขียน docs/security-report.md
 */
import fs from "node:fs";
import { createHash, randomBytes } from "node:crypto";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { and, eq, inArray, ne, notInArray, sql } from "drizzle-orm";
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
// กลุ่ม B ที่ได้รับมอบหมายรายรุ่น (ญาติ/ติดตาม) — ผู้ใช้ชั่วคราว ลบทิ้งตอนจบ
const scopedCohort = db.select().from(schema.cohorts).where(eq(schema.cohorts.status, "active")).get()!;
const scopedUser = (() => {
  const old = db.select().from(schema.users).where(and(eq(schema.users.firstName, "ทดสอบสิทธิ์"), eq(schema.users.lastName, "รายรุ่น"))).get();
  if (old) {
    db.update(schema.users).set({ status: "active", deletedAt: null, mustChangePassword: false }).where(eq(schema.users.id, old.id)).run();
    return old.id;
  }
  return db.insert(schema.users).values({ firstName: "ทดสอบสิทธิ์", lastName: "รายรุ่น", passwordHash: "x", profession: "social_worker", mustChangePassword: false }).returning().get().id;
})();
db.insert(schema.userRoles).values({ userId: scopedUser, role: "assistant" }).onConflictDoNothing().run();
db.delete(schema.permissionGrants).where(eq(schema.permissionGrants.userId, scopedUser)).run();
db.insert(schema.permissionGrants).values([
  { userId: scopedUser, permission: "contacts.edit", allow: true, scope: `cohort:${scopedCohort.id}` },
  { userId: scopedUser, permission: "bst.edit", allow: true, scope: `cohort:${scopedCohort.id}` },
]).run();
const scopedCookie = sessionFor(scopedUser);
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
    ["/bst", { rehab: true, executive: false, finance: false, assistant: false, warden: false }],
    ["/inbox", { rehab: true, assistant: true, finance: false, executive: false, warden: false }],
    ["/assigned", { assistant: false, finance: false }],
    [`/cohorts/${cohort.id}/assessments/quick?form=TEMP&round=pre`, { rehab: true, executive: false, finance: false, assistant: false }],
    // PMHQ = ข้อมูลสุขภาพจิต: ผู้ใช้ทดสอบ rehab เป็นพยาบาล (มีสิทธิ์สุขภาพ) จึงเข้าได้ / ผู้บริหาร การเงิน ผู้ช่วย ไม่ได้
    [`/cohorts/${cohort.id}/assessments/quick?form=PMHQ&round=pre`, { rehab: true, admin: true, executive: false, finance: false, assistant: false }],
    ["/rt101", { rehab: true, executive: false, finance: false, assistant: false, warden: false }],
    ["/print/bst?s=rt101", { rehab: true, executive: false, assistant: false }],
    ["/admin/forms", { admin: true, rehab: false, executive: false }],
    ["/instructors", { rehab: true, finance: true, executive: false, assistant: false, warden: false }],
    ["/instructors/new", { rehab: true, finance: true, executive: false }],
    ["/calendar", { rehab: true, finance: true, executive: true, assistant: true, warden: false }],
    ["/calendar?view=month", { rehab: true, warden: false }],
    ["/print/calendar", { rehab: true, finance: true, warden: false }],
    ["/admin/rates", { admin: true, finance: true, rehab: false, executive: false }],
    ["/admin/topics", { admin: true, rehab: false, finance: false }],
    ["/print/instructor-form", { rehab: true, finance: true, executive: false }],
    ["/admin/consent", { admin: true, rehab: false, executive: false, finance: false }],
    // ขั้น 4: แม่แบบเอกสารราชการ — เฉพาะผู้ดูแล
    ["/admin/doc-templates", { admin: true, rehab: false, finance: false, executive: false, assistant: false }],
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

  // กลุ่ม B มอบหมายรายรุ่น: เข้าได้เฉพาะคนในรุ่นนั้น และเห็นแบบจำกัด
  {
    const G = "2b. มอบหมายรายรุ่น (กลุ่ม B)";
    const inE = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, scopedCohort.id)).get()!;
    const inPerson = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, inE.incarcerationId)).get()!.personId;
    const outE = db.select().from(schema.enrollments).where(sql`${schema.enrollments.cohortId} <> ${scopedCohort.id}`).all()
      .find((e) => !db.select().from(schema.enrollments).innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
        .where(and(eq(schema.enrollments.cohortId, scopedCohort.id), eq(schema.incarcerations.personId, db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, e.incarcerationId)).get()!.personId))).get())!;
    const outPerson = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, outE.incarcerationId)).get()!.personId;
    const a1 = await get("/assigned", scopedCookie);
    check(G, "เปิดหน้างานที่ได้รับมอบหมาย", allowed(a1), `HTTP ${a1.status}`);
    const p1 = await get(`/persons/${inPerson}`, scopedCookie);
    check(G, "หน้าบุคคลในรุ่นที่มอบหมาย → เข้าได้แบบจำกัด (ไม่มีเลขบัตร/ฐานความผิด)", allowed(p1) && !p1.text.includes("เลขบัตรประชาชน") && !p1.text.includes("ฐานความผิด"), `HTTP ${p1.status}`);
    const p2 = await get(`/persons/${outPerson}`, scopedCookie);
    check(G, "หน้าบุคคลนอกรุ่นที่มอบหมาย → ถูกปฏิเสธ", denied(p2), `HTTP ${p2.status}${p2.location ? ` → ${p2.location}` : ""}`);
    const e1 = await get(`/enrollments/${inE.id}`, scopedCookie);
    check(G, "แฟ้มการอบรมในรุ่นที่มอบหมาย → เข้าได้ ไม่เห็นแบบประเมิน", allowed(e1) && !e1.text.includes("ผูกกับการลงทะเบียนครั้งนี้เท่านั้น"), `HTTP ${e1.status}`);
    const e2 = await get(`/enrollments/${outE.id}`, scopedCookie);
    check(G, "แฟ้มการอบรมนอกรุ่น → ถูกปฏิเสธ", denied(e2), `HTTP ${e2.status}`);
    const p3 = await get(`/persons/${inPerson}`, C.assistant);
    check(G, "ผู้ช่วยที่ไม่ได้รับมอบหมาย → หน้าบุคคลถูกปฏิเสธ", denied(p3), `HTTP ${p3.status}`);

    // กล่องจดหมายเวร: กลุ่ม B ไม่เห็นข้อความทั่วไป เห็นเฉพาะถึงรุ่นของตน
    const tag = randomBytes(4).toString("hex");
    const general = db.insert(schema.shiftMessages).values({ authorId: U.rehab, level: "normal", body: `ทั่วไป-${tag}`, recipientType: "next_shift" }).returning().get().id;
    const toCohort = db.insert(schema.shiftMessages).values({ authorId: U.rehab, level: "normal", body: `ถึงรุ่น-${tag}`, recipientType: "cohort", recipientCohortId: scopedCohort.id }).returning().get().id;
    const ib = await get("/inbox", scopedCookie);
    check(G, "กลุ่ม B → จดหมายเวร: ไม่เห็นข้อความทั่วไปของเวร แต่เห็นข้อความถึงรุ่นที่ตนสอน", allowed(ib) && !ib.text.includes(`ทั่วไป-${tag}`) && ib.text.includes(`ถึงรุ่น-${tag}`), `HTTP ${ib.status}`);
    const ib2 = await get("/inbox", C.rehab);
    check(G, "เจ้าหน้าที่หลัก → เห็นทั้งข้อความทั่วไปและข้อความถึงรุ่น", ib2.text.includes(`ทั่วไป-${tag}`) && ib2.text.includes(`ถึงรุ่น-${tag}`), `HTTP ${ib2.status}`);
    db.delete(schema.shiftMessageAcks).where(inArray(schema.shiftMessageAcks.messageId, [general, toCohort])).run();
    db.delete(schema.shiftMessages).where(inArray(schema.shiftMessages.id, [general, toCohort])).run();
  }

  // สเปก 2.1: OTP ผู้ดูแลปิดเป็นค่าเริ่มต้น → เข้าได้โดยไม่ผ่าน OTP / เปิดในตั้งค่าแล้ว → ต้องผ่าน OTP
  const otpBefore = sqlite.prepare("select value from settings where key = 'security.adminOtp'").get() as { value: string } | undefined;
  const setOtp = (v: string) => sqlite.prepare("insert into settings(key, value) values('security.adminOtp', ?) on conflict(key) do update set value = excluded.value").run(v);
  setOtp("false");
  const noOtp = await get("/admin/users", adminNoMfa);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้ดูแล (OTP ปิด — ค่าเริ่มต้น) → เข้าได้ไม่ต้องใช้ OTP", allowed(noOtp), `HTTP ${noOtp.status}${noOtp.location ? ` → ${noOtp.location}` : ""}`);
  const otpPage = await get("/otp/setup", adminNoMfa);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "OTP ปิด → หน้าตั้งค่า OTP พากลับหน้าแรก", isRedirectTo(otpPage, "/") && !otpPage.location.includes("/otp"), `→ ${otpPage.location}`);
  setOtp("true");
  const noMfa = await get("/admin/users", adminNoMfa);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "เปิด OTP ในตั้งค่า → ผู้ดูแลที่ยังไม่ยืนยันถูกพาไปหน้า OTP", isRedirectTo(noMfa, "/otp"), `→ ${noMfa.location}`);
  setOtp(otpBefore?.value ?? "false");
  // สเปก 11.4: จัดวิทยากรได้เฉพาะผู้มีสิทธิ์ schedule.edit (ผู้บริหาร/การเงิน ดูได้อย่างเดียว)
  const schedRehab = await get(`/cohorts/${cohort.id}/schedule`, C.rehab);
  const schedExec = await get(`/cohorts/${cohort.id}/schedule`, C.executive);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ตารางกิจกรรม: เจ้าหน้าที่หลักแก้คาบ/เพิ่มคาบ/เปลี่ยนวิทยากรได้ / ผู้บริหารดูอย่างเดียว", schedRehab.text.includes("เพิ่มคาบ") && schedRehab.text.includes("แก้คาบ / วิทยากร") && allowed(schedExec) && schedExec.text.includes("ดูอย่างเดียว") && !schedExec.text.includes("เพิ่มคาบ") && !schedExec.text.includes("เปลี่ยนวิทยากรเป็นช่วง"), `rehab HTTP ${schedRehab.status} · exec HTTP ${schedExec.status}`);
  // สเปก 11.5/22B: บันทึกผลคาบตรวจสิทธิ์รายคาบ · คาบชดเชย/สถานะเชิญ ต้องมี schedule.edit
  {
    const src = fs.readFileSync("src/app/(app)/sessions/actions.ts", "utf8");
    const body = (name: string) => src.slice(src.indexOf(`export async function ${name}`)).split("export async function")[1] ?? "";
    const ok = body("saveSessionReportAction").includes("sessionAccess(auth, s.id, s.cohortId).canEdit")
      && body("createMakeupAction").includes('requireAction("schedule.edit")')
      && body("setInviteStatusAction").includes('requireAction("schedule.edit")');
    check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "บันทึกและปิดคาบ: ตรวจสิทธิ์รายคาบที่เซิร์ฟเวอร์ · สร้างคาบชดเชย/เปลี่ยนสถานะเชิญ ต้องมีสิทธิ์แก้ตาราง", ok, "ตรวจจากโค้ด server action");
    // สเปก 22B: ผู้รับผิดชอบประจำวัน / ชิป — ตรวจสิทธิ์ที่เซิร์ฟเวอร์
    const schedSrc = fs.readFileSync("src/app/(app)/cohorts/[id]/schedule/actions.ts", "utf8");
    const paySrc = fs.readFileSync("src/app/(app)/admin/pay-actions.ts", "utf8");
    const fn = (src: string, name: string) => src.slice(src.indexOf(`export async function ${name}`)).split("export async function")[1] ?? "";
    check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้รับผิดชอบประจำวัน: เปลี่ยนได้เฉพาะผู้มีสิทธิ์แก้ตาราง · ชิป/เหตุผลสำเร็จรูป: เฉพาะผู้ดูแลคลังหัวข้อ",
      fn(schedSrc, "setDutyAction").includes('requireAction("schedule.edit")') && fn(paySrc, "saveTopicChipsAction").includes('requireAction("topics.manage")') && fn(paySrc, "saveReportChoicesAction").includes('requireAction("topics.manage")'), "ตรวจจากโค้ด server action");
    // ใบพิมพ์บันทึกผล/บันทึกหลังสอน ไม่มีชื่อผู้ต้องขัง
    {
      const taughtS = db.select().from(schema.cohortSessions).all().find((s) => s.taughtAt && s.takesAttendance && s.cohortId === notMine.cohortId);
      if (taughtS) {
        const inmate = db.select({ f: schema.persons.firstName, l: schema.persons.lastName }).from(schema.attendance)
          .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.attendance.enrollmentId))
          .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
          .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
          .where(eq(schema.attendance.sessionId, taughtS.id)).get();
        const rep = await get(`/print/session-report?session=${taughtS.id}`, C.rehab);
        const note = await get(`/print/speaker-note/${taughtS.id}`, C.rehab);
        const full = inmate ? `${inmate.f} ${inmate.l}` : "@@none@@";
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ใบบันทึกผลการจัดกิจกรรม / ใบบันทึกหลังสอน ไม่มีชื่อผู้ต้องขัง", rep.status === 200 && note.status === 200 && !rep.text.includes(full) && !note.text.includes(full), `HTTP ${rep.status}/${note.status}`);
      }
    }
    // ขั้น 3 กลุ่ม 4: ค่าตอบแทน — การเงินเห็นยอด · เจ้าหน้าที่หลักเห็นเฉพาะภาระงาน · ผู้บริหาร/ผู้ช่วยเข้าไม่ได้ · อนุมัติ/ปลดล็อก/มอบอำนาจตรวจที่เซิร์ฟเวอร์
    {
      const payFin = await get("/pay", C.finance);
      const payRehab = await get("/pay", C.rehab);
      const payExec = await get("/pay", C.executive);
      const payAsst = await get("/pay", C.assistant);
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ค่าตอบแทน: การเงินเห็นสรุปยอด / เจ้าหน้าที่หลักเห็นเฉพาะชั่วโมงสอน / ผู้บริหาร-ผู้ช่วยเข้าไม่ได้",
        allowed(payFin) && payFin.text.includes("สรุปค่าตอบแทน") && allowed(payRehab) && payRehab.text.includes("ภาระงานชั่วโมงสอน") && !payRehab.text.includes("สรุปค่าตอบแทน") && !payRehab.text.includes("รอบเบิก / อนุมัติ") && !allowed(payExec) && !allowed(payAsst),
        `fin ${payFin.status} · rehab ${payRehab.status} · exec ${payExec.status} · asst ${payAsst.status}`);
      const batch = db.select().from(schema.payBatches).get();
      if (batch) {
        const asRehab = await get(`/pay/batches/${batch.id}`, C.rehab);
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "เจ้าหน้าที่หลัก → เปิดรอบเบิกตรงๆ ด้วย URL", !allowed(asRehab), `HTTP ${asRehab.status}${asRehab.location ? ` → ${asRehab.location}` : ""}`);
      }
      const paySrc2 = fs.readFileSync("src/app/(app)/pay/actions.ts", "utf8");
      const paySvc = fs.readFileSync("src/lib/services/pay.ts", "utf8");
      const delSrc = fs.readFileSync("src/app/(app)/admin/delegations/actions.ts", "utf8");
      const delSvc = fs.readFileSync("src/lib/services/delegation.ts", "utf8");
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "อนุมัติค่าตอบแทนต้องมีสิทธิ์อนุมัติ · อนุมัติยอดตัวเองไม่ได้ · ปลดล็อกเฉพาะหัวหน้า/รอง · มอบอำนาจเฉพาะหัวหน้า/รอง",
        fn(paySrc2, "approveBatchAction").includes('requireAction("pay.approve")') && paySvc.includes("ไม่สามารถอนุมัติรอบเบิกที่มีค่าตอบแทนของตนเอง") && paySvc.includes('if (!actor.isAdmin) throw new RuleError("ปลดล็อกได้เฉพาะผู้ดูแลระบบ")')
          && fn(delSrc, "createDelegationAction").includes('requireAction("users.manage")') && delSvc.includes('if (!isAdmin(db, actor.userId)) throw new RuleError("มอบอำนาจได้เฉพาะผู้ดูแลระบบ")'),
        "ตรวจจากโค้ด server action / service");
      // กลุ่ม 5: เอกสารการเงิน (มีเลขบัตร/ที่อยู่/บัญชีวิทยากร) เฉพาะผู้มีสิทธิ์ดูค่าตอบแทน
      const appr = db.select().from(schema.payBatches).where(eq(schema.payBatches.status, "approved")).get();
      if (appr) {
        const bundleRehab = await get(`/print/pay-bundle/${appr.id}`, C.rehab);
        const bundleFin = await get(`/print/pay-bundle/${appr.id}`, C.finance);
        const xlsRehab = await get(`/api/export/pay/${appr.id}`, C.rehab);
        const pdfFin = await fetch(`${BASE}/api/pay-docs/${appr.id}?parts=summary`, { headers: { cookie: C.finance } });
        const pdfRehab = await fetch(`${BASE}/api/pay-docs/${appr.id}`, { headers: { cookie: C.rehab } });
        const testRehab = await fetch(`${BASE}/api/print-test?form=ktb`, { headers: { cookie: C.rehab } });
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ชุดเอกสารการเงิน PDF/Excel: การเงินเปิดได้ (ตรวจยอดผ่าน) / เจ้าหน้าที่หลักเปิดตรงๆ ไม่ได้ · ใบทดสอบการพิมพ์เฉพาะผู้ดูแล",
          bundleFin.status === 200 && bundleFin.text.includes("ตรวจยอดแล้ว") && pdfFin.status === 200 && (pdfFin.headers.get("content-type") ?? "").includes("application/pdf")
            && !allowed(bundleRehab) && xlsRehab.status === 403 && pdfRehab.status === 403 && testRehab.status === 403,
          `fin ${bundleFin.status}/${pdfFin.status} · rehab ${bundleRehab.status}/${pdfRehab.status} · xls ${xlsRehab.status} · test ${testRehab.status}`);
      }
      // กลุ่ม 6 งบประมาณ: หัวหน้า/รองแก้ · การเงินบันทึกจ่ายจริง · ผู้บริหารดูอย่างเดียว · เจ้าหน้าที่หลัก/ผู้ช่วยเข้าไม่ได้
      {
        const bAdmin = await get("/budget", C.admin), bFin = await get("/budget", C.finance), bExec = await get("/budget", C.executive), bRehab = await get("/budget", C.rehab), bAsst = await get("/budget", C.assistant);
        const withBudget = db.select({ id: schema.budgetLines.cohortId }).from(schema.budgetLines).innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.budgetLines.cohortId)).where(ne(schema.cohorts.status, "closed")).get();
        const cbFin = withBudget ? await get(`/cohorts/${withBudget.id}/budget`, C.finance) : null;
        const cbExec = withBudget ? await get(`/cohorts/${withBudget.id}/budget`, C.executive) : null;
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "งบประมาณ: หัวหน้าเพิ่มการจัดสรรได้ / การเงินบันทึกจ่ายจริงได้แต่จัดสรรไม่ได้ / ผู้บริหารดูอย่างเดียว / เจ้าหน้าที่หลัก-ผู้ช่วยเข้าไม่ได้",
          bAdmin.text.includes("เพิ่มการจัดสรร") && allowed(bFin) && !bFin.text.includes("เพิ่มการจัดสรร") && allowed(bExec) && bExec.text.includes("ดูอย่างเดียว") && !bExec.text.includes("เพิ่มการจัดสรร")
            && !allowed(bRehab) && !allowed(bAsst) && (!cbFin || (cbFin.text.includes("บันทึกใช้จ่าย") && !cbFin.text.includes("เพิ่มรายการเอง"))) && (!cbExec || (!cbExec.text.includes("บันทึกใช้จ่าย") && !cbExec.text.includes("เพิ่มรายการเอง"))),
          `admin ${bAdmin.status} · fin ${bFin.status} · exec ${bExec.status} · rehab ${bRehab.status} · asst ${bAsst.status}`);
        const bsrc = fs.readFileSync("src/app/(app)/budget/actions.ts", "utf8");
        const manageOk = ["saveAllocationAction", "deleteAllocationAction", "saveLineAction", "deleteLineAction", "applyTemplateAction", "copyLinesAction"].every((n) => fn(bsrc, n).includes('requireAction("budget.manage")'));
        const spendOk = ["recordExpenseAction", "recordRefundAction", "deleteExpenseAction"].every((n) => fn(bsrc, n).includes('requireAction("budget.spend")'));
        const triggers = sqlite.prepare("select name from sqlite_master where type = 'trigger' and name like 'budget_%'").all().length;
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "งบประมาณตรวจสิทธิ์ที่เซิร์ฟเวอร์ทุก action · ยืนยันเกินงบต้องมีสิทธิ์ · ฐานข้อมูลกันรวมงบเกินจัดสรร (trigger) + เงินเป็นสตางค์จำนวนเต็ม (CHECK)",
          manageOk && spendOk && fn(bsrc, "confirmOverrunAction").includes('requireAction("budget.approve")') && triggers === 3,
          `trigger ${triggers}/3 · ตรวจจากโค้ด server action`);
      }
      // กลุ่ม 7: LINE + รายงานประจำสัปดาห์
      {
        const lAdmin = await get("/admin/line", C.admin), lFin = await get("/admin/line", C.finance), lRehab = await get("/admin/line", C.rehab);
        // ตัวอย่างข้อความ LINE ต้องไม่มีชื่อ/เลขประจำตัวผู้ต้องขังของรุ่นที่มีคาบในวันทำการถัดไป
        const someone = db.select({ f: schema.persons.firstName, l: schema.persons.lastName, no: schema.incarcerations.inmateNo }).from(schema.enrollments)
          .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
          .innerJoin(schema.cohorts, eq(schema.cohorts.id, schema.enrollments.cohortId)).where(eq(schema.cohorts.status, "active")).get();
        const leak = someone ? lAdmin.text.includes(`${someone.f} ${someone.l}`) || lAdmin.text.includes(someone.no) : false;
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "LINE: เฉพาะผู้ดูแลตั้งค่า/ส่งทดสอบ · ตัวอย่างข้อความไม่มีชื่อ/เลขประจำตัวผู้ต้องขัง · ไม่แสดง token",
          allowed(lAdmin) && lAdmin.text.includes("ตัวอย่างข้อความที่จะส่ง") && !leak && !allowed(lFin) && !allowed(lRehab) && !lAdmin.text.includes("Bearer"),
          `admin ${lAdmin.status} · fin ${lFin.status} · rehab ${lRehab.status} · leak ${leak}`);
        const sendSrc = fs.readFileSync("src/lib/line/send.ts", "utf8");
        const urls = Array.from(new Set(sendSrc.match(/https?:\/\/[a-z0-9.-]+/gi) ?? []));
        check("7. เครือข่ายขาออก", "เชื่อมต่อออกเฉพาะ api.line.me (โค้ดส่ง LINE ไม่มีปลายทางอื่น) · ไม่มี token = โหมดทดลอง · ข้อมูลปลอม = ไม่ส่งจริง",
          urls.length === 1 && urls[0] === "https://api.line.me" && sendSrc.includes("app.isDemoData") && sendSrc.includes("looksLikeInmateData"), urls.join(", "));
        const wAsst = await get("/reports/weekly", C.assistant), wExec = await get("/reports/weekly", C.executive), wAdmin = await get("/reports/weekly", C.admin);
        check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "รายงานประจำสัปดาห์: หัวหน้าสร้าง/อนุมัติได้ · ผู้บริหารดูได้ (ไม่มีปุ่มสร้าง) · ผู้ช่วยเข้าไม่ได้",
          wAdmin.text.includes("สร้าง/อัปเดตร่าง") && allowed(wExec) && !wExec.text.includes("สร้าง/อัปเดตร่าง") && !allowed(wAsst), `admin ${wAdmin.status} · exec ${wExec.status} · asst ${wAsst.status}`);
      }
      // ขั้น 4 กลุ่ม 1: หลักสูตร 3 วัน — รายชื่อแนะนำ (มีชื่อผู้ต้องขัง) เฉพาะผู้ลงทะเบียน · ขั้นตอนโครงการแก้ได้เฉพาะผู้มีสิทธิ์จัดรุ่น
      {
        const p3 = db.select({ id: schema.cohorts.id }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(and(eq(schema.courses.code, "PRE3"), ne(schema.cohorts.status, "closed"))).get();
        if (p3) {
          const cRehab = await get(`/cohorts/${p3.id}/candidates`, C.rehab), cExec = await get(`/cohorts/${p3.id}/candidates`, C.executive), cFin = await get(`/cohorts/${p3.id}/candidates`, C.finance), cAsst = await get(`/cohorts/${p3.id}/candidates`, C.assistant);
          check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "3 วัน: รายชื่อแนะนำ (มีชื่อ) เข้าได้เฉพาะเจ้าหน้าที่ลงทะเบียน · ผู้บริหาร/การเงิน/ผู้ช่วยเข้าไม่ได้",
            allowed(cRehab) && cRehab.text.includes("พ้นโทษโดยประมาณ") && !allowed(cExec) && !allowed(cFin) && !allowed(cAsst),
            `rehab ${cRehab.status} · exec ${cExec.status} · fin ${cFin.status} · asst ${cAsst.status}`);
          const oExec = await get(`/cohorts/${p3.id}`, C.executive);
          const csrc = fs.readFileSync("src/app/(app)/cohorts/actions.ts", "utf8");
          check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "3 วัน: ขั้นตอนโครงการ — ผู้บริหารเห็นแต่ติ๊กไม่ได้ · action ตรวจสิทธิ์ course.manage ที่เซิร์ฟเวอร์ · เกณฑ์เลขบัตร/ยืนยันโทษบังคับที่เซิร์ฟเวอร์",
            allowed(oExec) && oExec.text.includes("ขั้นตอนโครงการ") && !oExec.text.includes("ติ๊กว่าเสร็จ") && fn(csrc, "setProjectStepAction").includes('requireAction("course.manage")')
              && fs.readFileSync("src/lib/services/registry.ts", "utf8").includes('"criteria_required"'),
            `exec ${oExec.status}`);
        }
      }
      const delFin = await get("/admin/delegations", C.finance);
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "การเงิน → หน้ามอบอำนาจ", !allowed(delFin), `HTTP ${delFin.status}`);
    }
    const asAssistant = await get(`/sessions/${notMine.id}`, C.assistant);
    check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ผู้ช่วย → เปิดคาบที่ไม่ได้รับผิดชอบ (ไม่เห็นฟอร์มปิดคาบ)", !allowed(asAssistant) && !asAssistant.text.includes("บันทึกและปิดคาบ"), `HTTP ${asAssistant.status}${asAssistant.location ? ` → ${asAssistant.location}` : ""}`);
  }
  // สเปก 10.1: แบบพิมพ์เปล่ามีรหัสแบบ (จับคู่กระดาษกับคน/แบบ/รอบ)
  const blank = await get(`/print/blank-forms/${cohort.id}?form=KNOW&round=pre`, C.rehab);
  check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "แบบพิมพ์เปล่า: มีรหัสแบบ (รหัส-เวอร์ชัน-รอบ-เลขลงทะเบียน)", blank.status === 200 && /KNOW-v\d+-ก่อน-E\d+/.test(blank.text), `HTTP ${blank.status}`);
  // สเปก 11.5B: เลขบัญชี/เลขบัตรวิทยากร เห็นเต็มเฉพาะการเงิน/ผู้ดูแล
  {
    const ins = db.select().from(schema.instructors).all().find((i) => i.accountNo && i.nationalId && !i.deletedAt);
    if (ins) {
      const digits = ins.accountNo!;
      const fmt = digits.length === 10 ? `${digits.slice(0, 3)}-${digits.slice(3, 4)}-${digits.slice(4, 9)}-${digits.slice(9)}` : digits;
      const asRehab = await get(`/instructors/${ins.id}`, C.rehab);
      const asFinance = await get(`/instructors/${ins.id}`, C.finance);
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ทะเบียนวิทยากร: เจ้าหน้าที่หลักเห็นเลขบัญชี/เลขบัตรแบบปิดบัง", allowed(asRehab) && !asRehab.text.includes(fmt) && !asRehab.text.includes(ins.nationalId!), `HTTP ${asRehab.status}`);
      check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ทะเบียนวิทยากร: การเงินเห็นเลขบัญชีเต็ม", allowed(asFinance) && asFinance.text.includes(digits), `HTTP ${asFinance.status}`);
    }
  }
  // ขั้น 4: ส่งต่อข้อมูลสุขภาพ (สเปก 17 กิจกรรม 11) — เฉพาะสถานพยาบาล/ผู้ดูแล · ผู้บริหารเห็นแค่ยอดรวม
  {
    const ref = db.select({ r: schema.healthReferrals, e: schema.enrollments, p: schema.persons }).from(schema.healthReferrals)
      .innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.healthReferrals.enrollmentId))
      .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId))
      .innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
      .where(eq(schema.healthReferrals.needsReferral, true)).get();
    if (!ref) check("2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ", "ส่งต่อข้อมูลสุขภาพ: มีข้อมูลปลอมให้ตรวจ", false, "ไม่พบรายการส่งต่อในฐานปลอม — รัน npm run seed ใหม่");
    else {
      const G = "2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ";
      for (const p of [`/enrollments/${ref.e.id}/referral`, `/print/referral/${ref.e.id}`, `/print/referral-list/${ref.e.cohortId}`]) {
        for (const [role, should] of Object.entries({ admin: true, rehab: true, executive: false, finance: false, assistant: false, warden: false })) {
          const r = await get(p, C[role as keyof typeof U]);
          check(G, `${role} → ${p}`, should ? allowed(r) : denied(r), `คาดว่า${should ? "เข้าได้" : "ถูกปฏิเสธ"} · HTTP ${r.status}`);
        }
      }
      const exec = await get(`/cohorts/${ref.e.cohortId}/health`, C.executive);
      check(G, "ผู้บริหาร → แท็บสถานพยาบาลรุ่น 3 วัน เห็นยอดส่งต่อ แต่ไม่มีชื่อ/โรค/ปุ่มพิมพ์", exec.status === 200 && exec.text.includes("ส่งต่อข้อมูลสุขภาพก่อนพ้นโทษ") && !exec.text.includes(ref.p.lastName) && !exec.text.includes("/print/referral") && !exec.text.includes("วัณโรค"), `HTTP ${exec.status}`);
      const before = db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "view_sensitive"), eq(schema.auditLogs.entity, "health_referral"))).all().length;
      await get(`/enrollments/${ref.e.id}/referral`, C.rehab);
      const after = db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "view_sensitive"), eq(schema.auditLogs.entity, "health_referral"))).all().length;
      check(G, "เปิดดูรายการส่งต่อ → บันทึกการเปิดดูข้อมูลสุขภาพ", after > before, `บันทึก ${before} → ${after}`);
      const notes = db.select().from(schema.notifications).all().filter((n) => /HIV|วัณโรค|เบาหวาน/.test(n.message));
      check(G, "แจ้งเตือนไม่มีชื่อโรคจากรายการส่งต่อ", notes.length === 0, `พบ ${notes.length} ข้อความ`);
    }
  }
  // ขั้น 4: เอกสารราชการของรุ่น (สเปก 18.4) — ฟื้นฟู/ผู้ดูแล/การเงินดูได้ · ผู้บริหาร ผู้ช่วย ผู้คุม ไม่ได้
  {
    const G = "2. สิทธิ์ตามบทบาท / เปลี่ยน URL ตรงๆ";
    const d = db.select().from(schema.documents).get();
    if (!d) check(G, "เอกสารราชการ: มีข้อมูลปลอมให้ตรวจ", false, "ไม่พบเอกสารในฐานปลอม — รัน npm run seed ใหม่");
    else {
      for (const p of [`/cohorts/${d.cohortId}/documents`, `/documents/${d.id}`, `/print/document/${d.id}`]) {
        for (const [role, should] of Object.entries({ admin: true, rehab: true, finance: true, executive: false, assistant: false, warden: false })) {
          const r = await get(p, C[role as keyof typeof U]);
          check(G, `${role} → ${p}`, should ? allowed(r) : denied(r), `คาดว่า${should ? "เข้าได้" : "ถูกปฏิเสธ"} · HTTP ${r.status}`);
        }
      }
      const noLogin = await fetch(`${BASE}/api/documents/${d.id}/docx`, { redirect: "manual" });
      check(G, "ไฟล์ Word เอกสาร: ไม่ล็อกอิน", [401, 403, 307, 303].includes(noLogin.status), `HTTP ${noLogin.status}`);
      const execDocx = await fetch(`${BASE}/api/documents/${d.id}/docx`, { redirect: "manual", headers: { cookie: C.executive } });
      check(G, "ไฟล์ Word เอกสาร: ผู้บริหาร (ไม่มีสิทธิ์)", execDocx.status === 403, `HTTP ${execDocx.status}`);
      const okDocx = await fetch(`${BASE}/api/documents/${d.id}/docx`, { headers: { cookie: C.rehab } });
      const bytes = new Uint8Array(await okDocx.arrayBuffer());
      check(G, "ไฟล์ Word เอกสาร: เจ้าหน้าที่ฟื้นฟูดาวน์โหลดได้ (เป็นไฟล์ .docx จริง)", okDocx.status === 200 && bytes[0] === 0x50 && bytes[1] === 0x4b, `HTTP ${okDocx.status} · ${bytes.length} ไบต์`);
      const fin = await get(`/documents/${d.id}`, C.finance);
      check(G, "การเงินเปิดเอกสารได้แบบดูอย่างเดียว (ไม่มีปุ่มบันทึก/ลบ)", allowed(fin) && fin.text.includes("ดูอย่างเดียว") && !fin.text.includes("ล็อกเป็นฉบับจริง"), `HTTP ${fin.status}`);
      // เอกสารหลังจบรุ่น (สเปก 18.4): รายชื่อพร้อมเลขบัตร + แบบรายงานผล
      const pre3Id = db.select({ id: schema.cohorts.id }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.courses.code, "PRE3")).all()
        .map((c) => c.id).find((id) => db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, id), inArray(schema.enrollments.status, ["active", "completed"]))).get());
      if (!pre3Id) check(G, "เอกสารหลังจบรุ่น: มีรุ่น 3 วันที่มีผู้เข้าอบรมให้ตรวจ", false, "รัน npm run seed ใหม่");
      else {
        const who = db.select({ no: schema.incarcerations.inmateNo, nid: schema.persons.nationalId, last: schema.persons.lastName }).from(schema.enrollments)
          .innerJoin(schema.incarcerations, eq(schema.incarcerations.id, schema.enrollments.incarcerationId)).innerJoin(schema.persons, eq(schema.persons.id, schema.incarcerations.personId))
          .where(and(eq(schema.enrollments.cohortId, pre3Id), inArray(schema.enrollments.status, ["active", "completed"]))).all().find((x) => x.nid)!;
        const pp = `/print/participants/${pre3Id}`;
        const notAllowed = (r: { status: number; location: string; text: string }) => denied(r) || r.status === 404;
        for (const [role, should] of Object.entries({ admin: true, rehab: true, finance: false, executive: false, assistant: false, warden: false })) {
          const r = await get(pp, C[role as keyof typeof U]);
          check(G, `${role} → ${pp} (รายชื่อพร้อมเลขบัตร)`, should ? allowed(r) : notAllowed(r), `คาดว่า${should ? "เข้าได้" : "ถูกปฏิเสธ"} · HTTP ${r.status}`);
        }
        const asAdmin = await get(pp, C.admin), asRehab = await get(pp, C.rehab);
        const ppSrc = fs.readFileSync("src/app/print/participants/[cohortId]/page.tsx", "utf8");
        check(G, "รายชื่อพร้อมเลขบัตร: ผู้มีสิทธิ์ national_id.view_full (ผู้ดูแล/ฟื้นฟู) เห็นเลขเต็ม · ผู้ไม่มีสิทธิ์นี้ได้เลขแบบปิดบัง (ตรวจจากโค้ด)", asAdmin.text.includes(who.nid!) && asRehab.text.includes(who.nid!) && ppSrc.includes('auth.can("national_id.view_full")') && ppSrc.includes("full ? p.person.nationalId : maskNationalId(p.person.nationalId)"), `admin ${asAdmin.status} / rehab ${asRehab.status}`);
        const lastPrint = db.select().from(schema.auditLogs).where(and(eq(schema.auditLogs.action, "print"), eq(schema.auditLogs.entity, "participants_national_id"))).all().length;
        check(G, "รายชื่อพร้อมเลขบัตร: บันทึกการพิมพ์ใน audit", lastPrint > 0, `${lastPrint} รายการ`);
        const rp = `/print/course-report/${pre3Id}`;
        for (const [role, should] of Object.entries({ admin: true, rehab: true, executive: true, assistant: false, warden: false })) {
          const r = await get(rp, C[role as keyof typeof U]);
          check(G, `${role} → ${rp} (แบบรายงานผล)`, should ? allowed(r) : notAllowed(r), `คาดว่า${should ? "เข้าได้" : "ถูกปฏิเสธ"} · HTTP ${r.status}`);
        }
        const rep = await get(rp, C.executive);
        check(G, "แบบรายงานผล: ไม่มีเลขประจำตัว/เลขบัตร/นามสกุลผู้ต้องขัง (ตัวเลขรวมเท่านั้น)", allowed(rep) && !rep.text.includes(who.no) && !rep.text.includes(who.nid!) && !rep.text.includes(who.last), `HTTP ${rep.status}`);
      }
    }
  }
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
  db.delete(schema.permissionGrants).where(eq(schema.permissionGrants.userId, scopedUser)).run();
  db.delete(schema.userRoles).where(eq(schema.userRoles.userId, scopedUser)).run();
  db.update(schema.users).set({ status: "suspended", deletedAt: new Date() }).where(eq(schema.users.id, scopedUser)).run();
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
