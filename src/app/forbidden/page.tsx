import Link from "next/link";
import { ShieldOff } from "lucide-react";

export default function ForbiddenPage() {
  return (
    <main className="mx-auto mt-24 max-w-md px-4">
      <div className="card text-center">
        <ShieldOff className="mx-auto text-danger" size={48} aria-hidden />
        <h1 className="mt-3 text-2xl">ไม่มีสิทธิ์เข้าหน้านี้</h1>
        <p className="mt-2 text-muted">กรุณาติดต่อผู้ดูแลระบบ</p>
        <Link href="/" className="btn-primary mt-6">กลับหน้าแรก</Link>
      </div>
    </main>
  );
}
