/**
 * ใส่ข้อมูลปลอมสำหรับพัฒนา/ทดสอบ/โหมดฝึกหัด — ห้ามใช้กับเครื่องใช้จริง
 *
 *   npm run seed            (สร้างใหม่ทั้งหมด: ลบฐานข้อมูลในโฟลเดอร์ DATA_DIR ก่อน)
 *
 * บัญชีทดสอบ (ข้อมูลปลอม ใช้เฉพาะเครื่องพัฒนา):
 *   รหัสหน่วยงาน : demo-rehab-2569
 *   รหัสผ่านทุกคน : rehab-2569   (บัญชี "ทดลอง เข้าครั้งแรก" จะถูกบังคับเปลี่ยนรหัส)
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq, and, lte } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "../src/lib/db";
import { config } from "../src/lib/config";
import { bootstrapReferenceData, setSetting } from "../src/lib/bootstrap";
import { hashPassword } from "../src/lib/auth/password";
import { createCohort } from "../src/lib/services/cohorts";
import { registerEnrollment } from "../src/lib/services/registry";
import { todayISO, addDays } from "../src/lib/thai-date";

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
        titleLabel: s.title ?? null, passwordHash: pw, mustChangePassword: !!s.mustChange, color: s.color, sortOrder: i + 1,
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
        tx.insert(schema.sessionStaff).values({ sessionId: s.id, userId: pick(rehabStaff) }).run();
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
  for (const start of ["2025-12-15", "2026-03-16", "2026-08-17"]) {
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
  for (const s of future) db.insert(schema.sessionStaff).values({ sessionId: s.id, userId: pick(rehabStaff) }).run();

  // ปีงบ 2570 รุ่นที่ 2 — วางแผนไว้ มีร่างลงทะเบียนล่วงหน้า
  const next = createCohort(db, { courseId: b12.id, startDate: "2027-01-11", targetCount: 45, location: "ห้องอบรม 2" }, headId);
  fillCohort(next.id, 20, { yy: 69, admitted: "2026-06-01", enrolled: today, status: "draft" });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const count = (t: any) => (db.select().from(t).all() as unknown[]).length;
  console.log(`✅ เสร็จ: บุคคล ${count(schema.persons)} คน, การต้องโทษ ${count(schema.incarcerations)}, ลงทะเบียน ${count(schema.enrollments)}, รุ่น ${count(schema.cohorts)}, เช็คชื่อ ${count(schema.attendance)} แถว`);
  console.log("   รหัสหน่วยงาน: demo-rehab-2569 / รหัสผ่านทุกคน: rehab-2569 (ข้อมูลปลอม)");
  sqlite.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
