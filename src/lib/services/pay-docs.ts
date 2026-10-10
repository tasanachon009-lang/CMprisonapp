import { and, eq, inArray } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { writeAudit } from "../audit";
import { RuleError } from "../errors";
import { getSetting } from "../bootstrap";
import { readiness } from "../instructor-rules";
import { personTotals, type PayLine } from "../pay/calc";
import { batchView, getBatch } from "./pay";
import { cohortLabel } from "./cohorts";

/**
 * เอกสารการเงิน (สเปก 11.5C ใบสำคัญรับเงิน · 11.5D แบบแจ้งรับเงินโอน KTB · ชุดเอกสารส่งการเงิน)
 * ใช้เฉพาะรอบเบิกที่อนุมัติแล้ว (ยอดคงที่) · ตรวจยอดตรงกันทุกจุดก่อนพิมพ์ · ติดตามสถานะพิมพ์/เซ็นรับรายใบ
 */

export type Payee = {
  key: string; kind: "internal" | "external"; userId: number | null; instructorId: number | null;
  prefix: string; firstName: string; lastName: string; fullName: string; position: string | null; organization: string | null;
  nationalId: string | null; phone: string | null; email: string | null;
  addr: { houseNo: string | null; moo: string | null; soi: string | null; road: string | null; subdistrict: string | null; district: string | null; province: string | null; postcode: string | null };
  payeeType: "person" | "company"; companyName: string | null; bank: string | null; bankBranch: string | null; accountType: string | null; accountName: string | null; accountNo: string | null;
  notifyChannel: string | null;
  missing: string[];
  /** แก้ข้อมูลวิทยากรล่าสุด (ใช้เตือนว่าต้องพิมพ์ใหม่) */
  updatedAt: Date | null;
  lines: PayLine[]; grossSatang: number; taxSatang: number; netSatang: number; sessions: number; hours: number; firstDate: string;
};

export function docContext(db: DB, batchId: number) {
  const b = getBatch(db, batchId);
  const c = db.select({ c: schema.cohorts, course: schema.courses }).from(schema.cohorts).innerJoin(schema.courses, eq(schema.courses.id, schema.cohorts.courseId)).where(eq(schema.cohorts.id, b.cohortId)).get()!;
  return {
    batch: b,
    cohort: c.c,
    course: c.course,
    orgName: getSetting<string>(db, "org.name", ""),
    unitName: getSetting<string>(db, "org.unitName", ""),
    headTitle: getSetting<string>(db, "org.headTitle", ""),
    payerName: getSetting<string>(db, "docs.payerName", ""),
    corner: getSetting<string>(db, "docs.voucherCorner", ""),
    showKtb: getSetting<boolean>(db, "docs.showKtbForm", true) !== false,
    ktb: getSetting<{ intro: string; companyNote: string }>(db, "docs.ktbTemplate", { intro: "", companyNote: "" }),
    project: `${c.course.name} ${cohortLabel(c.c)}`,
  };
}

/** ผู้รับเงินในรอบ (ยอดจากรายการที่อนุมัติแล้ว) + ข้อมูลเติมเอกสาร + ความครบของข้อมูล */
export function payees(db: DB, batchId: number, opts: { order?: "name" | "first"; who?: "all" | "internal" | "external"; keys?: string[] } = {}): Payee[] {
  const v = batchView(db, batchId);
  if (v.batch.status !== "approved") throw new RuleError("พิมพ์เอกสารการเงินได้เฉพาะรอบเบิกที่อนุมัติแล้ว");
  const totals = personTotals(v.lines, v.tax);
  const userIds = totals.map((t) => t.userId).filter((x): x is number => !!x);
  const insIds = totals.map((t) => t.instructorId).filter((x): x is number => !!x);
  const users = new Map(userIds.length ? db.select().from(schema.users).where(inArray(schema.users.id, userIds)).all().map((u) => [u.id, u]) : []);
  const insById = new Map(insIds.length ? db.select().from(schema.instructors).where(inArray(schema.instructors.id, insIds)).all().map((i) => [i.id, i]) : []);
  const insByUser = new Map(userIds.length ? db.select().from(schema.instructors).where(inArray(schema.instructors.userId, userIds)).all().map((i) => [i.userId!, i]) : []);
  let out = totals.map((t): Payee => {
    const u = t.userId ? users.get(t.userId) : undefined;
    const ins = t.instructorId ? insById.get(t.instructorId) : t.userId ? insByUser.get(t.userId) : undefined;
    const prefix = (u?.prefix ?? ins?.prefix ?? "") || "";
    const firstName = u?.firstName ?? ins?.firstName ?? t.name;
    const lastName = u?.lastName ?? ins?.lastName ?? "";
    const lines = v.lines.filter((l) => l.key === t.key);
    const fields = {
      kind: t.kind, prefix, firstName, lastName, nationalId: ins?.nationalId, phone: ins?.phone, email: ins?.email,
      addrHouseNo: ins?.addrHouseNo, addrSubdistrict: ins?.addrSubdistrict, addrDistrict: ins?.addrDistrict, addrProvince: ins?.addrProvince, addrPostcode: ins?.addrPostcode,
      payeeType: ins?.payeeType, companyName: ins?.companyName, bank: ins?.bank, bankBranch: ins?.bankBranch, accountType: ins?.accountType, accountName: ins?.accountName, accountNo: ins?.accountNo,
      notifyChannel: ins?.notifyChannel, bankBookReceived: ins?.bankBookReceived,
    };
    const missing = ins ? readiness({ ...fields, displayName: `${firstName}${lastName}` }).missing : ["ยังไม่มีข้อมูลในทะเบียนวิทยากร (เลขบัตร ที่อยู่ บัญชี)"];
    if (!ins?.phone) missing.push("เบอร์โทรศัพท์");
    const latest = [u?.updatedAt, ins?.updatedAt].filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      key: t.key, kind: t.kind, userId: t.userId, instructorId: ins?.id ?? t.instructorId, prefix, firstName, lastName, fullName: `${prefix}${firstName} ${lastName}`.trim(),
      position: u?.position ?? ins?.position ?? null, organization: ins?.organization ?? null,
      nationalId: ins?.nationalId ?? null, phone: ins?.phone ?? null, email: ins?.email ?? null,
      addr: { houseNo: ins?.addrHouseNo ?? null, moo: ins?.addrMoo ?? null, soi: ins?.addrSoi ?? null, road: ins?.addrRoad ?? null, subdistrict: ins?.addrSubdistrict ?? null, district: ins?.addrDistrict ?? null, province: ins?.addrProvince ?? null, postcode: ins?.addrPostcode ?? null },
      payeeType: ins?.payeeType === "company" ? "company" : "person", companyName: ins?.companyName ?? null, bank: ins?.bank ?? null, bankBranch: ins?.bankBranch ?? null,
      accountType: ins?.accountType ?? null, accountName: ins?.accountName ?? null, accountNo: ins?.accountNo ?? null, notifyChannel: ins?.notifyChannel ?? null,
      missing, updatedAt: latest,
      lines, grossSatang: t.grossSatang, taxSatang: t.taxSatang, netSatang: t.netSatang, sessions: t.sessions, hours: t.hours, firstDate: lines[0]?.date ?? "",
    };
  });
  if (opts.who === "internal" || opts.who === "external") out = out.filter((p) => p.kind === opts.who);
  if (opts.keys?.length) out = out.filter((p) => opts.keys!.includes(p.key));
  out.sort(opts.order === "first" ? (a, b) => a.firstDate.localeCompare(b.firstDate) || a.firstName.localeCompare(b.firstName, "th") : (a, b) => a.firstName.localeCompare(b.firstName, "th") || a.lastName.localeCompare(b.lastName, "th"));
  return out;
}

/**
 * ตรวจก่อนพิมพ์ (สเปก 11.5D): ยอดรวมในสรุปใหญ่ = ผลรวมใบสำคัญรับเงินทุกใบ = ผลรวมรายคาบ = ยอดที่อนุมัติ
 * ไม่ตรง → ห้ามพิมพ์และบอกจุดผิด
 */
export function reconcile(batch: { totalSatang: number | null }, people: Payee[], allLines: PayLine[], filtered: boolean) {
  const issues: string[] = [];
  const voucherSum = people.reduce((a, p) => a + p.lines.reduce((x, l) => x + l.amountSatang, 0), 0);
  const summarySum = people.reduce((a, p) => a + p.grossSatang, 0);
  const lineSum = allLines.reduce((a, l) => a + l.amountSatang, 0);
  for (const p of people) {
    const own = p.lines.reduce((x, l) => x + l.amountSatang, 0);
    if (own !== p.grossSatang) issues.push(`${p.fullName}: ยอดในใบสำคัญรับเงิน (${own / 100}) ไม่เท่ากับยอดในสรุป (${p.grossSatang / 100})`);
    if (p.netSatang !== p.grossSatang - p.taxSatang) issues.push(`${p.fullName}: ยอดสุทธิไม่เท่ากับยอดก่อนหักลบภาษี`);
  }
  if (voucherSum !== summarySum) issues.push(`ผลรวมใบสำคัญรับเงิน (${voucherSum / 100}) ไม่เท่ากับสรุปใหญ่ (${summarySum / 100})`);
  if (!filtered) {
    if (lineSum !== summarySum) issues.push(`ผลรวมรายคาบ (${lineSum / 100}) ไม่เท่ากับสรุปใหญ่ (${summarySum / 100})`);
    if (batch.totalSatang != null && batch.totalSatang !== summarySum) issues.push(`ยอดที่อนุมัติ (${batch.totalSatang / 100}) ไม่เท่ากับสรุปใหญ่ (${summarySum / 100}) — กรุณาติดต่อผู้ดูแลระบบ`);
  }
  return issues;
}

// ───────── สถานะรายใบ ─────────

export const VOUCHER_STATUS_LABEL: Record<string, string> = { none: "ยังไม่พิมพ์", printed: "พิมพ์แล้ว", signed: "เซ็นรับแล้ว", reprint: "ต้องพิมพ์ใหม่" };

export function voucherStatuses(db: DB, batchId: number, people: Payee[]) {
  const rows = new Map(db.select().from(schema.payVouchers).where(eq(schema.payVouchers.batchId, batchId)).all().map((r) => [r.personKey, r]));
  return new Map(people.map((p) => {
    const r = rows.get(p.key);
    // ยอดเปลี่ยน หรือแก้ข้อมูลวิทยากรหลังพิมพ์ → ต้องพิมพ์ใหม่ (สเปก 11.5D)
    const stale = !!r?.printedAt && (r.printedAmountSatang !== p.grossSatang || (p.updatedAt != null && p.updatedAt.getTime() > r.printedAt.getTime()));
    const status = !r?.printedAt ? "none" : stale ? "reprint" : r.signedAt ? "signed" : "printed";
    return [p.key, { status, row: r ?? null }] as const;
  }));
}

export function markPrinted(db: DB, batchId: number, people: Payee[], actor: { userId: number; ip?: string | null }) {
  for (const p of people) {
    const prev = db.select().from(schema.payVouchers).where(and(eq(schema.payVouchers.batchId, batchId), eq(schema.payVouchers.personKey, p.key))).get();
    if (prev) {
      const changed = prev.printedAmountSatang !== p.grossSatang;
      db.update(schema.payVouchers).set({ printedAmountSatang: p.grossSatang, printedAt: new Date(), printedBy: actor.userId, printCount: prev.printCount + 1, ...(changed ? { signedAt: null, signedBy: null } : {}), updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.payVouchers.id, prev.id)).run();
    } else {
      db.insert(schema.payVouchers).values({ batchId, personKey: p.key, printedAmountSatang: p.grossSatang, printedAt: new Date(), printedBy: actor.userId, printCount: 1, createdBy: actor.userId, updatedBy: actor.userId }).run();
    }
  }
  writeAudit(db, { userId: actor.userId, action: "print", entity: "pay_vouchers", entityId: batchId, after: { people: people.map((p) => p.key), total: people.reduce((a, p) => a + p.grossSatang, 0) }, ip: actor.ip });
}

export function setSigned(db: DB, batchId: number, personKey: string, signed: boolean, actor: { userId: number; ip?: string | null }) {
  const r = db.select().from(schema.payVouchers).where(and(eq(schema.payVouchers.batchId, batchId), eq(schema.payVouchers.personKey, personKey))).get();
  if (!r?.printedAt) throw new RuleError("ใบนี้ยังไม่ได้พิมพ์ — พิมพ์ก่อนแล้วจึงติ๊กเซ็นรับ");
  db.update(schema.payVouchers).set({ signedAt: signed ? new Date() : null, signedBy: signed ? actor.userId : null, updatedBy: actor.userId, updatedAt: new Date() }).where(eq(schema.payVouchers.id, r.id)).run();
  writeAudit(db, { userId: actor.userId, action: "update", entity: "pay_voucher", entityId: r.id, before: { signed: !!r.signedAt }, after: { signed }, ip: actor.ip });
}

/** จำนวนใบที่พิมพ์แล้วแต่ยังไม่ได้ลายเซ็น (เตือนในหน้าการเงิน) — ทุกรอบที่อนุมัติแล้ว */
export function unsignedCount(db: DB) {
  return db.select().from(schema.payVouchers).innerJoin(schema.payBatches, eq(schema.payBatches.id, schema.payVouchers.batchId))
    .where(and(eq(schema.payBatches.status, "approved"))).all().filter((r) => r.pay_vouchers.printedAt && !r.pay_vouchers.signedAt).length;
}
