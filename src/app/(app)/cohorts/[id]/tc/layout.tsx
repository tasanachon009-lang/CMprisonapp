import { requirePage } from "@/lib/auth/session";
import { TcSubNav } from "./sub-nav";

/** แท็บชุมชนบำบัด: เมนูย่อย (ระยะ / ผังบ้าน / ทีมงาน / เครื่องมือบ้าน) — แต่ละหน้าตรวจสิทธิ์ของตัวเองอีกชั้น */
export default async function TcLayout({ children, params }: LayoutProps<"/cohorts/[id]/tc">) {
  const auth = await requirePage("tc.view", "tc.summary");
  const { id } = await params;
  const full = auth.can("tc.view");
  return (
    <div>
      <TcSubNav cohortId={Number(id)} show={{ house: true, teams: full, tools: false, summaryOnly: !full }} />
      {children}
    </div>
  );
}
