import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/** OTP จากแอปมือถือ (TOTP RFC 6238: SHA-1, 6 หลัก, 30 วินาที) — ใช้ได้กับ Google Authenticator / Microsoft Authenticator */
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const b of buf) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error("รหัสลับ OTP ไม่ถูกต้อง");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function generateSecret(): string {
  return base32Encode(randomBytes(20));
}

export function hotp(secret: string, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(buf).digest();
  const off = h[h.length - 1] & 15;
  const code = ((h[off] & 127) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

export const counterAt = (ms: number) => Math.floor(ms / 1000 / 30);

/** ตรวจรหัส ±1 ช่วงเวลา (เผื่อนาฬิกาคลาดเคลื่อน) — คืนค่า counter ที่ตรง (ใช้กันใช้รหัสซ้ำ) หรือ null */
export function verifyTotp(secret: string, code: string, now = Date.now(), lastCounter = -1): number | null {
  const c = code.replace(/\D/g, "");
  if (c.length !== 6) return null;
  const base = counterAt(now);
  for (const d of [0, -1, 1]) {
    const ctr = base + d;
    if (ctr <= lastCounter) continue;
    const expected = Buffer.from(hotp(secret, ctr));
    if (timingSafeEqual(expected, Buffer.from(c))) return ctr;
  }
  return null;
}

export function otpauthUrl(secret: string, account: string, issuer = "RehabSystem") {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}
