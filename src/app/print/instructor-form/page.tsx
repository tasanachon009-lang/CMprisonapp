import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getInstructor } from "@/lib/services/instructors";
import { ACCOUNT_TYPE_LABEL, BANKS, formatAccountNo } from "@/lib/instructor-rules";
import { EXTERNAL_TYPE_LABEL } from "@/lib/reference-data";
import { formatNationalId } from "@/lib/thai-id";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../doc-header";

export const dynamic = "force-dynamic";

/**
 * แบบฟอร์มขอข้อมูลวิทยากร (สเปก 11.5B) — ฟอร์มเปล่า หรือเติมเท่าที่มี (?id=) ให้วิทยากรกรอกมือ แล้วนำมาบันทึกเข้าระบบ
 * ข้อมูลอ่อนไหวพิมพ์เต็มเฉพาะผู้มีสิทธิ์ (การเงิน/ผู้ดูแล) — คนอื่นพิมพ์เป็นช่องว่างให้เขียนเอง
 */
export default async function InstructorInfoForm({ searchParams }: PageProps<"/print/instructor-form">) {
  const auth = await requirePage("instructors.view");
  const sp = await searchParams;
  const db = getDb();
  const x = sp.id ? getInstructor(db, Number(sp.id)) : null;
  const full = auth.can("instructors.sensitive");
  const footer = await logPrint(auth, "instructor_form", x?.id ?? "blank");
  const dots = (n = 30) => ".".repeat(n);
  const val = (s: string | null | undefined, n = 30, sensitive = false) => (s && (!sensitive || full) ? <b>{s}</b> : dots(n));
  return (
    <div className="sheet">
      <DocHeader title="แบบฟอร์มขอข้อมูลวิทยากร" subtitle="สำหรับจัดทำเอกสารเบิกจ่ายค่าตอบแทน (ใบสำคัญรับเงิน / แบบแจ้งข้อมูลการรับเงินโอน KTB)" />
      <p style={{ marginTop: 12 }}><b>1. ข้อมูลผู้รับเงิน</b></p>
      <p>ชื่อ-สกุล {val(x?.fullName, 60)} &nbsp; ☐ ภายใน ☐ ภายนอก {x ? `(${x.kind === "internal" ? "ภายใน" : `ภายนอก · ${EXTERNAL_TYPE_LABEL[x.externalType ?? "gov"]}`})` : ""}</p>
      <p>ตำแหน่ง {val(x?.position, 40)} &nbsp; หน่วยงาน {val(x?.organization, 45)}</p>
      <p>เลขประจำตัวประชาชน/เลขผู้เสียภาษี 13 หลัก {val(x?.nationalId ? formatNationalId(x.nationalId) : null, 40, true)}</p>
      <p>เบอร์โทรศัพท์มือถือ {val(x?.phone, 25)} &nbsp; อีเมล {val(x?.email, 40)}</p>
      <p style={{ marginTop: 10 }}><b>2. ที่อยู่</b></p>
      <p>บ้านเลขที่ {val(x?.addrHouseNo, 12, true)} หมู่ที่ {val(x?.addrMoo, 6, true)} ซอย {val(x?.addrSoi, 20, true)} ถนน {val(x?.addrRoad, 25, true)}</p>
      <p>ตำบล/แขวง {val(x?.addrSubdistrict, 25)} อำเภอ/เขต {val(x?.addrDistrict, 25)} จังหวัด {val(x?.addrProvince, 25)} รหัสไปรษณีย์ {val(x?.addrPostcode, 10)}</p>
      <p style={{ marginTop: 10 }}><b>3. บัญชีรับเงินโอน (KTB Corporate Online)</b> — โปรดแนบสำเนาหน้าสมุดบัญชี</p>
      <p>{x?.payeeType === "company" ? "☐ บุคคลธรรมดา ☑" : x ? "☑ บุคคลธรรมดา ☐" : "☐ บุคคลธรรมดา ☐"} บริษัท/ห้างหุ้นส่วน/ร้านค้า ชื่อนิติบุคคล {val(x?.companyName, 40)}</p>
      <p>ธนาคาร {val(x?.bank, 40)} สาขา {val(x?.bankBranch, 25)}</p>
      <p>ประเภทบัญชี {x?.accountType ? <b>{ACCOUNT_TYPE_LABEL[x.accountType]}</b> : "☐ ออมทรัพย์ ☐ กระแสรายวัน ☐ ฝากประจำ"} &nbsp; ชื่อบัญชี {val(x?.accountName, 40)}</p>
      <p>เลขที่บัญชี {val(x?.accountNo ? formatAccountNo(x.accountNo) : null, 30, true)}</p>
      <p>แจ้งผลการโอนทาง {x?.notifyChannel === "sms" ? "☑ SMS ☐ อีเมล" : x?.notifyChannel === "email" ? "☐ SMS ☑ อีเมล" : x?.notifyChannel === "both" ? "☑ SMS ☑ อีเมล" : "☐ SMS ☐ อีเมล"}</p>
      <p style={{ marginTop: 10, fontSize: "0.85em" }}>ธนาคารที่ใช้ได้: {BANKS.slice(0, 6).join(" / ")} ฯลฯ</p>
      <div style={{ marginTop: 40, marginLeft: "50%" }}>
        <p>ลงชื่อ ...................................................... ผู้ให้ข้อมูล</p>
        <p style={{ marginLeft: "3em" }}>({x?.fullName || "......................................................"})</p>
        <p>วันที่ ........ เดือน .................... พ.ศ. ..........</p>
      </div>
      <DocFooter text={footer} />
    </div>
  );
}
