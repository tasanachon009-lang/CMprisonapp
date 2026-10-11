import { describe, it, expect, beforeEach } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { eq } from "drizzle-orm";
import JSZip from "jszip";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData } from "@/lib/bootstrap";
import { createCohort } from "@/lib/services/cohorts";
import { registerEnrollment } from "@/lib/services/registry";
import { addStaff } from "@/lib/services/schedule";
import { collectWeekly, upsertDraft, upsertMonthlyDraft, approveWeekly, leadText, monthRange, type WeeklyData } from "@/lib/services/weekly-report";
import { reportModel, reportMemo, textLines, MEMO_MAX_LINES } from "@/lib/services/report-memo";
import { reportDocument } from "@/lib/services/report-doc";
import { buildDocView, structureBody } from "@/lib/docs/view";
import { docxOf } from "@/lib/docs/docx";

const org = { name: "เรือนจำกลางเชียงใหม่", unitName: "สถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด", address: "", phone: "053-000-000", thaiNumerals: true };

describe("ผู้รับผิดชอบและข้อความในรายงาน (สเปก 18.2B)", () => {
  it("แสดงผู้รับผิดชอบหลัก 1–2 คน ชื่อเต็มไม่ตัดคำ · เกิน 2 คนหรือคาบทั้งทีม = ทีมสหวิชาชีพ", () => {
    expect(leadText(["ฤตภาส ศรีสุวรรณ"], false)).toBe("ฤตภาส ศรีสุวรรณ");
    expect(leadText(["ฤตภาส ศรีสุวรรณ", "กนกวรรณ ใจดี"], false)).toBe("ฤตภาส ศรีสุวรรณ และ กนกวรรณ ใจดี");
    expect(leadText(["ก ข", "ค ง", "จ ฉ"], false)).toBe("ทีมสหวิชาชีพ");
    expect(leadText(["ก ข"], true)).toBe("ทีมสหวิชาชีพ");
    expect(leadText(["ก ข", "ก ข", " "], false)).toBe("ก ข");
    expect(leadText([], false)).toBe("-");
  });

  it("ข้อความหลายบรรทัด: ตัดเครื่องหมายนำหน้า และรวมบรรทัดที่ซ้ำกัน", () => {
    expect(textLines("• ห้องร้อน\n- ห้องร้อน\n\n  ขาดวัสดุ ")).toEqual(["ห้องร้อน", "ขาดวัสดุ"]);
    expect(textLines(null)).toEqual([]);
  });
});

describe("แม่แบบบันทึกข้อความกลาง (สเปก 18.3A)", () => {
  const doc = { kind: "memo" as const, docNo: "ยธ 0768/123", docDate: "2026-10-11", subject: "ทดสอบ", toLine: "ผู้บัญชาการเรือนจำกลางเชียงใหม่", refs: null, attachments: null, body: "ย่อหน้าเหตุ\n# หัวข้อแรก\n- รายการ 1\n# หัวข้อสอง\n1. ข้อเดิมของแม่แบบ\nจึงเรียนมาเพื่อโปรดทราบ", signerName: "นางทดสอบ ระบบ", signerTitle: "หัวหน้า", endorsements: [{ heading: "ความเห็น", title: "ผู้อำนวยการสถานพยาบาล" }, { heading: "ทราบ / ข้อสั่งการ", name: "นายอำนวย", title: "ผู้บัญชาการ" }] };

  it("หัวข้อย่อยใส่เลขให้เอง (เลขไทยตามตั้งค่า) · รายการ · ย่อหน้า · ช่องความเห็นตามสายลงนาม", () => {
    const v = buildDocView(doc, org);
    expect(v.heading).toBe("บันทึกข้อความ");
    expect(v.orgLines[0]).toBe("สถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด เรือนจำกลางเชียงใหม่ โทร. ๐๕๓-๐๐๐-๐๐๐");
    expect(v.dateText).toBe("๑๑ ตุลาคม ๒๕๖๙");
    expect(v.parts.map((p) => [p.type, p.text])).toEqual([["text", "ย่อหน้าเหตุ"], ["heading", "๑. หัวข้อแรก"], ["item", "รายการ ๑"], ["heading", "๒. หัวข้อสอง"], ["list", "๑. ข้อเดิมของแม่แบบ"], ["text", "จึงเรียนมาเพื่อโปรดทราบ"]]);
    expect(v.endorsements).toEqual([{ heading: "ความเห็น", name: "", title: "ผู้อำนวยการสถานพยาบาล" }, { heading: "ทราบ / ข้อสั่งการ", name: "นายอำนวย", title: "ผู้บัญชาการ" }]);
    expect(structureBody(["# ก", "# ข"], false).map((p) => p.text)).toEqual(["1. ก", "2. ข"]);
    // หนังสือภายนอกไม่มีช่องความเห็น
    expect(buildDocView({ ...doc, kind: "letter" }, org).endorsements).toEqual([]);
  });

  it("Word: โครงเดียวกับหน้าพิมพ์ — ฟอนต์ TH Sarabun New · ขอบ 3/2/1.5/2 ซม. · จัดตำแหน่งด้วยแท็บ/ตาราง ไม่เคาะเว้นวรรค · หน้าแรกไม่มีเลขหน้า · สิ่งที่ส่งมาด้วยขึ้นหน้าใหม่", async () => {
    const buf = await docxOf(buildDocView(doc, org), null, { title: "สิ่งที่ส่งมาด้วย", subject: "ทดสอบ", blocks: [{ heading: "1. ตาราง", table: { head: ["ก", "ข"], rows: [["1", "2"]] } }] });
    const zip = await JSZip.loadAsync(buf);
    const xml = await zip.file("word/document.xml")!.async("string");
    expect(xml).toContain("บันทึกข้อความ");
    expect(xml).toContain("TH Sarabun New");
    expect(xml).toMatch(/w:sz w:val="58"/); // 29 pt
    expect(xml).toMatch(/w:sz w:val="40"/); // 20 pt หัวข้อ ส่วนราชการ/ที่/วันที่/เรื่อง
    expect(xml).toMatch(/<w:pgMar[^>]*w:top="851"[^>]*w:right="1134"[^>]*w:bottom="1134"[^>]*w:left="1701"/);
    expect(xml).toMatch(/w:firstLine="1418"/); // ย่อหน้า 2.5 ซม.
    expect(xml).toContain("<w:titlePg/>");
    expect(xml).toContain("<w:pageBreakBefore/>");
    expect(xml).toContain("สิ่งที่ส่งมาด้วย");
    expect(xml).toMatch(/w:u w:val="dotted"/); // เส้นจุดใต้ข้อความหัวบันทึก (ขีดเส้นใต้ + แท็บ ไม่ใช่เส้นลอย)
    expect(xml.match(/<v:line /g) ?? []).toEqual([]);
    expect(xml).toContain("<w:tab/>");
    expect(xml).not.toMatch(/ {4,}/); // ไม่ใช้การเคาะเว้นวรรคจัดตำแหน่ง
    expect(xml).toContain("๑. หัวข้อแรก");
    // ใช้ไฟล์ต้นแบบจริงเป็นฐาน: ครุฑ + บรรทัดหัวจากต้นแบบ · ฟอนต์ทั้งไฟล์เป็น TH Sarabun New · ไม่มีเลขที่ตัวอย่างของต้นแบบ
    expect(xml).toMatch(/<v:imagedata r:id="rId\d+"/);
    expect(xml).toMatch(/w:tab w:val="left" w:pos="3600"/); // แท็บของ "บันทึกข้อความ" ตามต้นแบบ
    expect(xml).toMatch(/w:pos="4500"/); // แท็บ "วันที่" 7.94 ซม.
    expect(xml).toMatch(/w:pos="9000"/); // ปลายเส้นจุด 15.88 ซม.
    expect(xml).toContain('w:header="1418"');
    expect(xml).toContain('w:fmt="thaiNumbers"');
    expect(xml).not.toContain("TH SarabunPSK");
    expect(xml).not.toContain("นร ๐๑๐๔");
    expect(xml).not.toContain("กกกก");
    expect(xml).toContain("ยธ ๐๗๖๘/๑๒๓");
    expect(Object.keys(zip.files)).toContain("word/media/image1.png");
    for (const n of ["word/styles.xml", "word/header2.xml"]) expect(await zip.file(n)!.async("string")).not.toContain("TH SarabunPSK");
    // ตั้งค่าเลขอารบิก: เลขหน้าและตัวเลขในเอกสารเป็นอารบิก · ไม่ตั้งเลขที่หนังสือ = ไม่มีข้อความ (เหลือเส้นจุดให้เขียนเอง)
    const arabic = await JSZip.loadAsync(await docxOf(buildDocView({ ...doc, docNo: null }, { ...org, thaiNumerals: false }), null));
    const ax = await arabic.file("word/document.xml")!.async("string");
    expect(ax).toContain('w:fmt="decimal"');
    expect(ax).toContain("1. หัวข้อแรก");
    expect(ax).toContain("11 ตุลาคม 2569");
    expect(ax).not.toMatch(/[๐-๙]/);
    const header = await Promise.all(Object.keys(zip.files).filter((n) => /word\/header\d\.xml/.test(n)).map((n) => zip.file(n)!.async("string")));
    expect(header.some((h) => h.includes("PAGE"))).toBe(true);
  });
});

describe("รายงานประจำสัปดาห์/เดือน 2 ชั้น (สเปก 18.2B)", () => {
  let db: DB;
  let head: number, cohortId: number;
  const monday = "2026-10-05";
  const sessions = () => db.select().from(schema.cohortSessions).where(eq(schema.cohortSessions.cohortId, cohortId)).all();
  const report = (s: { id: number }, v: Partial<typeof schema.sessionReports.$inferInsert>) => {
    db.insert(schema.sessionReports).values({ sessionId: s.id, outcome: "planned", createdBy: head, ...v }).run();
    db.update(schema.cohortSessions).set({ taughtAt: new Date(), status: "done" }).where(eq(schema.cohortSessions.id, s.id)).run();
  };

  beforeEach(() => {
    db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    head = db.insert(schema.users).values({ prefix: "นาง", firstName: "หัวหน้า", lastName: "ทดสอบ", position: "พยาบาลวิชาชีพชำนาญการ", passwordHash: "x" }).returning().get().id;
    for (const n of ["ฤตภาส", "กนกวรรณ", "ธนพล"]) db.insert(schema.users).values({ firstName: n, lastName: "นามสกุลยาวมาก", passwordHash: "x" }).run();
    bootstrapReferenceData(db);
    const b12 = db.select().from(schema.courses).where(eq(schema.courses.code, "B12")).get()!.id;
    cohortId = createCohort(db, { courseId: b12, startDate: monday }, head).id;
    registerEnrollment(db, { cohortId, person: { firstName: "สมชายลับ", lastName: "ห้ามปรากฏ", nationalId: null }, incarceration: { inmateNo: "69-12345" }, confirmAdmission: true, consentSigned: true, consentDate: "2026-10-01", enrolledDate: monday }, { userId: head, canOverride: false, consentRequired: false });
    const day = (n: number) => sessions().filter((x) => x.dayNo === n).sort((a, b) => a.startTime.localeCompare(b.startTime));
    // วันที่ 4: 3 คาบปกติ ข้อความสรุปเดียวกัน · 1 คาบทำบางส่วน · วันที่ 3: 1 คาบไม่ได้ทำ + 1 คาบมีเหตุการณ์ · ที่เหลือยังไม่บันทึกผล
    const d4 = day(4);
    for (const s of d4.slice(0, 3)) report(s, { summary: "ผู้เข้าอบรมให้ความร่วมมือดี", participants: 1 });
    report(d4[3], { outcome: "partial", summary: "ทำได้ครึ่งหนึ่ง", reason: "ไฟฟ้าดับ" });
    const d3 = day(3);
    report(d3[0], { outcome: "not_done", reason: "วิทยากรป่วย" }); // ประชุมเช้า = คาบทั้งทีม
    report(d3[2], { issues: "ห้องอบรมร้อน ขอพัดลมเพิ่ม" });
    addStaff(db, d3[2].id, { userId: head, role: "lead" }, { userId: head });
    for (const u of [2, 3]) addStaff(db, d4[3].id, { userId: u }, { userId: head }, { acknowledgeConflict: true });
  });

  it("รวบรวม: ผู้รับผิดชอบหลัก · % เข้าร่วมรายรุ่น · ไม่มีชื่อผู้ต้องขัง", () => {
    const d = collectWeekly(db, monday);
    const a = d.activities.find((x) => x.issues)!;
    expect(a.lead).toBe("หัวหน้า ทดสอบ");
    expect(d.activities.find((x) => x.outcome === "partial")!.lead).toBe("ฤตภาส นามสกุลยาวมาก และ กนกวรรณ นามสกุลยาวมาก"); // ชื่อเต็ม ไม่ตัดคำ
    expect(d.activities.find((x) => x.outcome === "not_done")!.lead).toBe("ทีมสหวิชาชีพ");
    expect(d.overview.cohorts[0]).toMatchObject({ id: cohortId, enrolled: 1 });
    expect(JSON.stringify(d)).not.toMatch(/สมชายลับ|69-12345/);
  });

  it("แบบจำลองรายงาน: รายละเอียดเฉพาะคาบที่ต่างจากแผน/มีเหตุการณ์ · คาบปกติสรุปเป็นตัวเลขและรวมข้อความซ้ำ · คาบที่ยังไม่บันทึกผลเป็นตัวเลขต่อรุ่น", () => {
    const m = reportModel(collectWeekly(db, monday));
    expect(m.exceptions.map((e) => [e.result, e.detail]).sort()).toEqual([["ตามแผน", "ห้องอบรมร้อน ขอพัดลมเพิ่ม"], ["บางส่วน", "ไฟฟ้าดับ · ทำได้ครึ่งหนึ่ง"], ["ไม่ได้ทำ", "วิทยากรป่วย"]].sort());
    expect(m.normalByCohort).toEqual([{ label: m.cohorts[0].label, sessions: 3, avgParticipants: 1, summaries: [{ text: "ผู้เข้าอบรมให้ความร่วมมือดี", n: 3 }] }]);
    const c = m.cohorts[0];
    expect([c.done, c.notDone, c.events]).toEqual([5, 1, 1]);
    expect(c.unrecorded).toBe(m.unrecordedList.length);
    expect(c.unrecorded).toBeGreaterThan(10);
    expect(c.planned).toBe(c.done + c.notDone + c.unrecorded);
    expect(m.unrecordedList.every((u) => typeof u.sessionId === "number")).toBe(true);
  });

  it("บันทึกข้อความ: สรุปสั้น ไม่มีตาราง ไม่ไล่รายการคาบ · ปัญหา/แผนเกิน 3 เรื่องย้ายไปสิ่งที่ส่งมาด้วย · สิ่งที่ส่งมาด้วยไม่ไล่คาบที่ยังไม่บันทึกผล", () => {
    const m = reportModel(collectWeekly(db, monday));
    const { doc, annex } = reportMemo(m, { issues: "• ก\n• ข\n• ค\n• ง\n• ก", nextPlan: "แผน 1", note: null }, { unitName: org.unitName, toLine: "ผู้บัญชาการ", signerName: null, signerTitle: null, docDate: null, endorsements: [] });
    expect(doc.kind).toBe("memo");
    expect(doc.subject).toBe("รายงานผลการดำเนินงานประจำสัปดาห์ ระหว่างวันที่ 5 – 11 ตุลาคม 2569");
    const lines = doc.body.split("\n");
    expect(lines.filter((l) => l.startsWith("# "))).toEqual(["# สรุปผลการดำเนินงาน", "# ปัญหา อุปสรรค และข้อเสนอแนะ", "# แผนการดำเนินงานสัปดาห์ถัดไป"]);
    expect(lines.at(-1)).toBe("จึงเรียนมาเพื่อโปรดทราบ");
    expect(lines.length).toBeLessThanOrEqual(16); // อยู่ใน 1 หน้า
    expect(lines.filter((l) => /^- [กขคง]$/.test(l)).length).toBe(MEMO_MAX_LINES);
    expect(doc.body).toContain("รายการอื่นอีก 1 รายการ ตามสิ่งที่ส่งมาด้วย");
    expect(doc.body).toMatch(/จัดกิจกรรม 5\/\d+ คาบ/);
    expect(doc.body).toMatch(/ยังไม่บันทึกผล \d+ คาบ/);
    expect(doc.body).not.toMatch(/บสต\.|งบประมาณ/); // ตัวเลข บสต./งบ อยู่ในสิ่งที่ส่งมาด้วย
    for (const title of ["ทบทวนจิตตนเอง", "ประชุมเช้า", "วิทยากรป่วย"]) expect(doc.body).not.toContain(title);
    // สิ่งที่ส่งมาด้วย
    expect(annex.blocks.map((b) => b.heading?.replace(/\s*\(.*$/, ""))).toEqual(["1. สรุปรายรุ่น", "2. กิจกรรมที่ต่างจากแผน ไม่ได้จัด หรือมีเหตุการณ์", "3. กิจกรรมที่จัดตามแผน", "4. ผลการประเมินและพฤติกรรม", "5. บสต. รท.101 ค่าตอบแทน และงบประมาณ", "6. ปัญหา อุปสรรค และข้อเสนอแนะ"]);
    expect(annex.blocks[1].table!.rows.length).toBe(3);
    expect(annex.blocks[1].table!.rows.find((r) => r[4] === "ไม่ได้ทำ")![3]).toBe("ทีมสหวิชาชีพ");
    expect(annex.blocks[2].lines!.filter((l) => l.includes("ผู้เข้าอบรมให้ความร่วมมือดี"))).toEqual(["   ผลที่บันทึก: ผู้เข้าอบรมให้ความร่วมมือดี (3 คาบ)"]);
    const all = JSON.stringify(annex);
    expect(annex.blocks.flatMap((b) => b.table?.rows ?? []).some((r) => r.includes("ยังไม่บันทึกผล"))).toBe(false);
    expect(all).not.toMatch(/สมชายลับ|69-12345/);
  });

  it("อนุมัติ: มีคาบที่ยังไม่บันทึกผลต้องยืนยันก่อน และบันทึกในประวัติ · เอกสารลงชื่อผู้อนุมัติ + ช่องความเห็นตามสายลงนาม", () => {
    const r = upsertDraft(db, monday, head);
    expect(() => approveWeekly(db, r.id, { userId: head })).toThrow(/ยังมีคาบที่ไม่ได้บันทึกผล \d+ คาบ/);
    approveWeekly(db, r.id, { userId: head }, { acknowledgeUnrecorded: true });
    const saved = db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, r.id)).get()!;
    expect(saved.status).toBe("approved");
    expect(db.select().from(schema.auditLogs).where(eq(schema.auditLogs.entity, "weekly_report")).all().some((a) => /เสนอทั้งที่ยังไม่บันทึกผล/.test(a.note ?? ""))).toBe(true);
    const { view, annex } = reportDocument(db, saved);
    expect(view.signerName).toBe("นางหัวหน้า ทดสอบ");
    expect(view.signerTitle).toBe("พยาบาลวิชาชีพชำนาญการ");
    expect(view.toLine).toBe("ผู้บัญชาการเรือนจำกลางเชียงใหม่ (ผ่านผู้อำนวยการสถานพยาบาล)");
    expect(view.endorsements.map((e) => e.heading)).toEqual(["ความเห็นผู้อำนวยการสถานพยาบาล", "ทราบ / ข้อสั่งการ"]);
    expect(view.parts[1]).toEqual({ type: "heading", text: "๑. สรุปผลการดำเนินงาน" });
    expect(annex.title).toBe("สิ่งที่ส่งมาด้วย");
  });

  it("รายงานประจำเดือน: ใช้โครงเดียวกัน · อยู่ร่วมกับรายงานสัปดาห์ที่เริ่มวันเดียวกันได้ · รายงานรุ่นเดิมที่ไม่มีช่องใหม่ยังเปิดได้", () => {
    expect(monthRange("2026-10")).toEqual(["2026-10-01", "2026-10-31"]);
    expect(() => monthRange("2026-13")).toThrow(/เดือน/);
    const mo = upsertMonthlyDraft(db, "2026-10", head);
    expect([mo.kind, mo.weekStart, mo.periodEnd]).toEqual(["monthly", "2026-10-01", "2026-10-31"]);
    expect(upsertMonthlyDraft(db, "2026-10", head).id).toBe(mo.id);
    // เดือนที่วันที่ 1 เป็นวันจันทร์: รายงานสัปดาห์และเดือนเริ่มวันเดียวกัน
    const w = upsertDraft(db, "2026-06-01", head), m6 = upsertMonthlyDraft(db, "2026-06", head);
    expect(w.id).not.toBe(m6.id);
    const { view } = reportDocument(db, db.select().from(schema.weeklyReports).where(eq(schema.weeklyReports.id, mo.id)).get()!);
    expect(view.subject).toBe("รายงานผลการดำเนินงานประจำเดือนตุลาคม ๒๕๖๙");
    expect(view.parts.some((p) => p.text === "๓. แผนการดำเนินงานเดือนถัดไป")).toBe(true);
    // ข้อมูลรุ่นเดิม: ไม่มี lead / outcome / issues / kind / attendancePct
    const old = JSON.parse(JSON.stringify(collectWeekly(db, monday))) as Record<string, unknown> & { activities: Array<Record<string, unknown>>; overview: { cohorts: Array<Record<string, unknown>> } };
    delete old.kind;
    for (const a of old.activities) { delete a.lead; delete a.outcome; delete a.issues; delete a.sessionId; a.staff = "ก นามสกุล, ข นามสกุล, ค นามสกุล"; }
    for (const c of old.overview.cohorts) { delete c.attendancePct; delete c.id; }
    const m = reportModel(old as unknown as WeeklyData);
    expect(m.kind).toBe("weekly");
    expect(m.exceptions.every((e) => e.lead === "ทีมสหวิชาชีพ")).toBe(true);
    expect(m.exceptions.map((e) => e.result).sort()).toEqual(["บางส่วน", "ไม่ได้ทำ"]);
  });
});
