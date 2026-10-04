import ExcelJS from "exceljs";
import { requireAction, AuthError, clientIp } from "@/lib/auth/session";
import { getDb } from "@/lib/db";
import { getCohort, cohortRoster } from "@/lib/queries/cohorts";
import { cohortAttendanceSummary } from "@/lib/services/attendance";
import { listForms, resultsOf } from "@/lib/services/assessments";
import { ENROLLMENT_STATUS_LABEL } from "@/lib/services/registry";
import { cohortLabel } from "@/lib/services/cohorts";
import { formatThaiDate } from "@/lib/thai-date";
import { logExport } from "@/lib/export-guard";

/** ส่งออก Excel รายรุ่น (มีชื่อผู้ต้องขัง → เฉพาะผู้มีสิทธิ์ + บันทึกการส่งออก) — ไม่รวมข้อมูลสุขภาพ */
export async function GET(_req: Request, ctx: RouteContext<"/api/export/cohort/[id]">) {
  let auth;
  try {
    auth = await requireAction("export.names");
  } catch (e) {
    if (e instanceof AuthError) return new Response(e.message, { status: 403 });
    throw e;
  }
  const { id } = await ctx.params;
  const db = getDb();
  const row = getCohort(db, Number(id));
  if (!row) return new Response("ไม่พบรุ่น", { status: 404 });
  const roster = cohortRoster(db, row.cohort.id);
  const att = cohortAttendanceSummary(db, row.cohort.id, row.course.passAttendancePct, row.course.totalHours);
  const forms = listForms(db).filter((f) => (f.courseCodes as string[]).includes(row.course.code) && !f.sensitive && f.kind !== "condition");
  const results = resultsOf(db, roster.map((r) => r.enrollment.id), (p) => p === "assessment.view");

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("รายชื่อ");
  const cols = [
    { header: "ที่", key: "no", width: 6 }, { header: "เลขประจำตัว", key: "inmateNo", width: 14 }, { header: "ชื่อ-สกุล", key: "name", width: 28 },
    { header: "แดน", key: "zone", width: 10 }, { header: "สถานะ", key: "status", width: 16 }, { header: "วันที่ออก/จบ", key: "left", width: 14 },
    { header: "% เข้าร่วม", key: "pct", width: 10 }, { header: "มา/คาบที่นับ", key: "sessions", width: 12 },
    ...forms.flatMap((f) => (f.rounds as string[]).filter((r) => r !== "monthly").map((r) => ({ header: `${f.shortName} (${r === "pre" ? "ก่อน" : "หลัง"})`, key: `${f.code}_${r}`, width: 14 }))),
  ];
  ws.columns = cols;
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: "frozen", ySplit: 1 }];
  roster.forEach((r, i) => {
    const s = att.get(r.enrollment.id);
    const rec: Record<string, unknown> = {
      no: i + 1, inmateNo: r.inc.inmateNo, name: `${r.person.prefix ?? ""}${r.person.firstName} ${r.person.lastName}`, zone: r.inc.zone ?? "",
      status: ENROLLMENT_STATUS_LABEL[r.enrollment.status], left: r.enrollment.leftDate ? formatThaiDate(r.enrollment.leftDate) : "",
      pct: s?.pct ?? "", sessions: s ? `${s.present}/${s.counted}` : "",
    };
    for (const x of results.filter((y) => y.r.enrollmentId === r.enrollment.id)) rec[`${x.f.code}_${x.r.round}`] = x.r.total ?? x.r.level ?? "";
    ws.addRow(rec);
  });
  logExport(auth.user.id, "cohort.excel", row.cohort.id, roster.length, await clientIp());
  const name = `${row.course.shortName}-${cohortLabel(row.cohort).replace(/[ /]/g, "-")}.xlsx`;
  return new Response(new Uint8Array(await wb.xlsx.writeBuffer()), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
}
