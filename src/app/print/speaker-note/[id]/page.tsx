import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { sessionAccess } from "@/lib/auth/access";
import { getDb } from "@/lib/db";
import { getSession, activeStaff } from "@/lib/services/schedule";
import { chipsForSession, SHIFT_CHIP, OUTCOME_LABEL, PARTICIPATION_LABEL } from "@/lib/services/session-close";
import { getCohort } from "@/lib/queries/cohorts";
import { cohortLabel } from "@/lib/services/cohorts";
import { instructorNameMap } from "@/lib/queries/names";
import { getSetting } from "@/lib/bootstrap";
import { formatThaiDate } from "@/lib/thai-date";
import { logPrint } from "@/lib/print";
import { DocHeader, DocFooter } from "../../doc-header";

export const dynamic = "force-dynamic";

/** ใบ "บันทึกหลังสอน" ฉบับสั้นสำหรับวิทยากรภายนอกที่อยากเขียนเอง (สเปก 22B) — ไม่มีข้อมูลผู้ต้องขัง */
export default async function SpeakerNote({ params }: PageProps<"/print/speaker-note/[id]">) {
  const auth = await requirePage();
  const { id } = await params;
  const db = getDb();
  let s;
  try { s = getSession(db, Number(id)); } catch { notFound(); }
  if (!sessionAccess(auth, s.id, s.cohortId).canView) redirect("/forbidden");
  const { cohort, course } = getCohort(db, s.cohortId)!;
  const ins = instructorNameMap(db);
  const externals = activeStaff(db, [s.id]).filter((x) => !x.userId).map((x) => (x.instructorId ? ins.get(x.instructorId) : x.externalName) ?? "-");
  const chips = chipsForSession(db, s, getSetting<string[]>(db, "report.generalChips", []));
  const footer = await logPrint(auth, "speaker_note", s.id);
  const box = (label: string) => <span key={label} style={{ display: "inline-block", marginRight: 18, marginBottom: 4 }}>☐ {label}</span>;
  return (
    <div className="sheet">
      <DocHeader title="บันทึกหลังสอน (สำหรับวิทยากร)" subtitle={`${course.name} ${cohortLabel(cohort)}`} />
      <p>หัวข้อ: <b>{s.title}</b></p>
      <p>วันที่ {formatThaiDate(s.date, "full")} เวลา {s.startTime}–{s.endTime} น.{s.location ? ` · ${s.location}` : ""}</p>
      <p>วิทยากร: {externals.join(", ") || "........................................................"}</p>
      <h3 style={{ marginTop: 12 }}>1. ดำเนินการ</h3>
      <p>{Object.values(OUTCOME_LABEL).map(box)} &nbsp; เหตุผล (ถ้าไม่ตามแผน) ...............................................</p>
      <h3 style={{ marginTop: 8 }}>2. การมีส่วนร่วมของผู้เข้าอบรม</h3>
      <p>{Object.values(PARTICIPATION_LABEL).map(box)}</p>
      <h3 style={{ marginTop: 8 }}>3. สิ่งที่ได้ (ทำเครื่องหมายได้หลายข้อ)</h3>
      <p>{[...chips.topic, ...chips.general, SHIFT_CHIP].map(box)}</p>
      <h3 style={{ marginTop: 8 }}>สรุป / ข้อเสนอแนะ</h3>
      {[1, 2, 3].map((i) => <p key={i} style={{ borderBottom: "1px dotted #000", height: 28 }} />)}
      <p style={{ marginTop: 28 }}>ลงชื่อ ...................................................... วิทยากร &nbsp;&nbsp; วันที่ ....................</p>
      <p style={{ marginTop: 18, fontSize: "0.9em" }}>สำหรับเจ้าหน้าที่: ผู้รับผิดชอบประจำวันกรอกตามใบนี้ในหน้า &quot;คาบของฉัน&quot; ติ๊ก &quot;คัดลอกจากใบบันทึกของวิทยากร&quot; แล้วเก็บใบนี้ไว้ที่แฟ้ม</p>
      <p style={{ fontSize: "0.9em" }}>ลงชื่อ ...................................................... ผู้กรอกข้อมูล &nbsp;&nbsp; วันที่ ....................</p>
      <DocFooter text={footer} />
    </div>
  );
}
