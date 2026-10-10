import { redirect } from "next/navigation";
import { getDb } from "@/lib/db";
import { getSetting } from "@/lib/bootstrap";
import { getTrustedDeviceId } from "@/lib/auth/session";
import { NatureFrames } from "@/components/nature-frames";
import { StepDots } from "@/components/step-dots";
import { OrgCodeForm } from "./org-code-form";

export default async function DevicePage() {
  if (await getTrustedDeviceId()) redirect("/login");
  const days = getSetting(getDb(), "security.deviceTrustDays", 30);
  return (
    <>
      <p lang="en" className="mb-6 font-display text-xl font-medium text-navy">A New Beginning for Healing &amp; Recovery</p>
      <div className="card w-full max-w-md">
        <h2 className="text-2xl">เข้าสู่ระบบ</h2>
        <OrgCodeForm trustDays={days} />
        <div className="mt-5"><StepDots current={1} total={2} /></div>
      </div>
      <NatureFrames />
    </>
  );
}
