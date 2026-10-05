import { Fragment } from "react";
import type { Payee } from "@/lib/services/pay-docs";
import { paginateVoucher, type VoucherRow } from "@/lib/pay/voucher-pages";
import { bahtText, bahtCols } from "@/lib/pay/thai-baht";
import { SPLIT_LABEL } from "@/lib/pay/calc";
import { ACCOUNT_TYPE_LABEL, formatAccountNo, digitsOnly } from "@/lib/instructor-rules";
import { THAI_MONTHS, formatThaiDate, parseISO } from "@/lib/thai-date";

export type DocCtx = { orgName: string; unitName: string; headTitle: string; payerName: string; corner: string; project: string; ktb: { intro: string; companyNote: string } };

/** ค่าว่าง → เส้นจุดไว้เขียนมือ (ข้อมูลจำเป็น) */
const Blank = ({ v, w = 30 }: { v?: string | null; w?: number }) => <span className="dots" style={{ minWidth: `${w}mm` }}>{v?.trim() || " "}</span>;
/** ค่าว่าง → "-" (ช่องไม่บังคับตามแบบฟอร์ม เช่น หมู่ ซอย ถนน) */
const Dash = ({ v, w = 18 }: { v?: string | null; w?: number }) => <span className="dots" style={{ minWidth: `${w}mm` }}>{v?.trim() || "-"}</span>;

function DateLine({ iso }: { iso: string }) {
  const { y, m, d } = parseISO(iso);
  return <p className="right">วันที่ <Blank v={String(d)} w={10} /> เดือน <Blank v={THAI_MONTHS[m - 1]} w={26} /> พ.ศ. <Blank v={String(y + 543)} w={14} /></p>;
}

/** บรรทัดรายการ: "1. วันที่ 5 ต.ค. 2569 หัวข้อ ทักษะการปฏิเสธ 1.5 ชม. × 600 บาท = 900 บาท" */
export function voucherRows(p: Payee): VoucherRow[] {
  return p.lines.map((l, i) => {
    const h = Math.round(l.hours * l.factor * 100) / 100;
    const split = l.factor !== 1 ? ` (${SPLIT_LABEL[l.splitMethod]} จาก ${l.hours} ชม.)` : "";
    const cap = l.capCutSatang ? ` หักเพดานต่อวัน ${(l.capCutSatang / 100).toLocaleString("th-TH")} บาท` : "";
    return { text: `${i + 1}. วันที่ ${formatThaiDate(l.date)} หัวข้อ ${l.title} ${h} ชม.${split} × ${(l.perHourSatang / 100).toLocaleString("th-TH")} บาท${cap} = ${(l.amountSatang / 100).toLocaleString("th-TH", { maximumFractionDigits: 2 })} บาท`, amountSatang: l.amountSatang };
  });
}

const Money = ({ s }: { s: number | null }) => {
  if (s == null) return <><td className="money" /><td className="st" /></>;
  const [b, st] = bahtCols(s);
  return <><td className="money">{b}</td><td className="st">{st}</td></>;
};

/** ใบสำคัญรับเงิน (สำหรับวิทยากร) — 1 คน 1 รอบ · มีเลขบัตรและเบอร์โทรตามสเปก 11.5C (เจ้าของเลือก 5 ต.ค. 2569) */
export function Voucher({ p, ctx, date, tax }: { p: Payee; ctx: DocCtx; date: string; tax: { enabled: boolean; pct: number } }) {
  const pages = paginateVoucher(voucherRows(p));
  return (
    <>
      {pages.map((pg) => (
        <div key={pg.no} className="sheet doc">
          <div className="frame">
            {pg.no === 1 ? (
              <>
                {ctx.corner && <span className="corner">{ctx.corner}</span>}
                <h1>ใบสำคัญรับเงิน (สำหรับวิทยากร)</h1>
                <p>ชื่อส่วนราชการผู้จัดฝึกอบรม <Blank v={ctx.orgName} w={110} /></p>
                <p>โครงการ/หลักสูตร <Blank v={ctx.project} w={125} /></p>
                <DateLine iso={date} />
                <p>ข้าพเจ้า <Blank v={p.fullName} w={70} /> เลขที่บัตรประจำตัวประชาชน <Blank v={p.nationalId} w={42} /></p>
                <p>
                  อยู่บ้านเลขที่ <Blank v={p.addr.houseNo} w={16} /> หมู่ที่ <Dash v={p.addr.moo} w={10} /> ซอย <Dash v={p.addr.soi} /> ถนน <Dash v={p.addr.road} /> ตำบล <Blank v={p.addr.subdistrict} w={26} /> อำเภอ <Blank v={p.addr.district} w={26} /> จังหวัด <Blank v={p.addr.province} w={26} /> เบอร์โทรศัพท์ <Blank v={p.phone} w={30} />
                </p>
                <p>ได้รับเงินจาก <Blank v={ctx.orgName} w={80} /> ดังรายละเอียดต่อไปนี้</p>
              </>
            ) : (
              <p className="right">ใบสำคัญรับเงิน — {p.fullName} · หน้า {pg.no}/{pg.of}</p>
            )}
            <table className="vtable" style={{ marginTop: 6 }}>
              <thead>
                <tr><th rowSpan={2}>รายการ</th><th colSpan={2}>จำนวนเงิน</th></tr>
                <tr><th className="money">บาท</th><th className="st">สต.</th></tr>
              </thead>
              <tbody>
                {pg.carryIn != null && <tr><td className="item right">ยอดยกมา</td><Money s={pg.carryIn} /></tr>}
                {pg.rows.map((r, i) => <tr key={i}><td className="item">{r.text}</td><Money s={r.amountSatang} /></tr>)}
                {Array.from({ length: pg.padding }, (_, i) => <tr key={`pad${i}`}><td className="item" /><Money s={null} /></tr>)}
                {pg.carryOut != null && <tr><td className="item right">ยอดยกไป</td><Money s={pg.carryOut} /></tr>}
                {pg.isLast && <tr><td className="item right"><b>รวมเป็นเงิน</b></td><Money s={p.grossSatang} /></tr>}
                {pg.isLast && tax.enabled && p.taxSatang > 0 && (
                  <>
                    <tr><td className="item right">หัก ภาษี ณ ที่จ่าย {tax.pct}%</td><Money s={p.taxSatang} /></tr>
                    <tr><td className="item right"><b>คงเหลือรับสุทธิ</b></td><Money s={p.netSatang} /></tr>
                  </>
                )}
              </tbody>
            </table>
            {pg.isLast && (
              <>
                <p style={{ marginTop: 6 }}>จำนวนเงิน (ตัวอักษร) <Blank v={`(${bahtText(p.grossSatang)})`} w={120} /></p>
                <div className="sign"><p>ลงชื่อ ............................................ ผู้รับเงิน</p><p>({p.fullName})</p></div>
                <div className="sign" style={{ marginTop: "6mm" }}><p>ลงชื่อ ............................................ ผู้จ่ายเงิน</p><p>({ctx.payerName || "............................................"})</p></div>
              </>
            )}
          </div>
        </div>
      ))}
    </>
  );
}

function IdBoxes({ id }: { id: string | null }) {
  const d = digitsOnly(id).padEnd(13, " ").slice(0, 13).split("");
  // 13 ช่องติดกันตามแบบฟอร์มต้นฉบับ
  return <span className="boxes">{d.map((c, i) => <span key={i}>{c.trim()}</span>)}</span>;
}

const Check = ({ on }: { on: boolean }) => <span style={{ fontSize: "1.2em" }}>{on ? "☑" : "☐"}</span>;

/** แบบแจ้งข้อมูลการรับเงินโอนผ่านระบบ KTB Corporate Online — 1 คน 1 แผ่น (สเปก 11.5D) */
export function KtbForm({ p, ctx, date }: { p: Payee; ctx: DocCtx; date: string }) {
  const company = p.payeeType === "company";
  const bank = (on: boolean) => (on ? { bank: p.bank, branch: p.bankBranch, type: p.accountType ? ACCOUNT_TYPE_LABEL[p.accountType] ?? p.accountType : null, name: p.accountName, no: p.accountNo ? formatAccountNo(p.accountNo) : null } : { bank: null, branch: null, type: null, name: null, no: null });
  const person = bank(!company), corp = bank(company);
  const sms = p.notifyChannel === "sms" || p.notifyChannel === "both";
  const email = p.notifyChannel === "email" || p.notifyChannel === "both";
  const house = [p.addr.houseNo, p.addr.moo ? `หมู่ ${p.addr.moo}` : null].filter(Boolean).join(" ");
  return (
    <div className="sheet doc">
      <div className="frame" style={{ border: "none" }}>
        <h1 style={{ marginTop: "6mm" }}>แบบแจ้งข้อมูลการรับเงินโอนผ่านระบบ KTB Corporate Online</h1>
        <DateLine iso={date} />
        <p>เรียน <Blank v={ctx.headTitle} w={90} /></p>
        <p style={{ textIndent: "12mm" }}>ข้าพเจ้า <Blank v={`${p.fullName}${company && p.companyName ? ` (${p.companyName})` : ""}`} w={130} /></p>
        <p>เลขประจำตัวประชาชน/เลขประจำตัวผู้เสียภาษีอากร <IdBoxes id={p.nationalId} /></p>
        <p>อยู่บ้านเลขที่ <Blank v={house} w={22} /> ซอย <Dash v={p.addr.soi} w={26} /> ถนน <Dash v={p.addr.road} w={26} /> ตำบล/แขวง <Blank v={p.addr.subdistrict} w={30} /></p>
        <p>อำเภอ/เขต <Blank v={p.addr.district} w={36} /> จังหวัด <Blank v={p.addr.province} w={36} /> รหัสไปรษณีย์ <Blank v={p.addr.postcode} w={22} /></p>
        <p style={{ textIndent: "12mm", marginTop: "5mm" }}>{ctx.ktb.intro}</p>
        {([[false, person, "กรณีเป็นบุคคลธรรมดา เพื่อเข้าบัญชีเงินฝากธนาคาร"], [true, corp, "กรณีเป็นบริษัทฯ ห้างหุ้นส่วนจำกัด ฯลฯ เพื่อเข้าบัญชีเงินฝากธนาคาร"]] as const).map(([isCo, b, label]) => (
          <div key={label} style={{ marginLeft: "18mm", marginTop: "3mm" }}>
            <p><Check on={isCo === company} /> {label} <Blank v={b.bank} w={isCo ? 36 : 50} /></p>
            <p style={{ marginLeft: "8mm" }}>สาขา <Blank v={b.branch} w={30} /> ประเภท <Blank v={b.type} w={26} /> ชื่อบัญชี <Blank v={b.name} w={50} /></p>
            <p style={{ marginLeft: "8mm" }}>เลขที่ <Blank v={b.no} w={45} /></p>
          </div>
        ))}
        <p style={{ marginLeft: "22mm", fontWeight: 700 }}>{ctx.ktb.companyNote}</p>
        <p style={{ textIndent: "12mm", marginTop: "4mm" }}>และเมื่อ{ctx.orgName}โอนเงินผ่านระบบ KTB Corporate Online แล้ว ให้ส่งข้อมูลการโอนเงินผ่านช่องทาง</p>
        <p style={{ marginLeft: "18mm" }}><Check on={sms} /> ข้อความแจ้งเตือนผ่านโทรศัพท์มือถือ (SMS) ที่เบอร์โทรศัพท์ <Blank v={sms ? p.phone : null} w={40} /></p>
        <p style={{ marginLeft: "18mm" }}><Check on={email} /> จดหมายอิเล็กทรอนิกส์ (e–mail) ตาม e–mail address <Blank v={email ? p.email : null} w={50} /></p>
        <div className="sign" style={{ marginTop: "16mm" }}><p>ลงชื่อ ............................................ ผู้มีสิทธิรับเงิน</p><p>({p.fullName})</p></div>
      </div>
    </div>
  );
}

/** สรุปใหญ่ค่าตอบแทนวิทยากร (สเปก 11.5D ข้อ 1) — แยกภายใน/ภายนอก + รวมย่อย + รวมทั้งสิ้น (ตัวเลข + ตัวอักษร) */
export function BundleSummary({ people, ctx, period, total, tax }: { people: Payee[]; ctx: DocCtx; period: string; total: number; tax: { enabled: boolean; pct: number } }) {
  const groups = (["internal", "external"] as const).map((k) => ({ k, label: k === "internal" ? "วิทยากรภายใน" : "วิทยากรภายนอก", list: people.filter((p) => p.kind === k) })).filter((g) => g.list.length);
  let n = 0;
  return (
    <div className="sheet doc">
      <h1>สรุปค่าตอบแทนวิทยากร</h1>
      <p className="center">{ctx.project} · {period}</p>
      <p className="center">{ctx.unitName} {ctx.orgName}</p>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: "7%" }}>ลำดับ</th><th>ชื่อ-สกุล</th><th style={{ width: "10%" }}>ภายใน/ภายนอก</th><th style={{ width: "8%" }}>คาบ</th><th style={{ width: "9%" }}>ชั่วโมง</th><th style={{ width: "15%" }}>จำนวนเงิน (บาท)</th><th style={{ width: "20%" }}>ลายมือชื่อผู้รับเงิน</th></tr></thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.k}>
              <tr key={`h${g.k}`}><td colSpan={7}><b>{g.label}</b></td></tr>
              {g.list.map((p) => (
                <tr key={p.key}>
                  <td className="center">{++n}</td><td>{p.fullName}</td><td className="center">{p.kind === "internal" ? "ภายใน" : "ภายนอก"}</td>
                  <td className="center">{p.sessions}</td><td className="center">{p.hours}</td><td className="right">{(p.grossSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td><td />
                </tr>
              ))}
              <tr key={`s${g.k}`}><td colSpan={5} className="right">รวม{g.label}</td><td className="right"><b>{(g.list.reduce((a, p) => a + p.grossSatang, 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b></td><td /></tr>
            </Fragment>
          ))}
          <tr><td colSpan={5} className="right"><b>รวมทั้งสิ้น</b></td><td className="right"><b>{(total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b></td><td /></tr>
        </tbody>
      </table>
      <p style={{ marginTop: 6 }}>รวมทั้งสิ้น ({bahtText(total)})</p>
      {tax.enabled && <p>หักภาษี ณ ที่จ่าย (วิทยากรภายนอก {tax.pct}%) รวม {(people.reduce((a, p) => a + p.taxSatang, 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท · จ่ายสุทธิ {(people.reduce((a, p) => a + p.netSatang, 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</p>}
      <table style={{ marginTop: 10, width: "60%" }}>
        <tbody>
          <tr><td>งบที่ได้รับ</td><td className="right" style={{ width: "40%" }}>............................ บาท</td></tr>
          <tr><td>เบิกครั้งนี้</td><td className="right">{(total / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })} บาท</td></tr>
          <tr><td>คงเหลือ</td><td className="right">............................ บาท</td></tr>
        </tbody>
      </table>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: "14mm", textAlign: "center" }}>
        {["ผู้จัดทำ", "ผู้ตรวจสอบ", "ผู้อนุมัติ"].map((r) => <div key={r}><p>ลงชื่อ ..............................</p><p>(..............................)</p><p>{r}</p></div>)}
      </div>
    </div>
  );
}

/** ตารางรายละเอียดทั้งหมดเรียงตามวันที่ (ตัวเลือก) */
export function DetailTable({ people, ctx }: { people: Payee[]; ctx: DocCtx }) {
  const lines = people.flatMap((p) => p.lines.map((l) => ({ ...l, who: p.fullName }))).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "th"));
  return (
    <div className="sheet doc">
      <h1>รายละเอียดค่าตอบแทนวิทยากรรายคาบ</h1>
      <p className="center">{ctx.project}</p>
      <table style={{ marginTop: 8 }}>
        <thead><tr><th style={{ width: "13%" }}>วันที่</th><th>หัวข้อ</th><th style={{ width: "22%" }}>วิทยากร</th><th style={{ width: "8%" }}>ชม.</th><th style={{ width: "11%" }}>อัตรา</th><th style={{ width: "12%" }}>เงิน (บาท)</th></tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td>{formatThaiDate(l.date)}</td><td>{l.title}</td><td>{l.who}</td><td className="center">{Math.round(l.hours * l.factor * 100) / 100}</td>
              <td className="right">{(l.perHourSatang / 100).toLocaleString("th-TH")}</td><td className="right">{(l.amountSatang / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</td>
            </tr>
          ))}
          <tr><td colSpan={5} className="right"><b>รวม</b></td><td className="right"><b>{(lines.reduce((a, l) => a + l.amountSatang, 0) / 100).toLocaleString("th-TH", { minimumFractionDigits: 2 })}</b></td></tr>
        </tbody>
      </table>
    </div>
  );
}
