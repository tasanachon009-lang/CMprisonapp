import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { DOC_TEMPLATES, DOC_VARIABLES, fillTemplate, unknownVariables } from "@/lib/docs/templates";
import { buildDocView, thaiDateRange, toThaiDigits, type DocInput } from "@/lib/docs/view";
import { docxOf } from "@/lib/docs/docx";
import { cohortVariables, createDocument, updateDocument, setDocumentStatus, deleteDocument, getDocument, listDocuments, saveTemplate, resetTemplate, effectiveTemplate, orgInfo } from "@/lib/services/documents";
import { ROLE_PERMISSIONS } from "@/lib/auth/permissions";

const org = { name: "เรือนจำทดสอบ", unitName: "สถานฟื้นฟูทดสอบ", address: "99 ถนนสมมติ\nอำเภอเมือง 50000", phone: "0 5300 0000", thaiNumerals: false };
const doc = (extra: Partial<DocInput> = {}): DocInput => ({ kind: "memo", docNo: "ยธ 0700/12", docDate: "2026-11-02", subject: "ขออนุมัติ", toLine: "ผู้บัญชาการ", refs: null, attachments: null, body: "ย่อหน้า 1\n\n  ย่อหน้า 2  \n1. รายการ", signerName: "นาง ก", signerTitle: "หัวหน้า", ...extra });

describe("เอกสารราชการ: ส่วนคำนวณล้วน (สเปก 18.4)", () => {
  it("เลขไทย และช่วงวันที่แบบหนังสือราชการ", () => {
    expect(toThaiDigits("รุ่นที่ 1/2570 จำนวน 50 คน")).toBe("รุ่นที่ ๑/๒๕๗๐ จำนวน ๕๐ คน");
    expect(thaiDateRange("2026-11-02", "2026-11-04")).toBe("2 – 4 พฤศจิกายน 2569");
    expect(thaiDateRange("2026-11-30", "2026-12-02")).toBe("30 พฤศจิกายน – 2 ธันวาคม 2569");
    expect(thaiDateRange("2026-12-30", "2027-01-04")).toBe("30 ธันวาคม 2569 – 4 มกราคม 2570");
    expect(thaiDateRange("2026-11-02", "2026-11-02")).toBe("2 พฤศจิกายน 2569");
  });

  it("แทนตัวแปร: ไม่มีค่า → ………… · ไม่รู้จัก → คงไว้ให้เห็น", () => {
    expect(fillTemplate("โครงการ{{หลักสูตร}} ณ {{ สถานที่ }} {{ไม่มีตัวนี้}}", { "หลักสูตร": "ก", "สถานที่": "" })).toBe("โครงการก ณ ………… {{ไม่มีตัวนี้}}");
    expect(unknownVariables("{{หลักสูตร}} {{ไม่มีตัวนี้}} {{ไม่มีตัวนี้}}")).toEqual(["ไม่มีตัวนี้"]);
    // แม่แบบเริ่มต้นทุกฉบับใช้เฉพาะตัวแปรที่ระบบรู้จัก
    for (const t of DOC_TEMPLATES) expect(unknownVariables(`${t.subject}\n${t.toLine}\n${t.body}`)).toEqual([]);
    expect(new Set(DOC_VARIABLES.map((v) => v.key)).size).toBe(DOC_VARIABLES.length);
  });

  it("โครงเอกสาร 3 รูปแบบ · วันที่เว้นว่างได้ · ย่อหน้าตัดบรรทัดว่าง", () => {
    const memo = buildDocView(doc(), org);
    expect([memo.heading, memo.closing, memo.dateText]).toEqual(["บันทึกข้อความ", "", "2 พฤศจิกายน 2569"]);
    expect(memo.orgLines).toEqual(["สถานฟื้นฟูทดสอบ เรือนจำทดสอบ โทร. 0 5300 0000"]);
    expect(memo.paragraphs).toEqual(["ย่อหน้า 1", "ย่อหน้า 2", "1. รายการ"]);
    const letter = buildDocView(doc({ kind: "letter", docDate: null, refs: "หนังสือ ก\nหนังสือ ข", attachments: "กำหนดการ" }), org);
    expect([letter.heading, letter.closing, letter.dateText]).toEqual(["", "ขอแสดงความนับถือ", ""]);
    expect(letter.orgLines).toEqual(["เรือนจำทดสอบ", "99 ถนนสมมติ", "อำเภอเมือง 50000"]);
    expect([letter.refs.length, letter.attachments, letter.contact]).toEqual([2, ["กำหนดการ"], ["สถานฟื้นฟูทดสอบ", "โทร. 0 5300 0000"]]);
    expect(buildDocView(doc({ kind: "order" }), org).heading).toBe("คำสั่งเรือนจำทดสอบ");
  });

  it("เลขไทย: แปลงทุกส่วนที่แสดง เมื่อเปิดใช้", () => {
    const v = buildDocView(doc(), { ...org, thaiNumerals: true });
    expect([v.docNo, v.dateText, v.paragraphs[0], v.orgLines[0]]).toEqual(["ยธ ๐๗๐๐/๑๒", "๒ พฤศจิกายน ๒๕๖๙", "ย่อหน้า ๑", "สถานฟื้นฟูทดสอบ เรือนจำทดสอบ โทร. ๐ ๕๓๐๐ ๐๐๐๐"]);
    expect(JSON.stringify(v)).not.toMatch(/[0-9]/);
  });

  it("ไฟล์ Word สร้างได้ทั้ง 3 รูปแบบ (มี/ไม่มีครุฑ)", async () => {
    for (const kind of ["memo", "letter", "order"] as const) {
      const buf = await docxOf(buildDocView(doc({ kind }), org), null);
      expect(buf.subarray(0, 2).toString()).toBe("PK");
      expect(buf.length).toBeGreaterThan(2000);
    }
  });

  it("สิทธิ์: ฟื้นฟูสร้าง/แก้ได้ · การเงินดูได้ · ผู้บริหาร/ผู้ช่วย/ผู้คุมไม่เห็น · แม่แบบแก้ได้เฉพาะผู้ดูแล", () => {
    expect(ROLE_PERMISSIONS.rehab).toEqual(expect.arrayContaining(["docs.view", "docs.manage"]));
    expect(ROLE_PERMISSIONS.rehab).not.toContain("docs.templates");
    expect(ROLE_PERMISSIONS.finance).toContain("docs.view");
    expect(ROLE_PERMISSIONS.finance).not.toContain("docs.manage");
    for (const r of ["executive", "assistant", "warden", "medical"] as const) expect(ROLE_PERMISSIONS[r].some((p) => p.startsWith("docs."))).toBe(false);
    expect(ROLE_PERMISSIONS.admin).toEqual(expect.arrayContaining(["docs.view", "docs.manage", "docs.templates"]));
  });
});

describe("เอกสารราชการ: สร้าง แก้ ล็อก ลบ และแม่แบบ", () => {
  let db: DB;
  let cohortId: number;
  const who = { userId: 1 };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    bootstrapReferenceData(db);
    db.insert(schema.users).values({ firstName: "หัวหน้า", lastName: "ทดสอบ", passwordHash: "x" }).run();
    const pre3 = db.select().from(schema.courses).where(eq(schema.courses.code, "PRE3")).get()!;
    cohortId = createCohort(db, { courseId: pre3.id, startDate: "2026-11-02", targetCount: 50, location: "หอประชุม" }, 1).id;
    setSetting(db, "org.headName", "นายผู้บัญชาการ สมมติ", 1);
    setSetting(db, "docs.unitHeadName", "นางหัวหน้า สมมติ", 1);
    setSetting(db, "docs.unitHeadTitle", "หัวหน้าสถานฟื้นฟูฯ", 1);
    setSetting(db, "org.docPrefix", "ยธ 0700/", 1);
  });

  it("สร้างจากแม่แบบ: เติมข้อมูลรุ่น ผู้ลงนาม และเลขที่นำหน้า · วันที่เว้นว่าง", () => {
    const d = createDocument(db, cohortId, "memo_run_approval", who);
    expect(d.subject).toMatch(/^ขออนุมัติจัดโครงการ.*รุ่นที่ 1\/2570$/);
    expect(d.body).toContain("หอประชุม");
    expect(d.body).toContain("จำนวน 50 คน");
    expect(d.body).toContain("รวม 3 วัน 15 ชั่วโมง");
    expect(d.body).not.toMatch(/\{\{/);
    expect([d.kind, d.status, d.docNo, d.docDate, d.signerName, d.signerTitle]).toEqual(["memo", "draft", "ยธ 0700/", null, "นางหัวหน้า สมมติ", "หัวหน้าสถานฟื้นฟูฯ"]);
    // ยังไม่ตั้งงบ → เว้นเป็น …………
    expect(d.body).toContain("จำนวน ………… บาท");
    const order = createDocument(db, cohortId, "order_committee", who);
    expect([order.docNo, order.signerName]).toEqual([null, "นายผู้บัญชาการ สมมติ"]);
    expect(() => createDocument(db, cohortId, "no_such", who)).toThrow(/ไม่พบแม่แบบ/);
    expect(listDocuments(db, cohortId).length).toBe(2);
  });

  it("ตัวแปรของรุ่นไม่มีชื่อผู้ต้องขัง (มีแต่จำนวน)", () => {
    registerEnrollment(db, { cohortId, person: { firstName: "ชื่อลับ", lastName: "สกุลลับ", nationalId: "1100000000016" }, incarceration: { inmateNo: "69-77777" }, intake: { exclusions: [], confirmations: ["sentence_remaining"] }, confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: "2026-10-01", acknowledgeWarnings: true }, { userId: 1, canOverride: false, consentRequired: false });
    const vars = cohortVariables(db, cohortId);
    expect(vars["จำนวนผู้เข้าอบรม"]).toBe("1");
    const all = JSON.stringify(vars);
    for (const w of ["ชื่อลับ", "สกุลลับ", "69-77777", "1100000000016"]) expect(all).not.toContain(w);
    expect(Object.keys(vars).sort()).toEqual(DOC_VARIABLES.map((v) => v.key).sort());
  });

  it("แก้ก่อนพิมพ์ · กันแก้ชนกัน · วันที่ผิดไม่รับ · เรื่อง/เนื้อความห้ามว่าง", () => {
    const d = createDocument(db, cohortId, "letter_invite_speaker", who);
    const edit = { subject: "ขอเชิญเป็นวิทยากร", toLine: "นายแพทย์สมมติ", body: "เนื้อความใหม่", docNo: "ยธ 0700/99", docDate: "2026-10-20", attachments: "กำหนดการ จำนวน 1 ฉบับ" };
    updateDocument(db, d.id, edit, who, d.version);
    const after = getDocument(db, d.id)!;
    expect([after.toLine, after.docDate, after.attachments, after.version]).toEqual(["นายแพทย์สมมติ", "2026-10-20", "กำหนดการ จำนวน 1 ฉบับ", 2]);
    expect(() => updateDocument(db, d.id, edit, who, 1)).toThrow(/โหลดหน้าใหม่/);
    expect(() => updateDocument(db, d.id, { ...edit, docDate: "2026-02-30" }, who)).toThrow(/วันที่/);
    expect(() => updateDocument(db, d.id, { ...edit, subject: " " }, who)).toThrow(/เรื่อง/);
    expect(() => updateDocument(db, d.id, { ...edit, body: "" }, who)).toThrow(/เนื้อความ/);
    updateDocument(db, d.id, { ...edit, docDate: null }, who);
    expect(getDocument(db, d.id)!.docDate).toBeNull();
  });

  it("ล็อกแล้วแก้/ลบไม่ได้ ต้องปลดล็อกก่อน · ลบแล้วไม่อยู่ในรายการ", () => {
    const d = createDocument(db, cohortId, "memo_run_approval", who);
    setDocumentStatus(db, d.id, "final", who);
    expect(() => updateDocument(db, d.id, { subject: "x", toLine: "", body: "y" }, who)).toThrow(/ล็อกแล้ว/);
    expect(() => deleteDocument(db, d.id, who)).toThrow(/ล็อกแล้ว/);
    setDocumentStatus(db, d.id, "draft", who);
    deleteDocument(db, d.id, who);
    expect(getDocument(db, d.id)).toBeNull();
    expect(listDocuments(db, cohortId)).toEqual([]);
    expect(() => updateDocument(db, d.id, { subject: "x", toLine: "", body: "y" }, who)).toThrow(/ไม่พบเอกสาร/);
  });

  it("แม่แบบที่ผู้ดูแลแก้: ใช้กับเอกสารใหม่ ไม่กระทบฉบับเดิม · คืนค่าเริ่มต้นได้", () => {
    const old = createDocument(db, cohortId, "memo_run_approval", who);
    saveTemplate(db, "memo_run_approval", { subject: "ขออนุมัติ {{รุ่น}}", toLine: "ผอ.", body: "ข้อความของหน่วยงาน {{หลักสูตร}}" }, who);
    expect(effectiveTemplate(db, "memo_run_approval")!.customized).toBe(true);
    const fresh = createDocument(db, cohortId, "memo_run_approval", who);
    expect([fresh.subject, fresh.toLine]).toEqual(["ขออนุมัติ รุ่นที่ 1/2570", "ผอ."]);
    expect(getDocument(db, old.id)!.subject).toBe(old.subject);
    expect(() => saveTemplate(db, "memo_run_approval", { subject: "", toLine: "", body: "x" }, who)).toThrow(/เรื่อง/);
    expect(() => saveTemplate(db, "nope", { subject: "a", toLine: "", body: "x" }, who)).toThrow(/ไม่พบแม่แบบ/);
    resetTemplate(db, "memo_run_approval", who);
    expect(effectiveTemplate(db, "memo_run_approval")!.customized).toBe(false);
  });

  it("ค่าเริ่มต้นใช้เลขไทย · ปิดได้ที่ตั้งค่า", () => {
    expect(orgInfo(db).thaiNumerals).toBe(true);
    setSetting(db, "docs.thaiNumerals", false, 1);
    expect(orgInfo(db).thaiNumerals).toBe(false);
  });
});
