import Link from "next/link";
import { eq, sql } from "drizzle-orm";
import { BookOpen, Coins, FileSignature, FileText, HardDrive, History, Settings, ShieldCheck, Users , UserCheck , Move , MessageCircle } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { getDb, schema } from "@/lib/db";
import { backupHealth } from "@/lib/backup/status";
import { staleAssistantAccounts } from "@/lib/services/admin";
import { Breadcrumb, PageHeader, Alert } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function AdminHome() {
  const auth = await requirePage("settings.manage", "users.manage", "backup.manage", "audit.view", "rates.manage", "topics.manage", "docs.templates");
  const db = getDb();
  const health = backupHealth(db);
  const pending = db.select({ n: sql<number>`count(*)` }).from(schema.dualApprovals).where(eq(schema.dualApprovals.status, "pending")).get()?.n ?? 0;
  const stale = staleAssistantAccounts(db);
  const cards = [
    { href: "/admin/users", icon: Users, title: "ผู้ใช้และสิทธิ์", desc: "เพิ่มบัญชี รีเซ็ตรหัส ระงับบัญชี ปรับสิทธิ์รายคน มอบหมายรายรุ่น", perm: "users.manage" as const },
    { href: "/admin/approvals", icon: ShieldCheck, title: `ยืนยัน 2 คน${pending ? ` (${pending} รอ)` : ""}`, desc: "กู้คืนข้อมูล เปลี่ยนผู้ดูแลระบบ รหัสฉุกเฉิน", perm: "users.manage" as const },
    { href: "/admin/delegations", icon: UserCheck, title: "มอบอำนาจอนุมัติชั่วคราว", desc: "มอบให้เจ้าหน้าที่กลุ่ม A อนุมัติแทนระหว่างลา (ค่าตอบแทน/งบประมาณ/ตาราง) หมดเวลาคืนสิทธิ์เอง", perm: "users.manage" as const },
    { href: "/admin/backup", icon: HardDrive, title: "สำรอง/กู้คืนข้อมูล", desc: "สถานะ สำรองทันที สำรองลงดิสก์ถอดเก็บ ทดสอบกู้คืน", perm: "backup.manage" as const },
    { href: "/admin/audit", icon: History, title: "ประวัติการใช้งาน", desc: "ค้นตามผู้ใช้ ผู้ต้องขัง ช่วงวันที่", perm: "audit.view" as const },
    { href: "/admin/forms", icon: FileText, title: "คลังแบบประเมิน", desc: "ข้อคำถาม เฉลย เกณฑ์แปลผล (บันทึกเป็นเวอร์ชัน)", perm: "forms.manage" as const },
    { href: "/admin/rates", icon: Coins, title: "อัตราค่าตอบแทน", desc: "บาท/ชม. เพดานต่อวัน จำนวนวิทยากรที่เบิกได้", perm: "rates.manage" as const },
    { href: "/admin/topics", icon: BookOpen, title: "คลังหัวข้อ", desc: "ชั่วโมงมาตรฐาน ผู้รับผิดชอบ การเบิก อัตรา วิธีแบ่งค่าตอบแทน", perm: "topics.manage" as const },
    { href: "/admin/line", icon: MessageCircle, title: "LINE แจ้งตารางสอน", desc: "เปิด/ปิด เวลาส่ง ส่งทดสอบ ตัวอย่างข้อความ โควตา ประวัติการส่ง (token อยู่ใน .env)", perm: "line.manage" as const },
    { href: "/admin/print-offsets", icon: Move, title: "ปรับตำแหน่งการพิมพ์", desc: "เลื่อนทั้งหน้า ±มม. ของใบสำคัญรับเงิน แบบ KTB และสรุป เผื่อเครื่องพิมพ์เยื้อง · พิมพ์ใบทดสอบ", perm: "settings.manage" as const },
    { href: "/admin/doc-templates", icon: FileText, title: "แม่แบบเอกสารราชการ", desc: "ข้อความตั้งต้นของบันทึกข้อความ หนังสือเชิญ คำสั่ง · ตัวแปรที่ระบบเติมให้", perm: "docs.templates" as const },
    { href: "/admin/consent", icon: FileSignature, title: "แบบฟอร์มยินยอม PDPA", desc: "แก้ข้อความหนังสือยินยอม ดูตัวอย่างก่อนพิมพ์", perm: "settings.manage" as const },
    { href: "/admin/settings", icon: Settings, title: "ตั้งค่าระบบ", desc: "หน่วยงาน รหัสหน่วยงาน วันหยุด รายการเหตุผล PDPA", perm: "settings.manage" as const },
  ].filter((c) => auth.can(c.perm));
  return (
    <div className="space-y-6">
      <Breadcrumb items={[{ label: "ตั้งค่า" }]} />
      <PageHeader en="Settings" title="ตั้งค่า (ผู้ดูแลระบบ)" />
      {health.problems.length > 0 && <Alert tone="danger">{health.problems.map((p) => <p key={p}>• {p}</p>)}</Alert>}
      {stale.length > 0 && <Alert tone="warn">บัญชีผู้ช่วยที่ไม่ได้ใช้เกิน 60 วัน: {stale.map((s) => `${s.firstName} ${s.lastName}`).join(", ")} — พิจารณาระงับในหน้าผู้ใช้</Alert>}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card block transition hover:-translate-y-0.5 hover:shadow-md">
            <c.icon className="text-navy" size={32} aria-hidden />
            <h2 className="mt-2 text-xl">{c.title}</h2>
            <p className="text-muted">{c.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
