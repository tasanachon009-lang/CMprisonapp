import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HelpButton } from "./help-button";

export function Breadcrumb({ items }: { items: Array<{ href?: string; label: string }> }) {
  return (
    <nav aria-label="ตำแหน่งปัจจุบัน" className="no-print mb-3 flex flex-wrap items-center gap-1 text-sm text-muted">
      {items.map((it, i) => (
        <span key={i} className="inline-flex items-center gap-1">
          {i > 0 && <ChevronRight size={14} aria-hidden />}
          {it.href ? <Link href={it.href} className="underline-offset-2 hover:text-ink hover:underline">{it.label}</Link> : <span className="font-semibold text-ink">{it.label}</span>}
        </span>
      ))}
    </nav>
  );
}

/** หัวข้อเล็กภาษาอังกฤษเหนือหัวข้อไทย (ตกแต่งให้ทันสมัย — ข้อความไทยยังเป็นหลัก) */
export function Eyebrow({ children, light }: { children: React.ReactNode; light?: boolean }) {
  return (
    <p lang="en" className={`mb-1 font-display text-sm font-medium uppercase tracking-[0.18em] ${light ? "text-lime" : "text-navy"}`}>
      {children}
    </p>
  );
}

export function PageHeader({ title, subtitle, actions, help, en }: { title: React.ReactNode; subtitle?: React.ReactNode; actions?: React.ReactNode; help?: React.ReactNode; en?: string }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        {en && <Eyebrow>{en}</Eyebrow>}
        <h1 className="flex items-center gap-2 text-3xl">
          {title}
          {help && <HelpButton>{help}</HelpButton>}
        </h1>
        {subtitle && <p className="mt-1 text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** ตัวเลขสถิติใหญ่สี navy + คำอธิบายเล็กใต้ (แบบ "16+ Years Of Experience") */
export function Stat({ value, label, href, tone }: { value: React.ReactNode; label: string; href?: string; tone?: "ok" | "warn" | "danger" }) {
  const color = tone === "danger" ? "text-danger" : tone === "warn" ? "text-warn" : tone === "ok" ? "text-ok" : "text-navy";
  const inner = (
    <>
      <p className={`font-display text-4xl font-bold ${color}`}>{value}</p>
      <p className="mt-1 text-sm text-muted">{label}</p>
    </>
  );
  return href ? (
    <Link href={href} className="block rounded-2xl p-3 text-center transition hover:bg-lime-soft" title="กดเพื่อดูรายชื่อเบื้องหลังตัวเลข">{inner}</Link>
  ) : (
    <div className="p-3 text-center">{inner}</div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white/60 px-6 py-10 text-center">
      <p className="font-semibold">{title}</p>
      {children && <div className="mt-1 text-muted">{children}</div>}
    </div>
  );
}

export function Alert({ tone = "info", children }: { tone?: "info" | "ok" | "warn" | "danger"; children: React.ReactNode }) {
  const cls = {
    info: "border-navy/30 bg-navy/5",
    ok: "border-ok/40 bg-ok/10",
    warn: "border-warn-bg/60 bg-warn-bg/15",
    danger: "border-danger/50 bg-danger/10",
  }[tone];
  return <div role={tone === "danger" ? "alert" : undefined} className={`rounded-2xl border px-4 py-3 ${cls}`}>{children}</div>;
}

/** แถบความคืบหน้าแคปซูลมะนาว */
export function Progress({ value, label }: { value: number; label?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div>
      <div className="h-3 overflow-hidden rounded-full bg-lime-soft" role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className="h-full rounded-full bg-navy" style={{ width: `${v}%` }} />
      </div>
      {label && <p className="mt-1 text-sm text-muted">{label}</p>}
    </div>
  );
}

export function RecordMeta({ createdBy, createdAt, updatedBy, updatedAt }: { createdBy?: string | null; createdAt?: string; updatedBy?: string | null; updatedAt?: string }) {
  return (
    <p className="text-xs text-muted">
      บันทึกโดย {createdBy ?? "-"} เมื่อ {createdAt ?? "-"}
      {updatedAt && updatedAt !== createdAt && <> · แก้ไขล่าสุดโดย {updatedBy ?? "-"} เมื่อ {updatedAt}</>}
    </p>
  );
}
