import fs from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import sharp from "sharp";
import { config } from "./config";

/**
 * รูปถ่ายประจำตัว (สเปก 7.6): ย่ออัตโนมัติ ด้านยาว 800 px + รูปเล็ก 200 px
 * เก็บไฟล์ในโฟลเดอร์ข้อมูลบนเซิร์ฟเวอร์ (ไม่เก็บในฐานข้อมูล) ลบข้อมูล EXIF (ตำแหน่ง/เวลา) ออก
 */
export const PHOTO_MAX_BYTES = 8 * 1024 * 1024;

export async function savePhoto(buf: Buffer, prefix: string) {
  const dir = path.join(config.uploadsDir, "photos");
  fs.mkdirSync(dir, { recursive: true });
  const id = `${prefix}-${randomBytes(8).toString("hex")}`;
  const img = sharp(buf, { failOn: "error" }).rotate(); // หมุนตาม EXIF แล้วทิ้ง EXIF
  const meta = await img.metadata();
  if (!meta.format || !["jpeg", "png", "webp", "heif"].includes(meta.format)) throw new Error("รองรับเฉพาะไฟล์รูป JPG / PNG / WEBP / HEIC");
  await img.clone().resize(800, 800, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(path.join(dir, `${id}.jpg`));
  await img.clone().resize(200, 200, { fit: "cover", position: "attention" }).jpeg({ quality: 78 }).toFile(path.join(dir, `${id}-t.jpg`));
  return { photoPath: `photos/${id}.jpg`, thumbPath: `photos/${id}-t.jpg` };
}

/** อ่านไฟล์ในโฟลเดอร์ uploads อย่างปลอดภัย (กัน path traversal) */
export function resolveUpload(rel: string): string | null {
  const base = path.resolve(config.uploadsDir);
  const full = path.resolve(base, rel);
  if (!full.startsWith(base + path.sep)) return null;
  return fs.existsSync(full) ? full : null;
}
