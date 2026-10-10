import fs from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { createGzip, createGunzip } from "node:zlib";
import { pipeline } from "node:stream/promises";

/**
 * รูปแบบไฟล์สำรอง .rhbk
 *   "RHBK1" (5 ไบต์) | IV 12 ไบต์ | ข้อมูล (gzip แล้วเข้ารหัส AES-256-GCM) | auth tag 16 ไบต์
 */
const MAGIC = Buffer.from("RHBK1");

export function parseKey(hex: string): Buffer {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("กุญแจสำรองข้อมูล (BACKUP_KEY) ไม่ถูกต้อง ต้องเป็นเลขฐานสิบหก 64 ตัว");
  return Buffer.from(hex, "hex");
}

export async function encryptFile(src: string, dest: string, keyHex: string) {
  const key = parseKey(keyHex);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const out = fs.createWriteStream(dest);
  out.write(MAGIC);
  out.write(iv);
  await pipeline(fs.createReadStream(src), createGzip({ level: 6 }), cipher, out, { end: false });
  await new Promise<void>((res, rej) => out.end(cipher.getAuthTag(), () => res()).on("error", rej));
}

export async function decryptFile(src: string, dest: string, keyHex: string) {
  const key = parseKey(keyHex);
  const size = fs.statSync(src).size;
  const fd = fs.openSync(src, "r");
  const head = Buffer.alloc(17);
  const tag = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 17, 0);
  fs.readSync(fd, tag, 0, 16, size - 16);
  fs.closeSync(fd);
  if (!head.subarray(0, 5).equals(MAGIC)) throw new Error("ไม่ใช่ไฟล์สำรองของระบบนี้");
  const decipher = createDecipheriv("aes-256-gcm", key, head.subarray(5, 17));
  decipher.setAuthTag(tag);
  await pipeline(fs.createReadStream(src, { start: 17, end: size - 17 }), decipher, createGunzip(), fs.createWriteStream(dest));
}

export async function sha256File(file: string): Promise<string> {
  const h = createHash("sha256");
  await pipeline(fs.createReadStream(file), h);
  return h.digest("hex");
}
