/**
 * โครงสร้างฐานข้อมูลหลัก (สเปกหัวข้อ 5)
 *
 * หลักการ:
 * - วันที่ปฏิทิน (วันเกิด วันเริ่มรุ่น ฯลฯ) เก็บเป็นข้อความ 'YYYY-MM-DD' แบบ ค.ศ. — ไม่มีปัญหา time zone
 * - เวลาเหตุการณ์ (created_at ฯลฯ) เก็บเป็นมิลลิวินาที (integer)
 * - เงินเก็บเป็นสตางค์ (integer) เสมอ
 * - ทุกตารางข้อมูลงานมี created_by/at, updated_by/at, deleted_at (soft delete) และ version (กันบันทึกทับ)
 * - ตารางของขั้นถัดไป (ค่าตอบแทน งบ ชุมชนบำบัด ฯลฯ) จะเพิ่มด้วย migration ในขั้นนั้น
 *   โดยผูกกับตารางหลักด้านล่าง (ดู docs/data-model.md)
 */
import { sql } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  text,
  real,
  index,
  uniqueIndex,
  type AnySQLiteColumn,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) => integer(name, { mode: "timestamp_ms" });

/** คอลัมน์มาตรฐานของทุกตารางข้อมูลงาน */
const tracking = () => ({
  createdBy: integer("created_by"),
  createdAt: ts("created_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
  updatedBy: integer("updated_by"),
  updatedAt: ts("updated_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
  deletedAt: ts("deleted_at"),
  deletedBy: integer("deleted_by"),
  version: integer("version").notNull().default(1),
});

// ───────────────────────── ผู้ใช้ สิทธิ์ ความปลอดภัย ─────────────────────────

export const users = sqliteTable(
  "users",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    prefix: text("prefix"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    nickname: text("nickname"),
    /** ตำแหน่งตามสายงาน เช่น "พยาบาลวิชาชีพชำนาญการ" */
    position: text("position"),
    /** วิชาชีพ: nurse | psychologist | vocational_trainer | social_worker | corrections_officer | finance | executive | other */
    profession: text("profession").notNull().default("other"),
    /** ระดับ: executive | lead | staff */
    level: text("level").notNull().default("staff"),
    /** ป้ายตำแหน่งบนหน้าจอ เช่น "หัวหน้า" / "รองหัวหน้า" / "ผู้บัญชาการเรือนจำ" */
    titleLabel: text("title_label"),
    passwordHash: text("password_hash").notNull(),
    mustChangePassword: integer("must_change_password", { mode: "boolean" }).notNull().default(true),
    passwordChangedAt: ts("password_changed_at"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    lockedUntil: ts("locked_until"),
    totpSecret: text("totp_secret"),
    totpEnabled: integer("totp_enabled", { mode: "boolean" }).notNull().default(false),
    /** active | suspended (ระงับ ไม่ลบ) */
    status: text("status").notNull().default("active"),
    suspendedReason: text("suspended_reason"),
    lastLoginAt: ts("last_login_at"),
    photoPath: text("photo_path"),
    /** สีพื้นวงกลมตัวอักษรย่อ */
    color: text("color"),
    sortOrder: integer("sort_order").notNull().default(100),
    ...tracking(),
  },
  (t) => [index("users_status_idx").on(t.status)],
);

/**
 * บทบาท (1 คนมีได้หลายบทบาท สิทธิ์รวมกัน)
 * admin | rehab | medical | assistant | finance | executive | warden
 */
export const userRoles = sqliteTable(
  "user_roles",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    role: text("role").notNull(),
    createdBy: integer("created_by"),
    createdAt: ts("created_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
  },
  (t) => [uniqueIndex("user_roles_unique").on(t.userId, t.role)],
);

/** ปรับสิทธิ์รายคน (เพิ่ม/ลด) และมอบสิทธิ์ชั่วคราวเป็นช่วงวันที่ */
export const permissionGrants = sqliteTable(
  "permission_grants",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull().references(() => users.id),
    permission: text("permission").notNull(),
    /** true = เพิ่มสิทธิ์, false = ตัดสิทธิ์ */
    allow: integer("allow", { mode: "boolean" }).notNull().default(true),
    /** ขอบเขต เช่น cohort:12 (มอบหมายรายรุ่นให้กลุ่ม B) — ว่าง = ทั้งระบบ */
    scope: text("scope"),
    validFrom: text("valid_from"),
    validTo: text("valid_to"),
    reason: text("reason"),
    revokedAt: ts("revoked_at"),
    revokedBy: integer("revoked_by"),
    ...tracking(),
  },
  (t) => [index("permission_grants_user_idx").on(t.userId)],
);

/** เซสชันการใช้งาน (เก็บเฉพาะ hash ของ token) */
export const sessions = sqliteTable(
  "sessions",
  {
    id: text("id").primaryKey(), // sha256(token)
    userId: integer("user_id").notNull().references(() => users.id),
    deviceId: text("device_id"),
    createdAt: ts("created_at").notNull(),
    lastActiveAt: ts("last_active_at").notNull(),
    expiresAt: ts("expires_at").notNull(),
    /** ล็อกหน้าจอ (ด่วนหรือไม่ใช้งาน 15 นาที) — ต้องใส่รหัสผ่านเดิมเพื่อปลด */
    lockedAt: ts("locked_at"),
    /** ยืนยัน OTP แล้ว (ผู้ดูแล) */
    mfaVerifiedAt: ts("mfa_verified_at"),
    ip: text("ip"),
    userAgent: text("user_agent"),
    endedAt: ts("ended_at"),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/** เครื่องที่ผ่านรหัสหน่วยงานแล้ว (จำ 30 วัน) */
export const trustedDevices = sqliteTable("trusted_devices", {
  id: text("id").primaryKey(), // sha256(token)
  createdAt: ts("created_at").notNull(),
  expiresAt: ts("expires_at").notNull(),
  lastSeenAt: ts("last_seen_at"),
  ip: text("ip"),
  userAgent: text("user_agent"),
  revokedAt: ts("revoked_at"),
});

/** การกระทำที่ต้องยืนยัน 2 คน (หัวหน้า + รอง) */
export const dualApprovals = sqliteTable("dual_approvals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  action: text("action").notNull(),
  payload: text("payload", { mode: "json" }),
  reason: text("reason").notNull(),
  requestedBy: integer("requested_by").notNull(),
  requestedAt: ts("requested_at").notNull(),
  /** pending | approved | rejected | executed | expired */
  status: text("status").notNull().default("pending"),
  decidedBy: integer("decided_by"),
  decidedAt: ts("decided_at"),
  executedAt: ts("executed_at"),
  result: text("result"),
});

/**
 * ประวัติการใช้งาน — เพิ่มได้อย่างเดียว
 * (มี trigger ใน migration ห้าม UPDATE/DELETE แม้ผ่านฐานข้อมูลตรง)
 */
export const auditLogs = sqliteTable(
  "audit_logs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    at: ts("at").notNull(),
    userId: integer("user_id"),
    /** เช่น login.success, login.fail, create, update, delete, view_sensitive, print, export, backup, restore, permission.change */
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    /** บุคคลที่เกี่ยวข้อง (ใช้ค้นประวัติตามผู้ต้องขัง) */
    personId: integer("person_id"),
    before: text("before", { mode: "json" }),
    after: text("after", { mode: "json" }),
    note: text("note"),
    ip: text("ip"),
  },
  (t) => [
    index("audit_at_idx").on(t.at),
    index("audit_user_idx").on(t.userId, t.at),
    index("audit_person_idx").on(t.personId, t.at),
  ],
);

/** แจ้งเตือนในระบบ (ผู้ดูแล/บทบาท/รายคน) */
export const notifications = sqliteTable(
  "notifications",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    createdAt: ts("created_at").notNull(),
    /** ส่งถึงคนเดียว หรือ ส่งถึงบทบาท (เช่น admin, medical) */
    userId: integer("user_id"),
    role: text("role"),
    /** info | warning | danger */
    severity: text("severity").notNull().default("info"),
    kind: text("kind").notNull(),
    message: text("message").notNull(),
    link: text("link"),
    readAt: ts("read_at"),
    readBy: integer("read_by"),
  },
  (t) => [index("notifications_target_idx").on(t.userId, t.role, t.readAt)],
);

/** ร่างอัตโนมัติ (บันทึกทุก 30 วินาที / ก่อนล็อกหน้าจอ) */
export const drafts = sqliteTable(
  "drafts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id").notNull(),
    key: text("key").notNull(),
    data: text("data", { mode: "json" }).notNull(),
    updatedAt: ts("updated_at").notNull(),
  },
  (t) => [uniqueIndex("drafts_user_key").on(t.userId, t.key)],
);

/** "คุณ ก. กำลังแก้ไขอยู่" */
export const editPresence = sqliteTable(
  "edit_presence",
  {
    entity: text("entity").notNull(),
    entityId: text("entity_id").notNull(),
    userId: integer("user_id").notNull(),
    expiresAt: ts("expires_at").notNull(),
  },
  (t) => [uniqueIndex("edit_presence_unique").on(t.entity, t.entityId, t.userId)],
);

// ───────────────────────── ตั้งค่าและคลังค่า ─────────────────────────

/** ค่าตั้งระบบแบบ key → JSON (ชื่อหน่วยงาน รหัสหน่วยงาน (hash) ตำแหน่งสำรอง ฯลฯ) */
export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" }),
  updatedBy: integer("updated_by"),
  updatedAt: ts("updated_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
});

/**
 * คลังค่าที่ตั้งค่าได้ — แยกด้วย category
 * release_reason | corrections_reason | leave_reason | drop_reason | prisoner_class | zone | location | doc_type ...
 */
export const lookups = sqliteTable(
  "lookups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    category: text("category").notNull(),
    code: text("code").notNull(),
    label: text("label").notNull(),
    sortOrder: integer("sort_order").notNull().default(100),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    meta: text("meta", { mode: "json" }),
    ...tracking(),
  },
  (t) => [uniqueIndex("lookups_cat_code").on(t.category, t.code)],
);

/** วันหยุดราชการ (แก้ไขได้) */
export const holidays = sqliteTable("holidays", {
  date: text("date").primaryKey(),
  name: text("name").notNull(),
  createdBy: integer("created_by"),
  createdAt: ts("created_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
});

// ───────────────────────── บุคคล การต้องโทษ ─────────────────────────

/** บุคคล — คนจริง 1 คน */
export const persons = sqliteTable(
  "persons",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    nationalId: text("national_id"),
    prefix: text("prefix"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    birthDate: text("birth_date"),
    /** male | female | other */
    gender: text("gender"),
    maritalStatus: text("marital_status"),
    education: text("education"),
    occupation: text("occupation"),
    familySize: integer("family_size"),
    /** ข้อความค้นหา: ชื่อ+สกุลไม่มีช่องว่าง/คำนำหน้า */
    searchKey: text("search_key").notNull().default(""),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("persons_national_id_unique").on(t.nationalId).where(sql`national_id IS NOT NULL`),
    index("persons_search_idx").on(t.searchKey),
    index("persons_name_birth_idx").on(t.firstName, t.lastName, t.birthDate),
  ],
);

/** การต้องโทษ — 1 ครั้งที่เข้าเรือนจำ อ้างอิงเลขประจำตัวผู้ต้องขัง */
export const incarcerations = sqliteTable(
  "incarcerations",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id").notNull().references(() => persons.id),
    inmateNo: text("inmate_no").notNull(),
    admittedDate: text("admitted_date"),
    offense: text("offense"),
    caseNote: text("case_note"),
    sentenceYears: integer("sentence_years"),
    sentenceMonths: integer("sentence_months"),
    sentenceDays: integer("sentence_days"),
    /** ผู้ต้องขังเด็ดขาด/ระหว่าง */
    sentenceStatus: text("sentence_status"),
    zone: text("zone"),
    room: text("room"),
    prisonerClass: text("prisoner_class"),
    photoPath: text("photo_path"),
    thumbPath: text("thumb_path"),
    /** บันทึกเมื่อทราบว่าออกไปแล้วเท่านั้น (หัวข้อ 8) */
    releasedDate: text("released_date"),
    releaseReason: text("release_reason"),
    releaseNote: text("release_note"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("incarcerations_inmate_no_unique").on(t.inmateNo),
    index("incarcerations_person_idx").on(t.personId),
  ],
);

/** ประวัติการใช้สารเสพติด (หลายแถว) */
export const drugUseHistory = sqliteTable(
  "drug_use_history",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    incarcerationId: integer("incarceration_id").notNull().references(() => incarcerations.id),
    substance: text("substance").notNull(),
    ageStarted: integer("age_started"),
    /** daily | 5-6pw | 3-4pw | 1-2pw | monthly */
    frequency: text("frequency"),
    timesPerMonth: integer("times_per_month"),
    durationYears: real("duration_years"),
    note: text("note"),
    ...tracking(),
  },
  (t) => [index("drug_use_inc_idx").on(t.incarcerationId)],
);

/** ญาติ/ผู้ติดต่อ ที่อยู่หลังปล่อย หน่วยบริการใกล้บ้าน (หัวข้อ 7.5 — หน้าจอขั้น 2) */
export const contacts = sqliteTable(
  "contacts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    personId: integer("person_id").notNull().references(() => persons.id),
    /** relative | address_after_release | health_unit */
    kind: text("kind").notNull(),
    name: text("name"),
    relation: text("relation"),
    phone: text("phone"),
    address: text("address"),
    note: text("note"),
    ...tracking(),
  },
  (t) => [index("contacts_person_idx").on(t.personId)],
);

/** บันทึกเอกสาร (ไม่แนบไฟล์) เช่น ใบตรวจแพทย์ (หัวข้อ 7.6) */
export const documentRecords = sqliteTable(
  "document_records",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    incarcerationId: integer("incarceration_id").notNull().references(() => incarcerations.id),
    docType: text("doc_type").notNull(),
    docDate: text("doc_date"),
    result: text("result"),
    issuer: text("issuer"),
    storageLocation: text("storage_location"),
    note: text("note"),
    /** เผื่อแนบไฟล์ภายหลัง */
    filePath: text("file_path"),
    ...tracking(),
  },
  (t) => [index("document_records_inc_idx").on(t.incarcerationId)],
);

// ───────────────────────── หลักสูตร รุ่น ตาราง ─────────────────────────

export const courses = sqliteTable("courses", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  /** B12 | FAST | PRE3 */
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  description: text("description"),
  durationDays: integer("duration_days").notNull(),
  /** ปฏิทินนับเฉพาะวันทำการ (ข้ามวันหยุด) หรือนับทุกวัน */
  skipHolidays: integer("skip_holidays", { mode: "boolean" }).notNull().default(true),
  skipWeekends: integer("skip_weekends", { mode: "boolean" }).notNull().default(true),
  totalHours: real("total_hours").notNull(),
  passAttendancePct: integer("pass_attendance_pct").notNull().default(80),
  requiresBst: integer("requires_bst", { mode: "boolean" }).notNull().default(false),
  requiresRt101: integer("requires_rt101", { mode: "boolean" }).notNull().default(false),
  requiresFollowup: integer("requires_followup", { mode: "boolean" }).notNull().default(false),
  /** หลักสูตรที่เปิดหน้าจอแล้ว (ขั้น 1 เปิดเฉพาะ 12 วัน) */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  /** เกณฑ์รับเข้า (JSON ตามหลักสูตร) */
  intakeCriteria: text("intake_criteria", { mode: "json" }),
  color: text("color"),
  sortOrder: integer("sort_order").notNull().default(100),
  ...tracking(),
});

/** แม่แบบตารางของหลักสูตร (วันที่ n ของหลักสูตร) */
export const courseTemplateSessions = sqliteTable(
  "course_template_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id").notNull().references(() => courses.id),
    dayNo: integer("day_no").notNull(),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    title: text("title").notNull(),
    /** กลุ่มวิชา/หมวด */
    category: text("category"),
    hours: real("hours").notNull(),
    /** นับเป็นคาบเช็คชื่อหรือไม่ (เช่น พักกลางวันไม่นับ) */
    takesAttendance: integer("takes_attendance", { mode: "boolean" }).notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(100),
  },
  (t) => [index("cts_course_idx").on(t.courseId, t.dayNo)],
);

export const cohorts = sqliteTable(
  "cohorts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    courseId: integer("course_id").notNull().references(() => courses.id),
    /** ปีงบประมาณ พ.ศ. */
    fiscalYear: integer("fiscal_year").notNull(),
    number: integer("number").notNull(),
    startDate: text("start_date").notNull(),
    endDate: text("end_date").notNull(),
    /** planned | active | closed */
    status: text("status").notNull().default("planned"),
    targetCount: integer("target_count"),
    location: text("location"),
    note: text("note"),
    closedAt: ts("closed_at"),
    closedBy: integer("closed_by"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("cohorts_unique").on(t.courseId, t.fiscalYear, t.number).where(sql`deleted_at IS NULL`),
    index("cohorts_dates_idx").on(t.startDate, t.endDate),
  ],
);

/** คาบกิจกรรมของรุ่น */
export const cohortSessions = sqliteTable(
  "cohort_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    cohortId: integer("cohort_id").notNull().references(() => cohorts.id),
    date: text("date").notNull(),
    dayNo: integer("day_no"),
    startTime: text("start_time").notNull(),
    endTime: text("end_time").notNull(),
    title: text("title").notNull(),
    category: text("category"),
    hours: real("hours").notNull(),
    location: text("location"),
    takesAttendance: integer("takes_attendance", { mode: "boolean" }).notNull().default(true),
    /** คาบชดเชย ผูกกับคาบเดิม */
    makeupOfId: integer("makeup_of_id").references((): AnySQLiteColumn => cohortSessions.id),
    /** scheduled | done | cancelled */
    status: text("status").notNull().default("scheduled"),
    attendanceCheckedAt: ts("attendance_checked_at"),
    attendanceCheckedBy: integer("attendance_checked_by"),
    /** ล็อกหลังอนุมัติค่าตอบแทน (ขั้น 3) */
    lockedAt: ts("locked_at"),
    ...tracking(),
  },
  (t) => [index("cohort_sessions_idx").on(t.cohortId, t.date), index("cohort_sessions_date_idx").on(t.date)],
);

/** ผู้รับผิดชอบคาบ (ใช้กับหน้าแรก "คาบของฉัน" — ค่าตอบแทนเพิ่มในขั้น 3) */
export const sessionStaff = sqliteTable(
  "session_staff",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull().references(() => cohortSessions.id),
    userId: integer("user_id").references(() => users.id),
    /** ชื่อวิทยากรภายนอก (ขั้น 3 จะผูกทะเบียนวิทยากร) */
    externalName: text("external_name"),
    ...tracking(),
  },
  (t) => [index("session_staff_session_idx").on(t.sessionId), index("session_staff_user_idx").on(t.userId)],
);

// ───────────────────────── การลงทะเบียน การเช็คชื่อ ─────────────────────────

/** การลงทะเบียนเข้ารุ่น — ผูกการต้องโทษ + รุ่น */
export const enrollments = sqliteTable(
  "enrollments",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    incarcerationId: integer("incarceration_id").notNull().references(() => incarcerations.id),
    cohortId: integer("cohort_id").notNull().references(() => cohorts.id),
    /** ซ้ำจาก cohort เพื่อใช้ unique กันลงหลักสูตรซ้ำที่ระดับฐานข้อมูล */
    courseId: integer("course_id").notNull().references(() => courses.id),
    /**
     * ลำดับการปลดล็อก: ปกติ 0 — ผู้ดูแลปลดล็อกลงซ้ำได้ ระบบให้ค่าถัดไป
     * unique(incarceration, course, override_seq) จึงกันลงซ้ำโดยไม่ตั้งใจได้ที่ฐานข้อมูล
     */
    overrideSeq: integer("override_seq").notNull().default(0),
    overrideBy: integer("override_by"),
    overrideReason: text("override_reason"),
    /** draft | active | completed | dropped (ออกก่อนกำหนด) | withdrawn | failed */
    status: text("status").notNull().default("draft"),
    enrolledDate: text("enrolled_date").notNull(),
    leftDate: text("left_date"),
    leftReason: text("left_reason"),
    /** เกณฑ์รับเข้า (คะแนนคัดกรอง ลักษณะต้องห้าม ฯลฯ) */
    intake: text("intake", { mode: "json" }),
    screeningScore: integer("screening_score"),
    /** หลักฐานความยินยอม PDPA */
    consentSigned: integer("consent_signed", { mode: "boolean" }).notNull().default(false),
    consentDate: text("consent_date"),
    consentReceiverId: integer("consent_receiver_id"),
    consentRefused: integer("consent_refused", { mode: "boolean" }).notNull().default(false),
    consentRefuseReason: text("consent_refuse_reason"),
    /** กลุ่มย่อย / พี่เลี้ยง */
    groupNo: integer("group_no"),
    /** สถานะที่ถูกตั้งโดยการบันทึกออกจากเรือนจำ (ใช้ย้อนกลับเมื่อยกเลิก) */
    statusBeforeRelease: text("status_before_release"),
    releaseEventId: integer("release_event_id"),
    note: text("note"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("enrollments_no_duplicate")
      .on(t.incarcerationId, t.courseId, t.overrideSeq)
      .where(sql`deleted_at IS NULL`),
    index("enrollments_cohort_idx").on(t.cohortId, t.status),
    index("enrollments_inc_idx").on(t.incarcerationId),
  ],
);

/**
 * การเช็คชื่อ — 1 คาบ 1 คน 1 แถว (unique ที่ฐานข้อมูล)
 * status: present | absent | leave | sick | corrections
 * corrections = เหตุราชทัณฑ์ (ไม่นับขาด ตัดออกจากตัวหาร)
 */
export const attendance = sqliteTable(
  "attendance",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: integer("session_id").notNull().references(() => cohortSessions.id),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    status: text("status").notNull(),
    /** court | lawyer | outside_hospital | other */
    correctionsType: text("corrections_type"),
    note: text("note"),
    /** กรอกย้อนหลังจากชุดฉุกเฉิน ฯลฯ */
    source: text("source"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("attendance_unique").on(t.sessionId, t.enrollmentId),
    index("attendance_enrollment_idx").on(t.enrollmentId),
  ],
);

/** บันทึกการออกจากเรือนจำ (หัวข้อ 8) — เก็บผลที่ระบบทำไว้เพื่อย้อนกลับได้ */
export const releaseEvents = sqliteTable(
  "release_events",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    batchId: text("batch_id").notNull(),
    incarcerationId: integer("incarceration_id").notNull().references(() => incarcerations.id),
    releasedDate: text("released_date").notNull(),
    reason: text("reason").notNull(),
    note: text("note"),
    /** สิ่งที่ระบบทำ เช่น {enrollments:[{id,from,to}], attendanceRemoved:[...]} */
    effects: text("effects", { mode: "json" }),
    cancelledAt: ts("cancelled_at"),
    cancelledBy: integer("cancelled_by"),
    cancelReason: text("cancel_reason"),
    ...tracking(),
  },
  (t) => [index("release_events_inc_idx").on(t.incarcerationId)],
);

/** การนำเข้า Excel */
export const importBatches = sqliteTable("import_batches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  fileName: text("file_name").notNull(),
  cohortId: integer("cohort_id"),
  totalRows: integer("total_rows").notNull(),
  importedRows: integer("imported_rows").notNull(),
  summary: text("summary", { mode: "json" }),
  createdBy: integer("created_by"),
  createdAt: ts("created_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
});

// ───────────────────────── สำรองข้อมูล งานตั้งเวลา ─────────────────────────

export const backupRuns = sqliteTable(
  "backup_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    /** scheduled | nightly | manual | pre_update | pre_restore | removable */
    kind: text("kind").notNull(),
    /** running | success | failed */
    status: text("status").notNull(),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    /** ผลการคัดลอกไปแต่ละชุด {local:true, external:false, removable:null} */
    targets: text("targets", { mode: "json" }),
    rowCounts: text("row_counts", { mode: "json" }),
    error: text("error"),
    triggeredBy: integer("triggered_by"),
  },
  (t) => [index("backup_runs_started_idx").on(t.startedAt)],
);

export const restoreTests = sqliteTable("restore_tests", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  at: ts("at").notNull(),
  backupFile: text("backup_file").notNull(),
  status: text("status").notNull(),
  detail: text("detail", { mode: "json" }),
});

/** งานตั้งเวลา: บันทึกทุกครั้ง และทำย้อนหลังเมื่อเครื่องเปิดใหม่ */
export const jobRuns = sqliteTable(
  "job_runs",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    job: text("job").notNull(),
    /** รอบที่ควรทำ เช่น 2026-10-04T22:00 */
    slot: text("slot").notNull(),
    startedAt: ts("started_at").notNull(),
    finishedAt: ts("finished_at"),
    status: text("status").notNull(),
    message: text("message"),
  },
  (t) => [uniqueIndex("job_runs_slot").on(t.job, t.slot)],
);

// ═════════════════════════ ขั้นที่ 2 ═════════════════════════

// ───────── คลังแบบประเมิน (สเปก 10) ─────────

/** แบบประเมิน (หัว) — รายละเอียดข้อ/เกณฑ์อยู่ในเวอร์ชัน (แช่แข็ง ณ วันประเมิน) */
export const assessmentForms = sqliteTable("assessment_forms", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  shortName: text("short_name").notNull(),
  /** knowledge | attitude | behavior | motivation | health_mental | health_physical | fitness */
  category: text("category").notNull(),
  /** items (รวมคะแนนรายข้อ) | depression (2Q→9Q→8Q) | single (เลือก 1 ค่า) | fitness (5 ฐาน) | condition (สภาวะกาย/จิตแรกรับ) */
  kind: text("kind").notNull().default("items"),
  /** ข้อมูลอ่อนไหว → เห็นเฉพาะสถานพยาบาล/ผู้ดูแล */
  sensitive: integer("sensitive", { mode: "boolean" }).notNull().default(false),
  /** รอบที่ใช้ เช่น ["pre","post"] หรือ ["monthly"] */
  rounds: text("rounds", { mode: "json" }).notNull(),
  /** หลักสูตรที่ใช้ เช่น ["B12","FAST"] */
  courseCodes: text("course_codes", { mode: "json" }).notNull(),
  description: text("description"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(100),
  ...tracking(),
});

export const assessmentFormVersions = sqliteTable(
  "assessment_form_versions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    formId: integer("form_id").notNull().references(() => assessmentForms.id),
    version: integer("version").notNull(),
    /** ข้อคำถาม [{no, text, help?, reverse?, correct?, group?}] */
    items: text("items", { mode: "json" }).notNull(),
    /** ตัวเลือกคะแนน + สูตร + เกณฑ์แปลผล + เกณฑ์แจ้งเตือน */
    scoring: text("scoring", { mode: "json" }).notNull(),
    effectiveFrom: text("effective_from").notNull(),
    note: text("note"),
    createdBy: integer("created_by"),
    createdAt: ts("created_at").notNull().default(sql`(CAST(unixepoch('subsec') * 1000 AS INTEGER))`),
  },
  (t) => [uniqueIndex("afv_unique").on(t.formId, t.version)],
);

/** ผลประเมิน — เก็บคะแนนรายข้อ + ผลรวม + การแปลผล ณ เวลานั้น (ผูกกับการลงทะเบียน → รอบเก่าไม่ปนรอบใหม่) */
export const assessmentResults = sqliteTable(
  "assessment_results",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    formId: integer("form_id").notNull().references(() => assessmentForms.id),
    versionId: integer("version_id").notNull().references(() => assessmentFormVersions.id),
    /** pre | post | monthly */
    round: text("round").notNull(),
    /** รอบรายเดือน 'YYYY-MM' (อื่นๆ = '') */
    period: text("period").notNull().default(""),
    assessedDate: text("assessed_date").notNull(),
    assessorId: integer("assessor_id"),
    answers: text("answers", { mode: "json" }).notNull(),
    total: real("total"),
    level: text("level"),
    /** ok | warn | danger */
    tone: text("tone"),
    details: text("details", { mode: "json" }),
    sensitive: integer("sensitive", { mode: "boolean" }).notNull().default(false),
    source: text("source"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("ar_unique").on(t.enrollmentId, t.formId, t.round, t.period).where(sql`deleted_at IS NULL`),
    index("ar_enrollment_idx").on(t.enrollmentId),
  ],
);

/** ความเห็นเจ้าหน้าที่สถานพยาบาล (สเปก 10.2) — ข้อมูลอ่อนไหว */
export const medicalNotes = sqliteTable(
  "medical_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    noteDate: text("note_date").notNull(),
    /** medical | mental */
    kind: text("kind").notNull().default("medical"),
    screeningResult: text("screening_result"),
    opinion: text("opinion"),
    recommendation: text("recommendation"),
    referral: integer("referral", { mode: "boolean" }).notNull().default(false),
    referralDetail: text("referral_detail"),
    referralStatus: text("referral_status"),
    fields: text("fields", { mode: "json" }),
    ...tracking(),
  },
  (t) => [index("medical_notes_enr_idx").on(t.enrollmentId)],
);

// ───────── บสต. / รท.101 และการติดตามหลังบำบัด (สเปก 14) ─────────

/** เลขประจำตัวในระบบภายนอก (บสต./รท.101) ต่อการลงทะเบียน */
export const externalIds = sqliteTable(
  "external_ids",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    /** bst | rt101 */
    system: text("system").notNull(),
    externalId: text("external_id").notNull(),
    ...tracking(),
  },
  (t) => [uniqueIndex("external_ids_unique").on(t.enrollmentId, t.system)],
);

/** งานลงระบบภายนอก — ระบบเตือนและเช็คว่าลงแล้วหรือยัง */
export const bstTasks = sqliteTable(
  "bst_tasks",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    system: text("system").notNull(),
    /** bst: register | screen | treat | discharge | followup1..4 · rt101: record (1 งานเมื่อครบหลักสูตร) */
    step: text("step").notNull(),
    dueDate: text("due_date"),
    /** pending | done | unfollowable | closed | cancelled */
    status: text("status").notNull().default("pending"),
    doneDate: text("done_date"),
    doneBy: integer("done_by"),
    reason: text("reason"),
    note: text("note"),
    ...tracking(),
  },
  (t) => [
    uniqueIndex("bst_tasks_unique").on(t.enrollmentId, t.system, t.step),
    index("bst_tasks_due_idx").on(t.status, t.dueDate),
  ],
);

/** กำหนดการติดตามหลังบำบัด เดือนที่ 1 3 6 12 */
export const followups = sqliteTable(
  "followups",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").notNull().references(() => enrollments.id),
    seq: integer("seq").notNull(),
    monthOffset: integer("month_offset").notNull(),
    dueDate: text("due_date").notNull(),
    /** pending | done | unfollowable | closed */
    status: text("status").notNull().default("pending"),
    doneDate: text("done_date"),
    /** phone | visit | referral */
    method: text("method"),
    urineResult: text("urine_result"),
    /** yes | no | unknown */
    relapse: text("relapse"),
    occupation: text("occupation"),
    note: text("note"),
    bstRecorded: integer("bst_recorded", { mode: "boolean" }).notNull().default(false),
    reason: text("reason"),
    ...tracking(),
  },
  (t) => [uniqueIndex("followups_unique").on(t.enrollmentId, t.seq), index("followups_due_idx").on(t.status, t.dueDate)],
);

// ───────── กล่องจดหมายเวร (สเปก 20) ─────────

export const shiftMessages = sqliteTable(
  "shift_messages",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    authorId: integer("author_id").notNull(),
    /** normal | important | red */
    level: text("level").notNull().default("normal"),
    body: text("body").notNull(),
    personId: integer("person_id"),
    /** เรื่องสุขภาพ → คนที่ไม่มีสิทธิ์เห็นแค่ "มีเรื่องสุขภาพ — ติดต่อพยาบาล" */
    healthRelated: integer("health_related", { mode: "boolean" }).notNull().default(false),
    /** next_shift | all | user | cohort (ทีมของรุ่น รวมผู้สอนกลุ่ม B ของรุ่นนั้น) */
    recipientType: text("recipient_type").notNull(),
    recipientUserId: integer("recipient_user_id"),
    recipientCohortId: integer("recipient_cohort_id"),
    needsAction: integer("needs_action", { mode: "boolean" }).notNull().default(false),
    dueDate: text("due_date"),
    /** open | done */
    status: text("status").notNull().default("open"),
    resolvedBy: integer("resolved_by"),
    resolvedAt: ts("resolved_at"),
    resolution: text("resolution"),
    overdueNotifiedAt: ts("overdue_notified_at"),
    ...tracking(),
  },
  (t) => [index("shift_messages_created_idx").on(t.createdAt)],
);

export const shiftMessageAcks = sqliteTable(
  "shift_message_acks",
  {
    messageId: integer("message_id").notNull().references(() => shiftMessages.id),
    userId: integer("user_id").notNull(),
    ackAt: ts("ack_at").notNull(),
  },
  (t) => [uniqueIndex("shift_acks_unique").on(t.messageId, t.userId)],
);

// ───────── บันทึกพฤติกรรมด่วน (สเปก 22B) ─────────

export const behaviorNotes = sqliteTable(
  "behavior_notes",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    enrollmentId: integer("enrollment_id").references(() => enrollments.id),
    incarcerationId: integer("incarceration_id").notNull().references(() => incarcerations.id),
    noteDate: text("note_date").notNull(),
    /** positive | negative | observe */
    tone: text("tone").notNull(),
    category: text("category"),
    text: text("text").notNull(),
    /** แปลงเป็นบันทึกวินัย/เครื่องมือบ้านแล้ว (ขั้น 5) */
    convertedTo: text("converted_to"),
    ...tracking(),
  },
  (t) => [index("behavior_notes_inc_idx").on(t.incarcerationId, t.noteDate)],
);
