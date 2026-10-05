import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requirePage } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { personTimeline } from "@/lib/queries/persons";
import { userNameMap } from "@/lib/queries/names";
import { lookupLabel } from "@/lib/bootstrap";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { ageOn, formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { maskNationalId } from "@/lib/thai-id";
import { Breadcrumb, RecordMeta } from "@/components/ui";
import { Avatar } from "@/components/avatar";
import { NationalIdReveal, PhotoUpload, EditPerson, EditIncarceration, ChangeInmateNo } from "./person-client";
import { ContactsEditor, HandoffButton } from "./contacts-client";
import { BehaviorNoteButton } from "@/components/behavior-note";
import { behaviorNotesOf } from "@/lib/queries/enrollment";
import { and, eq, isNull } from "drizzle-orm";
import { schema } from "@/lib/db";
import { resultsOf, listForms, versionFor } from "@/lib/services/assessments";
import { maxScore, individualPrePost } from "@/lib/assessments/prepost";
import type { Item } from "@/lib/assessments/scoring";
import { PrePostChart } from "@/components/prepost-chart";
import { cohortsOfPerson } from "@/lib/auth/access";
import type { Permission } from "@/lib/auth/permissions";

/** สิทธิ์ที่มอบหมายรายรุ่นแล้วเปิดหน้าบุคคลแบบจำกัดได้ (กลุ่ม B — ญาติ/ผู้ติดต่อ/ติดตาม) */
const SCOPED_VIEW: Permission[] = ["contacts.edit", "bst.view", "bst.edit", "behavior.edit"];

export const dynamic = "force-dynamic";

const STATUS_TAG: Record<string, string> = { draft: "tag-warn", active: "tag-ok", completed: "tag-navy", dropped: "tag-danger", withdrawn: "tag-muted", failed: "tag-danger" };

/** หน้าบุคคล: ไทม์ไลน์แยกตามการต้องโทษ — รอบปัจจุบันเป็นหลัก รอบเก่าพับเก็บพร้อมป้ายแดง (สเปก 7.4, 22B) */
export default async function PersonPage({ params }: PageProps<"/persons/[id]">) {
  const auth = await requirePage();
  const { id } = await params;
  const db = getDb();
  const full = auth.can("registry.view");
  const myCohorts = cohortsOfPerson(Number(id));
  // ผู้ไม่มีสิทธิ์ทะเบียน: เข้าได้เฉพาะคนในรุ่นที่ได้รับมอบหมาย (ตรวจก่อนบอกว่ามี/ไม่มีบุคคลนี้)
  if (!full && !SCOPED_VIEW.some((x) => auth.canIn(x, myCohorts))) redirect("/forbidden");
  const t = personTimeline(db, Number(id));
  if (!t) notFound();
  const { person: p, incarcerations } = t;
  const names = userNameMap(db);
  const current = incarcerations[0];
  const today = todayISO();
  const canEdit = auth.can("registry.edit");
  const contacts = db.select().from(schema.contacts).where(and(eq(schema.contacts.personId, p.id), isNull(schema.contacts.deletedAt))).all();
  const behaviors = current ? behaviorNotesOf(db, current.inc.id) : [];
  const canContacts = auth.canIn("contacts.edit", myCohorts);
  // กราฟก่อน-หลังรายบุคคล — แยกทีละการลงทะเบียน (ไม่ลากข้ามรอบการต้องโทษ) กรองตามสิทธิ์ (แบบสุขภาพเฉพาะผู้มีสิทธิ์)
  const allEnr = incarcerations.flatMap((x) => x.enrollments.map((e) => e.e.id));
  const results = full ? resultsOf(db, allEnr, auth.can) : [];
  const maxOf = new Map(listForms(db).map((fm) => {
    const v = versionFor(db, fm.id, today);
    return [fm.id, maxScore(fm.kind, v.items as Item[], v.scoring as Record<string, unknown>)] as const;
  }));
  const canBehavior = auth.canIn("behavior.edit", myCohorts);
  const contactsBox = <ContactsEditor personId={p.id} canEdit={canContacts} contacts={contacts.map((c) => ({ id: c.id, kind: c.kind, name: c.name, relation: c.relation, phone: c.phone, address: c.address, note: c.note }))} />;

  if (!full) {
    // มุมมองจำกัด: ชื่อ เลขประจำตัว ญาติ/ผู้ติดต่อ และหลักสูตรในรุ่นที่ได้รับมอบหมายเท่านั้น
    const mine = current ? current.enrollments.filter((x) => SCOPED_VIEW.some((perm) => auth.canIn(perm, [x.c.id]))) : [];
    return (
      <div className="space-y-6">
        <Breadcrumb items={[{ href: "/assigned", label: "งานที่ได้รับมอบหมาย" }, { label: `${p.firstName} ${p.lastName}` }]} />
        <section className="card flex flex-wrap items-center gap-4">
          <Avatar first={p.firstName} last={p.lastName} size={72} color="var(--lime)" />
          <div className="flex-1">
            <h1 className="text-2xl">{p.prefix}{p.firstName} {p.lastName}</h1>
            <p className="text-muted">เลขประจำตัว {current?.inc.inmateNo ?? "-"}</p>
          </div>
          {canBehavior && current && <BehaviorNoteButton incarcerationId={current.inc.id} enrollmentId={current.enrollments.find((x) => ["active", "draft"].includes(x.e.status))?.e.id ?? null} name={`${p.firstName} ${p.lastName}`} />}
        </section>
        {contactsBox}
        <section className="card">
          <h2 className="text-xl">หลักสูตรในรุ่นที่ได้รับมอบหมาย</h2>
          <ul className="mt-3 space-y-2">
            {mine.map((e) => (
              <li key={e.e.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream px-4 py-2">
                <Link href={`/enrollments/${e.e.id}`} className="font-medium hover:underline">{e.course.name} {e.label}</Link>
                <span className={STATUS_TAG[e.e.status] ?? "tag-muted"}>{ENROLLMENT_STATUS_LABEL[e.e.status]}</span>
              </li>
            ))}
            {!mine.length && <li className="text-muted">ไม่มีหลักสูตรในรุ่นที่ได้รับมอบหมาย</li>}
          </ul>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ href: "/persons", label: "ค้นหาบุคคล" }, { label: `${p.firstName} ${p.lastName}` }]} />

      <section className="card flex flex-wrap gap-6">
        <div className="flex flex-col items-center gap-2">
          <Avatar first={p.firstName} last={p.lastName} src={current?.inc.photoPath ? `/api/files/photo/${current.inc.id}` : null} size={140} color="var(--lime)" className="rounded-[28px]" />
          {canEdit && current && <PhotoUpload incarcerationId={current.inc.id} hasPhoto={!!current.inc.photoPath} />}
        </div>
        <div className="min-w-64 flex-1">
          <h1 className="text-3xl">{p.prefix}{p.firstName} {p.lastName}</h1>
          <dl className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
            <Item k="เลขบัตรประชาชน">{p.nationalId ? (auth.can("national_id.view_full") ? <NationalIdReveal personId={p.id} masked={maskNationalId(p.nationalId)} /> : maskNationalId(p.nationalId)) : "-"}</Item>
            <Item k="วันเกิด">{p.birthDate ? `${formatThaiDate(p.birthDate)} (อายุ ${ageOn(p.birthDate, today)} ปี)` : "-"}</Item>
            <Item k="เพศ">{p.gender === "male" ? "ชาย" : p.gender === "female" ? "หญิง" : p.gender ? "อื่นๆ" : "-"}</Item>
            <Item k="สถานภาพ">{p.maritalStatus ?? "-"}</Item>
            <Item k="การศึกษา">{p.education ?? "-"}</Item>
            <Item k="อาชีพก่อนต้องโทษ">{p.occupation ?? "-"}</Item>
            <Item k="สมาชิกในครอบครัว">{p.familySize != null ? `${p.familySize} คน` : "-"}</Item>
            <Item k="การต้องโทษ">{incarcerations.length} ครั้ง</Item>
          </dl>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {canBehavior && current && <BehaviorNoteButton incarcerationId={current.inc.id} enrollmentId={current.enrollments.find((x) => ["active", "draft"].includes(x.e.status))?.e.id ?? null} name={`${p.firstName} ${p.lastName}`} />}
            {auth.can("shift.use") && <HandoffButton personId={p.id} name={`${p.firstName} ${p.lastName}`} />}
            {canEdit && <EditPerson person={{ id: p.id, version: p.version, prefix: p.prefix, firstName: p.firstName, lastName: p.lastName, birthDate: p.birthDate, gender: p.gender, maritalStatus: p.maritalStatus, education: p.education, occupation: p.occupation, familySize: p.familySize, hasNationalId: !!p.nationalId }} />}
            <RecordMeta createdBy={names.get(p.createdBy ?? 0)} createdAt={formatThaiDateTime(p.createdAt)} updatedBy={names.get(p.updatedBy ?? 0)} updatedAt={formatThaiDateTime(p.updatedAt)} />
          </div>
        </div>
      </section>

      {contactsBox}

      {behaviors.length > 0 && (
        <section className="card">
          <h2 className="text-xl">บันทึกพฤติกรรม (การต้องโทษปัจจุบัน)</h2>
          <ul className="mt-3 space-y-2">
            {behaviors.slice(0, 20).map((b) => (
              <li key={b.id} className="flex flex-wrap items-start gap-2 rounded-2xl bg-cream px-3 py-2">
                <span className={b.tone === "positive" ? "tag-ok" : b.tone === "negative" ? "tag-danger" : "tag-muted"}>{b.tone === "positive" ? "เชิงบวก" : b.tone === "negative" ? "เชิงลบ" : "สังเกต"}</span>
                {b.category && <span className="tag-navy">{lookupLabel(db, "behavior_category", b.category)}</span>}
                <span className="flex-1">{b.text}</span>
                <span className="text-xs text-muted">{formatThaiDate(b.noteDate)} · {names.get(b.createdBy ?? 0)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {incarcerations.map((x) => {
        const yearBE = x.inc.admittedDate ? Number(x.inc.admittedDate.slice(0, 4)) + 543 : new Date(x.inc.createdAt).getFullYear() + 543;
        const body = (
          <div className="space-y-4">
            <dl className="grid gap-x-8 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
              <Item k="เลขประจำตัว"><span className="font-mono">{x.inc.inmateNo}</span></Item>
              <Item k="ฐานความผิด">{x.inc.offense ?? "-"}</Item>
              <Item k="กำหนดโทษ">{[x.inc.sentenceYears && `${x.inc.sentenceYears} ปี`, x.inc.sentenceMonths && `${x.inc.sentenceMonths} เดือน`, x.inc.sentenceDays && `${x.inc.sentenceDays} วัน`].filter(Boolean).join(" ") || "-"}</Item>
              <Item k="วันที่รับตัว">{x.inc.admittedDate ? formatThaiDate(x.inc.admittedDate) : "-"}</Item>
              <Item k="แดน / ห้อง">{x.inc.zone ?? "-"} / {x.inc.room ?? "-"}</Item>
              <Item k="ชั้นนักโทษ">{lookupLabel(db, "prisoner_class", x.inc.prisonerClass)}</Item>
              <Item k="สารเสพติดที่ใช้">{x.drugs.map((d) => lookupLabel(db, "substance", d.substance)).join(", ") || "-"}</Item>
              {x.inc.releasedDate && <Item k="ออกจากเรือนจำ"><span className="font-semibold">{formatThaiDate(x.inc.releasedDate)} — {lookupLabel(db, "release_reason", x.inc.releaseReason)}</span></Item>}
            </dl>
            {canEdit && x.isCurrent && (
              <div className="flex flex-wrap gap-2">
                <EditIncarceration inc={{ id: x.inc.id, version: x.inc.version, admittedDate: x.inc.admittedDate, offense: x.inc.offense, sentenceYears: x.inc.sentenceYears, sentenceMonths: x.inc.sentenceMonths, sentenceDays: x.inc.sentenceDays, sentenceStatus: x.inc.sentenceStatus, zone: x.inc.zone, room: x.inc.room, prisonerClass: x.inc.prisonerClass }} />
                {auth.can("registry.edit_inmate_no") && <ChangeInmateNo incarcerationId={x.inc.id} current={x.inc.inmateNo} />}
              </div>
            )}
            <div>
              <h3 className="mb-2 font-semibold">หลักสูตรในการต้องโทษครั้งนี้</h3>
              {x.enrollments.length ? (
                <ul className="space-y-2">
                  {x.enrollments.map((e) => (
                    <li key={e.e.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-cream px-4 py-2">
                      <Link href={`/enrollments/${e.e.id}`} className="font-medium hover:underline">{e.course.name} {e.label}</Link>
                      <span className={STATUS_TAG[e.e.status] ?? "tag-muted"}>{ENROLLMENT_STATUS_LABEL[e.e.status]}</span>
                      {e.e.overrideSeq > 0 && <span className="tag-danger" title={e.e.overrideReason ?? ""}>ปลดล็อกลงซ้ำโดย {names.get(e.e.overrideBy ?? 0)}</span>}
                      <span className="text-sm text-muted">{formatThaiDate(e.c.startDate)} – {formatThaiDate(e.c.endDate)}</span>
                      <span className="ml-auto text-sm">{e.pct != null ? `เข้าร่วม ${e.pct}% (${e.present}/${e.counted} คาบ)` : "ยังไม่มีการเช็คชื่อ"}{e.corrections ? ` · เหตุราชทัณฑ์ ${e.corrections}` : ""}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-muted">ยังไม่ได้เข้าหลักสูตรใด</p>}
            </div>
            {x.enrollments.map((e) => {
              const rows = individualPrePost(results, e.e.id, maxOf);
              return rows.length ? (
                <div key={`chart-${e.e.id}`} className="max-w-3xl rounded-2xl border border-line p-3">
                  <PrePostChart rows={rows} individual title={`ผลประเมินก่อน-หลัง: ${e.course.name} ${e.label}`} />
                </div>
              ) : null;
            })}
          </div>
        );
        return x.isCurrent ? (
          <section key={x.inc.id} className="card">
            <h2 className="mb-3 text-xl">การต้องโทษปัจจุบัน <span className="text-base font-normal text-muted">(พ.ศ. {yearBE})</span></h2>
            {body}
          </section>
        ) : (
          <details key={x.inc.id} className="card border-t-4 border-t-danger">
            <summary className="cursor-pointer list-none">
              <span className="tag-danger text-base">ข้อมูลการต้องโทษรอบก่อน (พ.ศ. {yearBE})</span>
              <span className="ml-2 text-muted">เลข {x.inc.inmateNo} · {x.enrollments.length} หลักสูตร — กดเพื่อดู</span>
            </summary>
            <div className="mt-4 rounded-2xl bg-danger/5 p-4">
              <p className="mb-3 text-sm font-semibold text-danger">ข้อมูลรอบก่อน — คะแนนประเมินรอบนี้ไม่ถูกนำมาใช้เป็นค่าก่อน/หลังของรอบปัจจุบัน</p>
              {body}
            </div>
          </details>
        );
      })}
    </div>
  );
}

function Item({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 py-0.5">
      <dt className="w-36 shrink-0 text-muted">{k}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}
