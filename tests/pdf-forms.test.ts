import { describe, it, expect } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { PDFDocument } from "pdf-lib";
import { openDatabase, runMigrations, schema, type DB } from "@/lib/db";
import { bootstrapReferenceData, setSetting } from "@/lib/bootstrap";
import { createPdf, widthMM } from "@/lib/pdf/core";
import { drawKtb } from "@/lib/pdf/ktb";
import { drawVoucher, voucherCapacity } from "@/lib/pdf/voucher";
import { drawSummary } from "@/lib/pdf/report";
import { printOffsets } from "@/lib/pdf/offsets";
import ktbLayout from "@/lib/pdf/layouts/ktb.json";
import type { Payee } from "@/lib/services/pay-docs";

const payee = (n: number, extra: Partial<Payee> = {}): Payee => ({
  key: "i1", kind: "external", userId: null, instructorId: 1, prefix: "นาง", firstName: "สมศรี", lastName: "ใจดี", fullName: "นางสมศรี ใจดี", position: null, organization: null,
  nationalId: "1101700230705", phone: "0812345678", email: "a@example.com",
  addr: { houseNo: "99/1", moo: "3", soi: null, road: "ห้วยแก้ว", subdistrict: "สุเทพ", district: "เมืองเชียงใหม่", province: "เชียงใหม่", postcode: "50200" },
  payeeType: "person", companyName: null, bank: "ธนาคารกรุงไทย", bankBranch: "นิมมานเหมินท์", accountType: "savings", accountName: "นางสมศรี ใจดี", accountNo: "1234567890", notifyChannel: "sms",
  missing: [], updatedAt: null, grossSatang: n * 120000, taxSatang: 0, netSatang: n * 120000, sessions: n, hours: n * 2, firstDate: "2026-10-01",
  lines: Array.from({ length: n }, (_, i) => ({ sessionId: i, cohortId: 1, staffId: i, key: "i1", name: "", kind: "external" as const, userId: null, instructorId: 1, date: "2026-10-01", startTime: "09:00", title: i % 5 === 0 ? "การจัดการอารมณ์ (โกรธ รับรู้ความเครียด ลดความเครียด) และการฟื้นฟูสัมพันธภาพในครอบครัว" : "ทักษะการปฏิเสธ", hours: 2, factor: 1, splitMethod: "full" as const, rateId: 1, perHourSatang: 60000, grossSatang: 120000, capCutSatang: 0, amountSatang: 120000, payable: true, note: null })),
  ...extra,
});
const vctx = { orgName: "เรือนจำกลางเชียงใหม่", project: "ปรับเปลี่ยนพฤติกรรม 12 วัน รุ่นที่ 1/2570", corner: "เอกสารหมายเลข ๑", payerName: "", date: "2026-10-19" as string | null };

describe("แบบฟอร์มการเงิน PDF (pdf-lib วางตามพิกัด — สเปก 22)", () => {
  it("ใบสำคัญรับเงิน: หน้าเดียวเมื่อรายการน้อย · หลายหน้าเมื่อรายการมาก (ยอดยกไป/ยกมา) · PDF เปิดได้", async () => {
    const pdf = await createPdf();
    expect(await drawVoucher(pdf, payee(3), vctx)).toBe(1);
    const many = await drawVoucher(pdf, payee(60, { taxSatang: 216000, netSatang: 60 * 120000 - 216000 }), { ...vctx, date: null });
    expect(many).toBeGreaterThan(2);
    const doc = await PDFDocument.load(await pdf.doc.save());
    expect(doc.getPageCount()).toBe(1 + many);
    const cap = voucherCapacity();
    expect(cap.single).toBeGreaterThanOrEqual(8);
    expect(cap.middle).toBeGreaterThan(cap.first);
  });

  it("แบบ KTB: 1 หน้าบนพื้นหลังต้นฉบับ · ไม่ใส่วันที่ได้ · ข้อความไทยวัดความกว้างได้ (ฝังฟอนต์ TH Sarabun New)", async () => {
    const pdf = await createPdf();
    await drawKtb(pdf, payee(1), { orgName: "เรือนจำกลางเชียงใหม่", headTitle: "ผู้บัญชาการเรือนจำกลางเชียงใหม่", date: null });
    await drawKtb(pdf, payee(1, { payeeType: "company", companyName: "บริษัท ตัวอย่าง จำกัด", notifyChannel: "both" }), { orgName: "เรือนจำกลางตัวอย่าง", headTitle: "ผู้บัญชาการเรือนจำกลางตัวอย่าง", date: "2026-10-19" });
    const doc = await PDFDocument.load(await pdf.doc.save());
    expect(doc.getPageCount()).toBe(2);
    expect(widthMM(pdf.regular, "ผู้บัญชาการเรือนจำกลางเชียงใหม่", 16)).toBeCloseTo(49.4, 0); // ตรงกับต้นฉบับ (pdfjs วัดได้ 49.4 มม.)
    expect(ktbLayout.idBoxes.count).toBe(13);
  });

  it("สรุปใหญ่หลายหน้าเมื่อคนมาก · ค่าปรับตำแหน่งถูกจำกัด ±15 มม.", async () => {
    const pdf = await createPdf();
    const people = Array.from({ length: 40 }, (_, i) => ({ ...payee(1), key: `i${i}`, fullName: `วิทยากร ${i}` }));
    expect(await drawSummary(pdf, people, { project: "x", orgName: "y", unitName: "", total: 40 * 120000, batch: { dateFrom: "2026-10-01", dateTo: "2026-10-19" } })).toBeGreaterThan(1);
    const db = drizzle(openDatabase(":memory:"), { schema }) as DB;
    runMigrations(db);
    db.insert(schema.users).values({ firstName: "a", lastName: "b", passwordHash: "x" }).run();
    bootstrapReferenceData(db);
    expect(printOffsets(db).ktb).toEqual({ dx: 0, dy: 0 });
    setSetting(db, "print.offsets", { ktb: { dx: 99, dy: -2.5 } }, 1);
    expect(printOffsets(db)).toMatchObject({ ktb: { dx: 15, dy: -2.5 }, voucher: { dx: 0, dy: 0 } });
  });
});
