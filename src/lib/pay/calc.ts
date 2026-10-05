/**
 * คำนวณค่าตอบแทนวิทยากร (สเปก 11.3–11.6) — ฟังก์ชันล้วน ไม่แตะฐานข้อมูล · เงินเป็นสตางค์ (จำนวนเต็ม)
 *
 * ต่อคาบ: ชั่วโมงของคน = สอนจริง (ไม่แก้ = ชั่วโมงคาบ) × ส่วนแบ่ง
 *   full = คนละเต็ม (1) · equal = หารเท่ากัน (1/จำนวนคนที่สอนจริง) · ratio = สัดส่วน/ผลรวมสัดส่วน
 * ยอด = ชั่วโมงของคน × อัตราต่อชั่วโมงของคนนั้น (คาบเดียวมีทั้งภายใน/ภายนอกได้ คิดแยกตามอัตราแต่ละคน)
 * เพดานต่อวัน: รวมทุกคาบของคนเดียวกันในวันเดียวกัน เกินเพดาน → ตัดจากคาบหลังสุดของวันก่อน
 */

export type SplitMethod = "full" | "equal" | "ratio";
export const SPLIT_LABEL: Record<SplitMethod, string> = { full: "คนละเต็ม", equal: "หารเท่ากัน", ratio: "กำหนดสัดส่วน" };

export type PayRate = { id: number; perHourSatang: number; dailyCapSatang: number | null };

export type PayStaffInput = {
  staffId: number;
  /** ตัวตนสำหรับรวมยอดรายคน: u<userId> | i<instructorId> | x<ชื่อ> */
  key: string;
  name: string;
  kind: "internal" | "external";
  userId: number | null;
  instructorId: number | null;
  didTeach: boolean;
  actualHours: number | null;
  shareRatio: number | null;
  rate: PayRate | null;
  /** เหตุที่คนนี้เบิกไม่ได้ (เช่น ยังไม่อยู่ในทะเบียนวิทยากร) */
  blocked?: string | null;
};

export type PaySessionInput = {
  id: number;
  cohortId: number;
  date: string;
  startTime: string;
  title: string;
  hours: number;
  splitMethod: SplitMethod;
  /** เหตุที่ทั้งคาบเบิกไม่ได้ (หัวข้อไม่เบิก / ไม่ได้ทำกิจกรรม / คาบชดเชย) — null = เบิกได้ */
  notPayable: string | null;
  staff: PayStaffInput[];
};

export type PayLine = {
  sessionId: number;
  cohortId: number;
  staffId: number;
  key: string;
  name: string;
  kind: "internal" | "external";
  userId: number | null;
  instructorId: number | null;
  date: string;
  startTime: string;
  title: string;
  /** ชั่วโมงสอนจริงของคน (ก่อนแบ่ง) */
  hours: number;
  factor: number;
  splitMethod: SplitMethod;
  rateId: number | null;
  perHourSatang: number;
  grossSatang: number;
  capCutSatang: number;
  amountSatang: number;
  /** เบิกได้หรือไม่ — เบิกไม่ได้ยังนับเป็นภาระงาน (ชั่วโมงสอน) */
  payable: boolean;
  note: string | null;
};

const round = (n: number) => Math.round(n + Number.EPSILON);

export function computeLines(sessions: PaySessionInput[]): PayLine[] {
  const lines: PayLine[] = [];
  for (const s of sessions) {
    const teaching = s.staff.filter((x) => x.didTeach);
    const shareSum = teaching.reduce((a, x) => a + (x.shareRatio && x.shareRatio > 0 ? x.shareRatio : 1), 0);
    for (const x of teaching) {
      const hours = x.actualHours ?? s.hours;
      const factor = s.splitMethod === "equal" ? 1 / teaching.length : s.splitMethod === "ratio" ? (x.shareRatio && x.shareRatio > 0 ? x.shareRatio : 1) / shareSum : 1;
      const note = s.notPayable ?? x.blocked ?? (x.rate ? null : "ยังไม่ได้กำหนดอัตราของหัวข้อนี้");
      const payable = !note;
      const per = payable ? x.rate!.perHourSatang : 0;
      const gross = payable ? round(hours * factor * per) : 0;
      lines.push({
        sessionId: s.id, cohortId: s.cohortId, staffId: x.staffId, key: x.key, name: x.name, kind: x.kind, userId: x.userId, instructorId: x.instructorId,
        date: s.date, startTime: s.startTime, title: s.title, hours, factor, splitMethod: s.splitMethod,
        rateId: payable ? x.rate!.id : null, perHourSatang: per, grossSatang: gross, capCutSatang: 0, amountSatang: gross, payable, note,
      });
    }
  }
  applyDailyCaps(lines, sessions);
  return lines;
}

/** เพดานต่อวันต่อคน: ใช้เพดานที่ต่ำที่สุดของอัตราที่ใช้ในวันนั้น (ไม่มีเพดาน = ไม่จำกัด) */
function applyDailyCaps(lines: PayLine[], sessions: PaySessionInput[]) {
  const capOf = new Map<string, number | null>();
  for (const s of sessions) for (const x of s.staff) if (x.rate) capOf.set(`${s.id}:${x.staffId}`, x.rate.dailyCapSatang);
  const groups = new Map<string, PayLine[]>();
  for (const l of lines) {
    if (!l.payable) continue;
    const k = `${l.key}|${l.date}`;
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  for (const group of groups.values()) {
    const caps = group.map((l) => capOf.get(`${l.sessionId}:${l.staffId}`)).filter((c): c is number => c != null);
    if (!caps.length) continue;
    const cap = Math.min(...caps);
    let over = group.reduce((a, l) => a + l.amountSatang, 0) - cap;
    if (over <= 0) continue;
    for (const l of [...group].sort((a, b) => b.startTime.localeCompare(a.startTime))) {
      if (over <= 0) break;
      const cut = Math.min(l.amountSatang, over);
      l.capCutSatang += cut;
      l.amountSatang -= cut;
      over -= cut;
    }
  }
}

export type PersonTotal = {
  key: string; name: string; kind: "internal" | "external"; userId: number | null; instructorId: number | null;
  sessions: number; hours: number; payableHours: number; grossSatang: number; taxSatang: number; netSatang: number;
};

/** รวมรายคน + หักภาษี ณ ที่จ่าย (เฉพาะวิทยากรภายนอก เมื่อเปิดใช้) — ปัดเศษภาษีครั้งเดียวต่อคนต่อรอบ */
export function personTotals(lines: PayLine[], tax: { enabled: boolean; pct: number }): PersonTotal[] {
  const map = new Map<string, PersonTotal>();
  for (const l of lines) {
    const t = map.get(l.key) ?? { key: l.key, name: l.name, kind: l.kind, userId: l.userId, instructorId: l.instructorId, sessions: 0, hours: 0, payableHours: 0, grossSatang: 0, taxSatang: 0, netSatang: 0 };
    t.sessions += 1;
    // ชั่วโมงสอน = เวลาที่สอนจริง (ไม่หารตามส่วนแบ่ง — ส่วนแบ่งแสดงในสูตรของแต่ละบรรทัด)
    t.hours += l.hours;
    if (l.payable) t.payableHours += l.hours;
    t.grossSatang += l.amountSatang;
    map.set(l.key, t);
  }
  for (const t of map.values()) {
    t.hours = Math.round(t.hours * 100) / 100;
    t.payableHours = Math.round(t.payableHours * 100) / 100;
    t.taxSatang = tax.enabled && t.kind === "external" ? round((t.grossSatang * tax.pct) / 100) : 0;
    t.netSatang = t.grossSatang - t.taxSatang;
  }
  return [...map.values()].sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, "th") : a.kind === "internal" ? -1 : 1));
}

/** ข้อความที่มาของยอด เช่น "1.5 ชม. × ½ (หารเท่ากัน) × 600 บาท = 450 บาท" */
export function lineFormula(l: Pick<PayLine, "hours" | "factor" | "splitMethod" | "perHourSatang" | "grossSatang" | "capCutSatang" | "amountSatang">) {
  const f = l.factor === 1 ? "" : ` × ${Math.round(l.factor * 1000) / 1000} (${SPLIT_LABEL[l.splitMethod]})`;
  const cap = l.capCutSatang ? ` − เพดานต่อวัน ${baht(l.capCutSatang)}` : "";
  return `${l.hours} ชม.${f} × ${baht(l.perHourSatang)}${cap} = ${baht(l.amountSatang)}`;
}

export function baht(satang: number) {
  const v = satang / 100;
  return `${v.toLocaleString("th-TH", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })} บาท`;
}
