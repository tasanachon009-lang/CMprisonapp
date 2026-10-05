/**
 * ใส่ข้อมูลปลอมสำหรับพัฒนา/ทดสอบ/โหมดฝึกหัด — ห้ามใช้กับเครื่องใช้จริง
 *
 *   npm run seed            (สร้างใหม่ทั้งหมด: ลบฐานข้อมูลในโฟลเดอร์ DATA_DIR ก่อน)
 *
 * บัญชีทดสอบ (ข้อมูลปลอม ใช้เฉพาะเครื่องพัฒนา):
 *   รหัสหน่วยงาน : demo-rehab-2569
 *   รหัสผ่าน      : rehab-2569 (ทุกคน) · หัวหน้า/รอง (ผู้ดูแล) = rehab-admin-2569 (ผู้ดูแลต้อง ≥ 12 ตัว)
 *   (บัญชี "ทดลอง เข้าครั้งแรก" จะถูกบังคับเปลี่ยนรหัส) — รายละเอียด: docs/TEST-ACCOUNTS.md
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, lte, inArray, or } from "drizzle-orm";
import { getForm, saveAssessment } from "../src/lib/services/assessments";
import { completeEnrollments, ensureIntakeTasks, ensureCompletionTasks } from "../src/lib/services/followup";
import { FORM_DEFS } from "../src/lib/assessments/forms";
import { openDatabase, runMigrations, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";
import { bootstrapReferenceData, setSetting } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/auth/password";
import { createCohort } from "../src/lib/services/cohorts";
import { registerEnrollment } from "../src/lib/services/registry";
import { todayISO, addDays } from "../src/lib/thai-date";
import { setDutyOfficer } from "../src/lib/services/duty";
import { createBatch, approveBatch } from "../src/lib/services/pay";

if (config.envLabel === "production") {
  console.error("❌ ห้ามรัน seed ข้อมูลปลอมบนเครื่องใช้จริง (APP_ENV=production)");
  process.exit(1);
}

// สุ่มแบบกำหนดค่าเริ่มต้น → ได้ข้อมูลชุดเดิมทุกครั้ง
let seed = 20261004;
const rand = () => {
  // mulberry32
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = <T,>(a: readonly T[]) => a[Math.floor(rand() * a.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

const MALE = ["สมชาย", "สมศักดิ์", "ประเสริฐ", "วิชัย", "สุรชัย", "อนุชา", "ธนากร", "กิตติ", "ณัฐพล", "อำนาจ", "บุญมี", "สมบัติ", "ชาตรี", "วีระ", "ไพโรจน์", "เอกชัย", "ศุภชัย", "จักรพันธ์", "ธีรวัฒน์", "พงษ์ศักดิ์", "อดิศักดิ์", "ปิยะ", "มานพ", "สุทธิพงษ์", "ทองดี", "บุญเลิศ", "ยุทธนา", "ชัยวัฒน์", "ภานุวัฒน์", "วุฒิชัย", "ณรงค์", "สายัณห์", "อภิชาติ", "ศักดิ์ชัย", "นพดล", "เกียรติศักดิ์", "จิรายุ", "ธนวัฒน์", "กฤษดา", "ศรายุทธ"];
const FEMALE = ["สมใจ", "มาลี", "สุนิสา", "วันเพ็ญ", "อรุณี", "กนกวรรณ", "ศิริพร", "จันทร์เพ็ญ", "ปราณี", "นงลักษณ์", "รัตนา", "สุภาพร", "พิมพ์ชนก", "ณัฐธิดา", "อัญชลี", "บุษบา", "เพ็ญศรี", "ลำดวน", "ทองใบ", "ดวงใจ"];
const LAST = ["ใจดี", "แสนสุข", "ทองคำ", "ศรีสวัสดิ์", "บุญมา", "แก้วมณี", "สุขเจริญ", "วงศ์ใหญ่", "ปัญญาดี", "อินทร์แก้ว", "คำมูล", "ปันแก้ว", "ใจมา", "ยาวิชัย", "สุริยวงศ์", "เทพวงศ์", "ชัยมงคล", "จันทร์ทอง", "ศรีวิชัย", "อุดมสุข", "มณีวงศ์", "กันทะวงศ์", "ธรรมวงศ์", "สิทธิชัย", "ไชยลังกา", "อินต๊ะ", "จินะ", "ปิงเมือง", "ดอยคำ", "แสงจันทร์", "คำแสน", "บุญเรือง", "เขียวขจี", "ทาเงิน", "วงค์ษา", "นันทะชัย", "พรหมมา", "สมบูรณ์", "จันทร์แก้ว", "ศรีบุญเรือง"];
const OFFENSES = ["ครอบครองยาเสพติดประเภท 1", "เสพยาเสพติดประเภท 1", "ครอบครองเพื่อจำหน่ายยาเสพติดประเภท 1", "จำหน่ายยาเสพติดประเภท 1", "ครอบครองยาเสพติดประเภท 5"];
const ZONES = ["แดน 1", "แดน 2", "แดน 3", "แดน 4", "แดน 5", "แดน 6", "แดนหญิง"];
const CLASSES = ["medium", "good", "very_good", "excellent"];
const SUBST = ["meth", "meth", "meth", "ice", "cannabis", "kratom"];
const FREQ = ["daily", "5-6pw", "3-4pw", "1-2pw", "monthly"];

function fakeNationalId(): string {
  const d = [int(1, 8), ...Array.from({ length: 11 }, () => int(0, 9))];
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += d[i] * (13 - i);
  d.push((11 - (sum % 11)) % 10);
  return d.join("");
}

let inmateSeq = 1000;
const nextInmateNo = (yy: number) => `${yy}-${String(inmateSeq++).padStart(5, "0")}`;

function fakePerson() {
  const female = rand() < 0.12;
  const birthY = int(1965, 2004);
  return {
    prefix: female ? (rand() < 0.5 ? "นาง" : "นางสาว") : "นาย",
    firstName: female ? pick(FEMALE) : pick(MALE),
    lastName: pick(LAST),
    gender: female ? "female" : "male",
    nationalId: rand() < 0.85 ? fakeNationalId() : null,
    birthDate: `${birthY}-${String(int(1, 12)).padStart(2, "0")}-${String(int(1, 28)).padStart(2, "0")}`,
    maritalStatus: pick(["โสด", "สมรส", "หย่าร้าง", "แยกกันอยู่"]),
    education: pick(["ประถมศึกษา", "มัธยมศึกษาตอนต้น", "มัธยมศึกษาตอนปลาย", "ปวช./ปวส.", "ปริญญาตรี"]),
    occupation: pick(["รับจ้างทั่วไป", "เกษตรกร", "ค้าขาย", "ว่างงาน", "ขับรถรับจ้าง", "ก่อสร้าง"]),
    familySize: int(1, 7),
  };
}

function fakeIncarceration(yy: number, admitted: string) {
  return {
    inmateNo: nextInmateNo(yy),
    admittedDate: admitted,
    offense: pick(OFFENSES),
    sentenceYears: int(0, 8),
    sentenceMonths: int(0, 11),
    sentenceDays: 0,
    sentenceStatus: "เด็ดขาด",
    zone: pick(ZONES),
    room: String(int(1, 30)),
    prisonerClass: pick(CLASSES),
  };
}

async function main() {
  // เริ่มใหม่ทั้งหมด
  for (const f of ["rehab.db", "rehab.db-wal", "rehab.db-shm"]) {
    const p = path.join(config.dataDir, f);
    if (fs.existsSync(p)) fs.rmSync(p);
  }
  const sqlite = openDatabase(config.dbPath);
  const db = drizzle(sqlite, { schema }) as DB;
  runMigrations(db);
  bootstrapReferenceData(db);

  setSetting(db, "auth.orgCodeHash", await hashPassword("demo-rehab-2569"), null);
  setSetting(db, "app.isDemoData", true, null);

  // ── บุคลากร (ชื่อปลอม) ตามโครงสร้างหัวข้อ 2.2-0 ──
  const pw = await hashPassword("rehab-2569");
  const adminPw = await hashPassword("rehab-admin-2569");
  const staff: Array<{ prefix: string; first: string; last: string; position: string; profession: string; level: string; title?: string; roles: string[]; color: string; mustChange?: boolean; status?: string }> = [
    { prefix: "นาย", first: "อำนวย", last: "รักษ์ธรรม", position: "ผู้บัญชาการเรือนจำกลางเชียงใหม่", profession: "executive", level: "executive", title: "ผู้บัญชาการเรือนจำ", roles: ["executive"], color: "#3D5590" },
    { prefix: "นาง", first: "พรรณี", last: "สุขภาพดี", position: "ผู้อำนวยการสถานพยาบาล", profession: "executive", level: "executive", title: "ผอ.สถานพยาบาล", roles: ["executive"], color: "#3D5590" },
    { prefix: "นาง", first: "วิภาวรรณ", last: "ฟื้นฟูใจ", position: "พยาบาลวิชาชีพชำนาญการพิเศษ", profession: "nurse", level: "lead", title: "หัวหน้า", roles: ["admin", "rehab", "medical"], color: "#2E8B57" },
    { prefix: "นาย", first: "ธนพล", last: "มั่นคง", position: "นักจิตวิทยาชำนาญการ", profession: "psychologist", level: "lead", title: "รองหัวหน้า", roles: ["admin", "rehab", "mental_health"], color: "#2E8B57" },
    { prefix: "นางสาว", first: "ศิริลักษณ์", last: "ใจงาม", position: "พยาบาลวิชาชีพชำนาญการ", profession: "nurse", level: "staff", roles: ["rehab", "medical"], color: "#9DB4EC" },
    { prefix: "นาง", first: "จิราพร", last: "ดูแลดี", position: "พยาบาลวิชาชีพปฏิบัติการ", profession: "nurse", level: "staff", roles: ["rehab", "medical"], color: "#9DB4EC" },
    { prefix: "นาย", first: "กฤตภาส", last: "เข้าใจ", position: "นักจิตวิทยาปฏิบัติการ", profession: "psychologist", level: "staff", roles: ["rehab", "mental_health"], color: "#9DB4EC" },
    { prefix: "นางสาว", first: "ปวีณา", last: "รับฟัง", position: "นักจิตวิทยาปฏิบัติการ", profession: "psychologist", level: "staff", roles: ["rehab", "mental_health"], color: "#9DB4EC" },
    { prefix: "นาย", first: "สมพงษ์", last: "ช่างฝีมือ", position: "นักฝึกอบรมวิชาชีพ", profession: "vocational_trainer", level: "staff", roles: ["assistant"], color: "#E8F2B0" },
    { prefix: "นางสาว", first: "อรอุมา", last: "ช่วยเหลือ", position: "นักสังคมสงเคราะห์", profession: "social_worker", level: "staff", roles: ["assistant"], color: "#E8F2B0" },
    { prefix: "นาง", first: "บุญศรี", last: "ตรวจบัญชี", position: "เจ้าพนักงานการเงินและบัญชี", profession: "finance", level: "staff", roles: ["finance"], color: "#F4F8D8" },
    { prefix: "นาย", first: "ทดลอง", last: "เข้าครั้งแรก", position: "พยาบาลวิชาชีพปฏิบัติการ", profession: "nurse", level: "staff", roles: ["rehab", "medical"], color: "#9DB4EC", mustChange: true },
    { prefix: "นาย", first: "ยุทธการ", last: "ควบคุมดี", position: "เจ้าพนักงานราชทัณฑ์", profession: "corrections_officer", level: "staff", roles: ["warden"], color: "#7A7A7A", status: "suspended" },
  ];
  const userIds: number[] = [];
  staff.forEach((s, i) => {
    const u = db
      .insert(schema.users)
      .values({
        prefix: s.prefix, firstName: s.first, lastName: s.last, position: s.position, profession: s.profession, level: s.level,
        titleLabel: s.title ?? null, passwordHash: s.roles.includes("admin") ? adminPw : pw, mustChangePassword: !!s.mustChange, color: s.color, sortOrder: i + 1,
        status: s.status ?? "active", suspendedReason: s.status ? "ค่าเริ่มต้น: ผู้ควบคุมไม่มีบัญชี (ตัวอย่างบัญชีที่ระงับไว้)" : null,
      })
      .returning()
      .get();
    for (const r of s.roles) db.insert(schema.userRoles).values({ userId: u.id, role: r }).run();
    userIds.push(u.id);
  });
  const headId = userIds[2];
  const rehabStaff = [userIds[2], userIds[3], userIds[4], userIds[5], userIds[6], userIds[7]];
  const actor = { userId: headId, canOverride: true, consentRequired: false };

  const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!;
  const fast = db.select().from(schema.courses).where(eq(schema.courses.code, "FAST")).get()!;
  const pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!;
  const today = todayISO();

  type Made = { incarcerationId: number; personId: number };
  const fillCohort = (cohortId: number, n: number, opts: { yy: number; admitted: string; enrolled: string; status: "active" | "completed" | "draft"; reuse?: Made[] }) => {
    const made: Made[] = [];
    for (let i = 0; i < n; i++) {
      const reuse = opts.reuse?.[i];
      const r = registerEnrollment(
        db,
        {
          cohortId,
          personId: reuse?.personId ?? null,
          person: fakePerson(),
          incarceration: reuse
            ? { inmateNo: db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, reuse.incarcerationId)).get()!.inmateNo }
            : fakeIncarceration(opts.yy, opts.admitted),
          drugUse: [{ substance: pick(SUBST), ageStarted: int(13, 30), frequency: pick(FREQ) }],
          screeningScore: int(4, 26),
          intake: { exclusions: [] },
          consentSigned: opts.status !== "draft" || rand() < 0.5,
          consentDate: opts.enrolled,
          consentReceiverId: pick(rehabStaff),
          confirmAdmission: opts.status !== "draft",
          acknowledgeWarnings: true,
          enrolledDate: opts.enrolled,
        },
        actor,
      );
      made.push({ incarcerationId: r.incarcerationId!, personId: r.personId });
    }
    return made;
  };

  // ใส่ผลเช็คชื่อให้คาบที่ผ่านมาแล้ว
  const fillAttendance = (cohortId: number, untilDate: string) => {
    const sessions = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), lte(schema.cohortSessions.date, untilDate))).all();
    const enr = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, cohortId)).all();
    db.transaction((tx) => {
      for (const s of sessions) {
        if (!s.takesAttendance) continue;
        for (const e of enr) {
          if (e.leftDate && e.leftDate <= s.date) continue;
          const x = rand();
          const status = x < 0.9 ? "present" : x < 0.94 ? "absent" : x < 0.96 ? "leave" : x < 0.98 ? "sick" : "corrections";
          tx.insert(schema.attendance)
            .values({ sessionId: s.id, enrollmentId: e.id, status, correctionsType: status === "corrections" ? pick(["court", "lawyer", "outside_hospital"]) : null, createdBy: pick(rehabStaff) })
            .run();
        }
        tx.update(schema.cohortSessions).set({ attendanceCheckedAt: new Date(), attendanceCheckedBy: pick(rehabStaff), status: "done" }).where(eq(schema.cohortSessions.id, s.id)).run();
        tx.insert(schema.sessionStaff).values({ sessionId: s.id, userId: pick(rehabStaff) }).onConflictDoNothing().run();
      }
      // ผลกิจกรรม/ปิดคาบ (ขั้น 3) — เว้นคาบเมื่อวานไว้ให้เห็นป้าย "ยังไม่บันทึกผลคาบ"
      for (const s of sessions) {
        if (s.date >= addDays(today, -1) || s.status === "cancelled") continue;
        const recorder = s.takesAttendance ? pick(rehabStaff) : rehabStaff[0];
        const present = tx.select({ id: schema.attendance.id }).from(schema.attendance).where(and(eq(schema.attendance.sessionId, s.id), eq(schema.attendance.status, "present"))).all().length;
        tx.insert(schema.sessionReports).values({ sessionId: s.id, ...(rand() < 0.95 ? { outcome: "planned" as const, reason: null } : { outcome: "partial" as const, reason: "เวลาไม่พอ (ข้อมูลทดสอบ)" }), participation: pick(["excellent", "good", "good", "fair"]), summary: "ดำเนินกิจกรรมตามแผน — สมาชิกกล้าแสดงออก (ข้อมูลทดสอบ)", chips: ["สมาชิกกล้าแสดงออก"], participants: present, proxyEntry: false, createdBy: recorder, updatedBy: recorder }).onConflictDoNothing().run();
        tx.update(schema.cohortSessions).set({ taughtAt: new Date(), taughtBy: recorder, status: "done" }).where(eq(schema.cohortSessions.id, s.id)).run();
      }
    });
  };

  const completeCohort = (cohortId: number, closed: boolean) => {
    const enr = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, cohortId)).all();
    const c = db.select().from(schema.cohorts).where(eq(schema.cohorts.id, cohortId)).get()!;
    for (const e of enr) {
      const dropped = rand() < 0.05;
      db.update(schema.enrollments)
        .set(dropped ? { status: "dropped", leftDate: addDays(c.startDate, int(2, 8)), leftReason: pick(["health", "discipline", "voluntary"]) } : { status: "completed", leftDate: c.endDate })
        .where(eq(schema.enrollments.id, e.id))
        .run();
    }
    if (closed) db.update(schema.cohorts).set({ status: "closed", closedAt: new Date(), closedBy: headId }).where(eq(schema.cohorts.id, cohortId)).run();
  };

  console.log("สร้างรุ่นและผู้เข้ารับการฟื้นฟู (ข้อมูลปลอม) ...");
  // ปีงบ 2568 — คนกลุ่มนี้บางส่วนจะ "กลับมาต้องโทษซ้ำ" ในปี 2570
  const c68a = createCohort(db, { courseId: b12.id, startDate: "2025-01-06", targetCount: 40, location: "ห้องอบรม 1" }, headId);
  const old68a = fillCohort(c68a.id, 40, { yy: 67, admitted: "2024-06-01", enrolled: "2025-01-06", status: "active" });
  fillAttendance(c68a.id, c68a.endDate);
  completeCohort(c68a.id, true);
  const c68b = createCohort(db, { courseId: b12.id, startDate: "2025-06-02", targetCount: 40, location: "ห้องอบรม 1" }, headId);
  fillCohort(c68b.id, 40, { yy: 67, admitted: "2024-09-01", enrolled: "2025-06-02", status: "active" });
  fillAttendance(c68b.id, c68b.endDate);
  completeCohort(c68b.id, true);

  // คนรุ่น 68a 12 คน พ้นโทษไปแล้ว
  for (const m of old68a.slice(0, 12)) {
    db.update(schema.incarcerations).set({ releasedDate: "2025-08-15", releaseReason: "completed_sentence" }).where(eq(schema.incarcerations.id, m.incarcerationId)).run();
  }

  // ปีงบ 2569 — 3 รุ่นที่จบแล้ว
  for (const start of ["2025-11-03", "2026-02-02", "2026-06-01"]) {
    const c = createCohort(db, { courseId: b12.id, startDate: start, targetCount: 40, location: "ห้องอบรม 1" }, headId);
    fillCohort(c.id, 40, { yy: 68, admitted: "2025-05-01", enrolled: start, status: "active" });
    fillAttendance(c.id, c.endDate);
    completeCohort(c.id, start !== "2026-06-01"); // รุ่นล่าสุดยังไม่ปิด (ทดสอบเช็คลิสต์ปิดรุ่น)
  }

  // ชุมชนบำบัด (กำลังดำเนินการ) — ใช้ทดสอบคำเตือน "กำลังอยู่หลักสูตรอื่น"
  const cf = createCohort(db, { courseId: fast.id, startDate: "2026-07-06", targetCount: 30 }, headId);
  const fastPeople = fillCohort(cf.id, 30, { yy: 68, admitted: "2025-08-01", enrolled: "2026-07-06", status: "active" });

  // 3 วัน (จบแล้ว) ปีงบ 2569
  for (const start of ["2025-03-17", "2025-12-15", "2026-03-16", "2026-08-17"]) {
    const c = createCohort(db, { courseId: pre3.id, startDate: start, targetCount: 50 }, headId);
    fillCohort(c.id, 45, { yy: 66, admitted: "2023-11-01", enrolled: start, status: "active" });
    completeCohort(c.id, true);
  }

  // ปีงบ 2570 รุ่นที่ 1 — กำลังอบรม (เริ่ม 1 ต.ค. 2569)
  const cur = createCohort(db, { courseId: b12.id, startDate: "2026-10-01", targetCount: 45, location: "ห้องอบรม 1" }, headId);
  db.update(schema.cohorts).set({ status: "active" }).where(eq(schema.cohorts.id, cur.id)).run();
  fillCohort(cur.id, 40, { yy: 69, admitted: "2026-03-01", enrolled: "2026-10-01", status: "active" });
  // ผู้กลับมาต้องโทษซ้ำ: บุคคลจากรุ่น 68a (พ้นโทษแล้ว) ได้เลขประจำตัวใหม่
  for (const m of old68a.slice(0, 3)) {
    const p = db.select().from(schema.persons).where(eq(schema.persons.id, m.personId)).get()!;
    registerEnrollment(
      db,
      {
        cohortId: cur.id, personId: p.id, person: { firstName: p.firstName, lastName: p.lastName },
        incarceration: fakeIncarceration(69, "2026-07-01"), consentSigned: true, consentDate: "2026-10-01",
        confirmAdmission: true, acknowledgeWarnings: true, enrolledDate: "2026-10-01", screeningScore: int(4, 26),
      },
      actor,
    );
  }
  // คนจากชุมชนบำบัด 2 คน มาเข้า 12 วันด้วย (คำเตือนเหลือง)
  fillCohort(cur.id, 2, { yy: 68, admitted: "2025-08-01", enrolled: "2026-10-01", status: "active", reuse: fastPeople.slice(0, 2) });
  // ชื่อซ้ำในรุ่นเดียวกัน (ทดสอบป้าย "ชื่อซ้ำ")
  for (let i = 0; i < 2; i++) {
    registerEnrollment(
      db,
      {
        cohortId: cur.id, person: { ...fakePerson(), prefix: "นาย", firstName: "สมชาย", lastName: "ใจดี", gender: "male" },
        incarceration: fakeIncarceration(69, "2026-04-01"), consentSigned: true, consentDate: "2026-10-01",
        confirmAdmission: true, acknowledgeWarnings: true, enrolledDate: "2026-10-01", screeningScore: int(4, 26),
      },
      actor,
    );
  }
  fillAttendance(cur.id, addDays(today, -1));
  // ผู้รับผิดชอบคาบในอนาคต (ใช้กับหน้าแรก "คาบของฉัน")
  const future = db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cur.id)).all().filter((s) => s.date >= today);
  for (const s of future) db.insert(schema.sessionStaff).values({ sessionId: s.id, userId: pick(rehabStaff) }).onConflictDoNothing().run();
  // กลุ่ม B: นักฝึกอบรมสอนบางคาบของรุ่นนี้ · นักสังคมสงเคราะห์ได้รับมอบหมายญาติ/ติดตามเฉพาะรุ่นนี้ (สเปก 2.2-0)
  for (const s of future.slice(0, 4)) db.insert(schema.sessionStaff).values({ sessionId: s.id, userId: userIds[8] }).onConflictDoNothing().run();
  // วิทยากรหลายคนต่อคาบ (สเปก 11.4): บางคาบมีวิทยากรร่วม 2 คน และมีวิทยากรภายนอก
  const twoStaff = future.slice(4).filter((s) => s.hours >= 2).slice(0, 6); // ไม่ซ้อนกับคาบที่นักฝึกอบรมสอนอยู่แล้ว
  for (const s of twoStaff) {
    const first = db.select().from(schema.sessionStaff).where(eq(schema.sessionStaff.sessionId, s.id)).get();
    if (first?.userId) db.update(schema.sessionStaff).set({ role: "lead" }).where(eq(schema.sessionStaff.id, first.id)).run();
    const second = rehabStaff.find((u) => u !== first?.userId)!;
    db.insert(schema.sessionStaff).values({ sessionId: s.id, userId: second, role: "co" }).onConflictDoNothing().run();
  }
  // ทะเบียนวิทยากร (ข้อมูลปลอมทั้งหมด): ภายนอกพร้อมเบิก 1 คน / ข้อมูลไม่ครบ 1 คน / ภายในมีข้อมูลบัญชี 2 คน
  const somsri = db.insert(schema.instructors).values({
    kind: "external", externalType: "gov", prefix: "นาง", firstName: "สมศรี", lastName: "ใจดี", position: "นักจิตวิทยาชำนาญการ", organization: "โรงพยาบาลตัวอย่าง (ข้อมูลปลอม)",
    phone: "0812345678", email: "somsri@example.com", nationalId: fakeNationalId(), addrHouseNo: "99/1", addrMoo: "3", addrRoad: "ห้วยแก้ว",
    addrSubdistrict: "สุเทพ", addrDistrict: "เมืองเชียงใหม่", addrProvince: "เชียงใหม่", addrPostcode: "50200",
    payeeType: "person", bank: "ธนาคารกรุงไทย", bankBranch: "นิมมานเหมินท์", accountType: "savings", accountName: "นางสมศรี ใจดี", accountNo: "1234567890",
    notifyChannel: "sms", bankBookReceived: true, bankBookReceivedDate: "2026-09-20", expertise: "การจัดการอารมณ์ การป้องกันการเสพซ้ำ", createdBy: headId,
  }).returning().get();
  db.insert(schema.instructors).values({ kind: "external", externalType: "private", prefix: "นาย", firstName: "วิชัย", lastName: "สอนดี", organization: "มูลนิธิตัวอย่าง (ข้อมูลปลอม)", phone: "0898765432", expertise: "ทักษะชีวิต", createdBy: headId }).run();
  for (const uid of [userIds[2], userIds[6]]) {
    db.insert(schema.instructors).values({ kind: "internal", userId: uid, nationalId: fakeNationalId(), addrHouseNo: "1", addrSubdistrict: "ช้างเผือก", addrDistrict: "เมืองเชียงใหม่", addrProvince: "เชียงใหม่", addrPostcode: "50300", bank: "ธนาคารออมสิน", bankBranch: "เชียงใหม่", accountType: "savings", accountName: "บัญชีตัวอย่าง", accountNo: String(int(1000000000, 9999999999)), notifyChannel: "email", email: "staff@example.com", bankBookReceived: true, bankBookReceivedDate: "2026-09-01", createdBy: headId }).run();
  }
  if (twoStaff[0]) {
    db.update(schema.cohortSessions).set({ maxStaff: 3 }).where(eq(schema.cohortSessions.id, twoStaff[0].id)).run();
    db.insert(schema.sessionStaff).values({ sessionId: twoStaff[0].id, instructorId: somsri.id, role: "co" }).onConflictDoNothing().run();
  }
  // สเปก 22B: คาบบ่ายวันนี้มีแต่วิทยากรภายนอก → ผู้รับผิดชอบประจำวัน (ศิริลักษณ์) เห็นการ์ด "ต้องบันทึกแทน" ที่หน้าแรก
  const pmToday = future.find((s) => s.date === today && s.startTime === "13:00");
  if (pmToday) {
    db.update(schema.sessionStaff).set({ deletedAt: new Date(), deletedBy: headId }).where(eq(schema.sessionStaff.sessionId, pmToday.id)).run();
    db.insert(schema.sessionStaff).values({ sessionId: pmToday.id, instructorId: somsri.id, inviteStatus: "confirmed", createdBy: headId }).run();
  }
  const sirilak = db.select().from(schema.users).where(eq(schema.users.firstName, "ศิริลักษณ์")).get();
  if (sirilak && future.some((s) => s.date === today)) setDutyOfficer(db, cur.id, today, sirilak.id, { userId: headId });

  for (const permission of ["contacts.edit", "bst.view", "bst.edit"]) {
    db.insert(schema.permissionGrants).values({ userId: userIds[9], permission, allow: true, scope: `cohort:${cur.id}`, reason: "มอบหมายงานญาติ/ติดตามรุ่นนี้ (ตัวอย่าง)", createdBy: headId }).run();
  }
  // ขั้น 3 กลุ่ม 4 ค่าตอบแทน (ข้อมูลปลอม): วิทยากรภายนอกร่วมสอนคาบเช้าที่ผ่านมา · รุ่น 68b อนุมัติแล้ว (ล็อกคาบ) · รุ่นปัจจุบันเป็นร่างรออนุมัติ
  {
    const vichai = db.select().from(schema.instructors).where(eq(schema.instructors.firstName, "วิชัย")).get()!;
    const finance = db.select().from(schema.users).where(eq(schema.users.firstName, "บุญศรี")).get();
    const addExt = (cohortId: number, n: number) => {
      const ss = db.select().from(schema.cohortSessions).where(and(eq(schema.cohortSessions.cohortId, cohortId), eq(schema.cohortSessions.startTime, "09:00"))).all().filter((s) => s.taughtAt).slice(0, n);
      ss.forEach((s, i) => db.insert(schema.sessionStaff).values({ sessionId: s.id, instructorId: i % 2 ? vichai.id : somsri.id, role: "co", inviteStatus: "confirmed", createdBy: headId }).onConflictDoNothing().run());
    };
    addExt(c68b.id, 6);
    addExt(cur.id, 2);
    const old = createBatch(db, { cohortId: c68b.id, note: "ตัวอย่าง (ข้อมูลปลอม)" }, { userId: finance?.id ?? headId });
    approveBatch(db, old.id, { userId: headId });
    createBatch(db, { cohortId: cur.id, note: "ตัวอย่างร่าง รออนุมัติ" }, { userId: finance?.id ?? headId });
  }

  // ปีงบ 2570 รุ่นที่ 2 — วางแผนไว้ มีร่างลงทะเบียนล่วงหน้า
  const next = createCohort(db, { courseId: b12.id, startDate: "2027-01-11", targetCount: 45, location: "ห้องอบรม 2" }, headId);
  fillCohort(next.id, 40, { yy: 69, admitted: "2026-06-01", enrolled: today, status: "draft" });

  // ── ข้อมูลขั้นที่ 2 (ปลอม) ──
  console.log("ใส่ข้อมูลขั้นที่ 2: แบบประเมิน ติดตาม บสต. บันทึก ...");
  const can = () => true;
  const form = (code: string) => getForm(db, code)!;
  const itemsAnswers = (code: string, pick: (no: number) => number) => {
    const f = FORM_DEFS.find((x) => x.code === code)!;
    return Object.fromEntries(f.items.map((i) => [String(i.no), pick(i.no)]));
  };
  const assessAll = (cohortId: number, round: "pre" | "post", date: string, share: number, improve = 0) => {
    const enr = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, cohortId)).all().filter((e) => e.status !== "draft");
    for (const e of enr) {
      if (rand() > share) continue;
      const actorA = { userId: pick(rehabStaff), can: can as never };
      const save = (code: string, answers: unknown) => {
        try {
          saveAssessment(db, { enrollmentId: e.id, formId: form(code).id, round, assessedDate: date, answers }, actorA);
        } catch { /* ข้าม (เช่น ไม่ครบ) */ }
      };
      const kf = FORM_DEFS.find((x) => x.code === "KNOW")!;
      save("KNOW", Object.fromEntries(kf.items.map((i) => [String(i.no), rand() < 0.55 + improve ? (i.correct ? 1 : 0) : i.correct ? 0 : 1])));
      save("ATT", itemsAnswers("ATT", () => Math.min(5, Math.max(1, int(2, 4) + (improve ? 1 : 0)))));
      save("MOTIV", { value: Math.min(5, int(1, 3) + (improve ? 2 : 0)) });
      save("TEMP", { value: Math.min(10, int(3, 7) + (improve ? 2 : 0)) });
      save("PMHQ", itemsAnswers("PMHQ", () => (rand() < 0.15 ? int(1, 3) : int(0, 1))));
      const risky = rand() < 0.08;
      save("DEP", risky
        ? { q2: [true, true], q9: [2, 2, 2, 1, 1, 1, 1, 0, rand() < 0.5 ? 1 : 0], q8: [true, false, false, false, false, false, false, rand() < 0.3], q8control: null }
        : rand() < 0.2 ? { q2: [true, false], q9: [1, 1, 1, 1, 0, 0, 0, 0, 0] } : { q2: [false, false] });
      save("PSY", itemsAnswers("PSY", () => (rand() < 0.01 ? 1 : 0)));
      if (round === "post") save("PROG", itemsAnswers("PROG", () => int(2, 5)));
    }
  };
  // รุ่นปัจจุบัน: ประเมินก่อนเรียนไปแล้วประมาณ 75%
  assessAll(cur.id, "pre", "2026-10-01", 0.75);
  // รุ่นที่จบแล้วของปีงบ 2569: ก่อน-หลังครบ และบันทึกจบหลักสูตร → สร้างการติดตาม
  const b12Done = db.select().from(schema.cohorts).where(and(eq(schema.cohorts.courseId, b12.id), eq(schema.cohorts.fiscalYear, 2569))).all();
  for (const c of b12Done) {
    assessAll(c.id, "pre", c.startDate, 1);
    assessAll(c.id, "post", c.endDate, 1, 0.3);
    const enr = db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, c.id), eq(schema.enrollments.status, "completed"))).all();
    // ย้อนสถานะเป็นกำลังอบรมก่อน แล้วบันทึกจบผ่านบริการจริง (ได้กำหนดการติดตาม + งาน บสต.)
    for (const e of enr) {
      db.update(schema.enrollments).set({ status: "active", leftDate: null }).where(eq(schema.enrollments.id, e.id)).run();
      ensureIntakeTasks(db, e.id, headId);
    }
    completeEnrollments(db, enr.map((e) => e.id), "completed", c.endDate, { userId: headId });
    // งาน บสต. ที่ถึงกำหนดแล้ว ลงไปแล้วส่วนใหญ่ / ติดตามที่ถึงกำหนด ทำแล้วส่วนใหญ่
    const tasks = db.select().from(schema.bstTasks).where(inArray(schema.bstTasks.enrollmentId, enr.map((e) => e.id))).all();
    for (const t of tasks) if (t.dueDate && t.dueDate < today && rand() < 0.85) db.update(schema.bstTasks).set({ status: "done", doneDate: t.dueDate, doneBy: pick(rehabStaff) }).where(eq(schema.bstTasks.id, t.id)).run();
    const fus = db.select().from(schema.followups).where(inArray(schema.followups.enrollmentId, enr.map((e) => e.id))).all();
    for (const f of fus) {
      if (f.dueDate < today && rand() < 0.8) {
        db.update(schema.followups).set({ status: "done", doneDate: f.dueDate, method: pick(["phone", "visit"]), relapse: rand() < 0.08 ? "yes" : rand() < 0.1 ? "unknown" : "no", occupation: pick(["รับจ้าง", "เกษตรกร", "ค้าขาย"]), bstRecorded: true }).where(eq(schema.followups.id, f.id)).run();
      }
    }
  }
  // รุ่นที่จบแบบไม่ผ่านบริการ (2568 และ 3 วัน): สร้างงานเมื่อครบหลักสูตร (บสต. จำหน่าย/ติดตาม, รท.101)
  const otherDone = db.select().from(schema.cohorts).where(or(eq(schema.cohorts.fiscalYear, 2568), eq(schema.cohorts.courseId, pre3.id))).all();
  for (const c of otherDone) {
    for (const e of db.select().from(schema.enrollments).where(and(eq(schema.enrollments.cohortId, c.id), eq(schema.enrollments.status, "completed"))).all()) {
      ensureCompletionTasks(db, e.id, e.leftDate!, headId);
    }
    if (c.courseId === pre3.id) {
      // รท.101 ของหลักสูตร 3 วัน: ลงแล้วส่วนใหญ่ ยกเว้นรุ่นล่าสุดที่ยังค้างบางส่วน
      const ids = db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, c.id)).all().map((r) => r.id).concat(-1);
      for (const t of db.select().from(schema.bstTasks).where(inArray(schema.bstTasks.enrollmentId, ids)).all()) {
        if ((t.dueDate ?? "") < "2026-08-01" || rand() < 0.4) db.update(schema.bstTasks).set({ status: "done", doneDate: t.dueDate, doneBy: pick(rehabStaff) }).where(eq(schema.bstTasks.id, t.id)).run();
      }
    }
  }
  // รุ่นเก่าปีงบ 2568: งาน บสต./รท.101 ลงครบแล้ว
  for (const c of db.select().from(schema.cohorts).where(eq(schema.cohorts.fiscalYear, 2568)).all()) {
    const ids = db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, c.id)).all().map((r) => r.id);
    if (ids.length) db.update(schema.bstTasks).set({ status: "done", doneDate: c.endDate }).where(inArray(schema.bstTasks.enrollmentId, ids)).run();
    // ติดตามครบแล้ว (ยกเว้นผู้พ้นโทษไปแล้ว = ปิดการติดตาม)
    for (const f of ids.length ? db.select().from(schema.followups).where(inArray(schema.followups.enrollmentId, ids)).all() : []) {
      const e = db.select().from(schema.enrollments).where(eq(schema.enrollments.id, f.enrollmentId)).get()!;
      const inc = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, e.incarcerationId)).get()!;
      if (inc.releasedDate && f.dueDate > inc.releasedDate) {
        db.update(schema.followups).set({ status: "closed", reason: "ปิดการติดตาม – พ้นโทษ" }).where(eq(schema.followups.id, f.id)).run();
        db.update(schema.bstTasks).set({ status: "closed", reason: "ปิดการติดตาม – พ้นโทษ", doneDate: null }).where(and(eq(schema.bstTasks.enrollmentId, f.enrollmentId), eq(schema.bstTasks.step, `followup${f.seq}`))).run();
      } else {
        db.update(schema.followups).set({ status: "done", doneDate: f.dueDate, method: pick(["phone", "visit"]), relapse: rand() < 0.1 ? "yes" : rand() < 0.1 ? "unknown" : "no", occupation: pick(["รับจ้าง", "เกษตรกร", "ค้าขาย"]), bstRecorded: true }).where(eq(schema.followups.id, f.id)).run();
      }
    }
  }
  // ชุมชนบำบัด (ยังไม่เปิดหน้าจอ): ลงทะเบียน/คัดกรองแล้ว
  db.update(schema.bstTasks).set({ status: "done", doneDate: "2026-07-10" }).where(inArray(schema.bstTasks.enrollmentId, db.select({ id: schema.enrollments.id }).from(schema.enrollments).where(eq(schema.enrollments.cohortId, cf.id)).all().map((r) => r.id).concat(-1))).run();
  // รุ่นปัจจุบัน: งาน บสต. ลงทะเบียน/คัดกรอง ลงแล้วบางส่วน
  const curTasks = db.select().from(schema.bstTasks).innerJoin(schema.enrollments, eq(schema.enrollments.id, schema.bstTasks.enrollmentId)).where(eq(schema.enrollments.cohortId, cur.id)).all();
  for (const { bst_tasks: t } of curTasks) if (t.step === "register" && rand() < 0.6) db.update(schema.bstTasks).set({ status: "done", doneDate: "2026-10-02", doneBy: pick(rehabStaff) }).where(eq(schema.bstTasks.id, t.id)).run();

  // บันทึกพฤติกรรม ความเห็นสถานพยาบาล จดหมายเวร
  const curEnr = db.select().from(schema.enrollments).where(eq(schema.enrollments.cohortId, cur.id)).all();
  for (const e of curEnr.slice(0, 12)) {
    const tone = pick(["positive", "positive", "observe", "negative"]);
    db.insert(schema.behaviorNotes).values({ enrollmentId: e.id, incarcerationId: e.incarcerationId, noteDate: "2026-10-02", tone, category: tone === "positive" ? "helping" : tone === "negative" ? "emotion" : "participation", text: tone === "positive" ? "ช่วยจัดสถานที่ก่อนเริ่มกิจกรรม" : tone === "negative" ? "หงุดหงิดง่ายระหว่างกิจกรรมกลุ่ม" : "ตั้งใจฟัง มีส่วนร่วมดี", createdBy: pick(rehabStaff) }).run();
  }
  for (const e of curEnr.slice(0, 4)) {
    db.insert(schema.medicalNotes).values({ enrollmentId: e.id, noteDate: "2026-10-02", kind: "medical", screeningResult: "สัญญาณชีพปกติ", opinion: "เข้าร่วมกิจกรรมได้", recommendation: "ติดตามความดันโลหิต", referral: e.id % 2 === 0, referralDetail: e.id % 2 === 0 ? "รพ.นครพิงค์" : null, referralStatus: e.id % 2 === 0 ? "pending" : null, createdBy: userIds[4] }).run();
  }
  const someone = db.select().from(schema.incarcerations).where(eq(schema.incarcerations.id, curEnr[0].incarcerationId)).get()!;
  db.insert(schema.shiftMessages).values([
    { authorId: userIds[4], level: "important", body: "ฝากเช็คชื่อคาบเขียนบันทึกประจำวันให้ครบ เมื่อวานยังขาด 2 คน", recipientType: "next_shift", needsAction: true, dueDate: today },
    { authorId: userIds[5], level: "red", body: "ฝากติดตามอาการซึมเศร้า มีความคิดทำร้ายตนเอง — ประสานพยาบาลก่อนเริ่มกิจกรรม", personId: someone.personId, healthRelated: true, recipientType: "all", needsAction: true, dueDate: today },
    { authorId: userIds[2], level: "normal", body: "พรุ่งนี้มีประชุมเจ้าหน้าที่ 13.00 น. ห้องอบรม 2", recipientType: "all" },
  ]).run();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = (t: any) => (db.select().from(t).all() as unknown[]).length;
  console.log(`✅ เสร็จ: บุคคล ${count(schema.persons)} คน, การต้องโทษ ${count(schema.incarcerations)}, ลงทะเบียน ${count(schema.enrollments)}, รุ่น ${count(schema.cohorts)}, เช็คชื่อ ${count(schema.attendance)} แถว`);
  console.log(`   แบบประเมิน ${count(schema.assessmentResults)}, งาน บสต. ${db.select().from(schema.bstTasks).where(eq(schema.bstTasks.system, "bst")).all().length}, งาน รท.101 ${db.select().from(schema.bstTasks).where(eq(schema.bstTasks.system, "rt101")).all().length}, ติดตาม ${count(schema.followups)}`);
  console.log("   รหัสหน่วยงาน: demo-rehab-2569 / รหัสผ่าน: rehab-2569 · หัวหน้า/รอง: rehab-admin-2569 (ข้อมูลปลอม — ดู docs/TEST-ACCOUNTS.md)");
  sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
