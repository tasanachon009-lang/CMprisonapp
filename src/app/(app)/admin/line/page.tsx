import { desc } from "drizzle-orm";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { config } from "@/lib/config";
import { lineMode, lineQuota, LINE_KIND_LABEL, LINE_STATUS_LABEL, type LineKind } from "@/lib/line/send";
import { dayText, nextWorkingDay } from "@/lib/line/messages";
import { formatThaiDate, formatThaiDateTime, todayISO } from "@/lib/thai-date";
import { userNameMap } from "@/lib/queries/names";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";
import { LineSettingsForm, TestButtons, CopyText } from "./line-client";

export const dynamic = "force-dynamic";

const STATUS_TAG: Record<string, string> = { sent: "tag-ok", dry_run: "tag-muted", failed: "tag-danger" };

/** LINE Official Account (สเปก 12) — สถานะ ตั้งค่า ส่งทดสอบ ตัวอย่างข้อความ โควตา ประวัติการส่ง */
export default async function LinePage() {
  await requirePage("line.manage");
  const db = getDb();
  const mode = lineMode(db);
  const quota = await lineQuota(db);
  const warnPct = getSetting<number>(db, "line.quotaWarnPct", 80);
  const target = nextWorkingDay(db, todayISO());
  const preview = dayText(db, target);
  const history = db.select().from(schema.lineMessages).orderBy(desc(schema.lineMessages.id)).limit(30).all();
  const names = userNameMap(db);
  return (
    <div className="max-w-4xl space-y-5">
      <Breadcrumb items={[{ href: "/admin", label: "ตั้งค่า" }, { label: "LINE" }]} />
      <PageHeader en="LINE Notify" title="แจ้งตารางสอนทาง LINE" subtitle="Broadcast ถึงทุกคนที่เพิ่มเพื่อน LINE OA ของหน่วยงาน · ข้อความไม่มีข้อมูลผู้ต้องขังทุกกรณี · เชื่อมต่อออกเฉพาะ api.line.me" />
      {mode.live
        ? <Alert tone="ok">พร้อมส่งจริง — มี LINE token ในไฟล์ .env ของเครื่องนี้</Alert>
        : <Alert tone="warn"><b>โหมดทดลอง</b> — {mode.reason} · ระบบบันทึกข้อความไว้ในประวัติแต่ไม่ส่งจริง {config.lineToken ? "" : "(วิธีใส่ token ดู README หัวข้อ LINE)"}</Alert>}
      {quota && (
        <Alert tone={quota.pct != null && quota.pct >= warnPct ? "danger" : "info"}>
          โควตาข้อความเดือนนี้: ใช้ไป {quota.used.toLocaleString("th-TH")}{quota.limit ? ` จาก ${quota.limit.toLocaleString("th-TH")} (${quota.pct}%)` : " (ไม่จำกัด)"} — นับตามจำนวนผู้รับ{quota.pct != null && quota.pct >= warnPct ? " · ใกล้หมดแล้ว" : ""}
        </Alert>
      )}
      <LineSettingsForm initial={{ enabled: getSetting<boolean>(db, "line.enabled", false) === true, sendTime: getSetting<string>(db, "line.sendTime", "16:00"), weeklyOnFriday: getSetting<boolean>(db, "line.weeklyOnFriday", true) !== false, weeklyReportSummary: getSetting<boolean>(db, "line.weeklyReportSummary", false) === true }} />
      <section className="card space-y-3">
        <h2 className="text-xl">ตัวอย่างข้อความที่จะส่ง ({formatThaiDate(target, "full")})</h2>
        <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-2xl bg-cream p-3 font-sans text-sm">{preview.text}</pre>
        <div className="flex flex-wrap items-center gap-2"><CopyText text={preview.text} /><span className="text-sm text-muted">{preview.count} คาบ</span></div>
        <TestButtons />
      </section>
      <section className="card space-y-2">
        <h2 className="text-xl">ประวัติการส่ง (30 ครั้งล่าสุด)</h2>
        {history.length === 0 ? <p className="text-muted">ยังไม่มี</p> : history.map((m) => (
          <details key={m.id} className="rounded-2xl border border-line bg-white px-3 py-2">
            <summary className="flex cursor-pointer flex-wrap items-center gap-2">
              <span className={STATUS_TAG[m.status]}>{LINE_STATUS_LABEL[m.status]}</span>
              <b>{LINE_KIND_LABEL[m.kind as LineKind] ?? m.kind}</b>
              {m.targetDate && <span className="text-sm">{formatThaiDate(m.targetDate)}</span>}
              <span className="ml-auto text-sm text-muted">{formatThaiDateTime(m.createdAt)} · {m.sentBy ? names.get(m.sentBy) : "อัตโนมัติ"}</span>
            </summary>
            {m.error && <p className="mt-1 text-sm text-danger">{m.error}</p>}
            <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap rounded-xl bg-cream p-2 font-sans text-sm">{m.text}</pre>
            <CopyText text={m.text} />
          </details>
        ))}
      </section>
    </div>
  );
}
