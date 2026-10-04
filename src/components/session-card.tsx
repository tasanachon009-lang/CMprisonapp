import Link from "next/link";
import { CheckCircle2, Clock, MapPin, Users } from "lucide-react";
import type { SessionCard as S } from "@/lib/queries/home";
import { formatThaiDate } from "@/lib/thai-date";

export function SessionCardView({ s, today }: { s: S; today: string }) {
  const overdue = !s.checked && s.takesAttendance && s.date < today;
  return (
    <Link href={`/sessions/${s.id}`} className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3 transition hover:border-navy hover:shadow-sm">
      <div className="min-w-24 font-display font-bold text-navy">
        <Clock size={16} className="mr-1 inline" aria-hidden />
        {s.startTime}–{s.endTime}
        {s.date !== today && <p className="text-xs font-normal text-muted">{formatThaiDate(s.date)}</p>}
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{s.title}</p>
        <p className="text-sm text-muted">
          {s.courseName} {s.cohortLabel}
          {s.location && <><MapPin size={14} className="ml-2 mr-0.5 inline" aria-hidden />{s.location}</>}
        </p>
        {s.staff.length > 0 && <p className="text-sm"><Users size={14} className="mr-1 inline" aria-hidden />{s.staff.join(", ")}</p>}
      </div>
      {!s.takesAttendance ? (
        <span className="tag-muted">ไม่ต้องเช็คชื่อ</span>
      ) : s.checked ? (
        <span className="tag-ok"><CheckCircle2 size={16} aria-hidden /> เช็คชื่อแล้ว</span>
      ) : overdue ? (
        <span className="tag-danger">เลยกำหนด ยังไม่เช็คชื่อ</span>
      ) : (
        <span className="tag-warn">ยังไม่เช็คชื่อ</span>
      )}
    </Link>
  );
}
