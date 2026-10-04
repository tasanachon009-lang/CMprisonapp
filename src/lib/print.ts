import "server-only";
import fs from "node:fs";
import path from "node:path";
import { getDb } from "./db";
import { writeAudit } from "./audit";
import { clientIp, type Auth } from "./auth/session";
import { formatThaiDateTime } from "./thai-date";

/** ไฟล์ฟอนต์เอกสาร TH Sarabun New (เจ้าของวางไว้ที่ assets/fonts → คัดลอกไป public/fonts ตอนติดตั้ง) */
export function documentFontAvailable() {
  return fs.existsSync(path.join(process.cwd(), "public", "fonts", "THSarabunNew.ttf"));
}

/** บันทึกการพิมพ์ทุกครั้ง + คืนข้อความท้ายกระดาษ */
export async function logPrint(auth: Auth, doc: string, entityId?: string | number, personId?: number | null) {
  writeAudit(getDb(), { userId: auth.user.id, action: "print", entity: doc, entityId: entityId ?? null, personId: personId ?? null, ip: await clientIp() });
  return `พิมพ์โดย ${auth.user.fullName} วันเวลา ${formatThaiDateTime(new Date())}`;
}
