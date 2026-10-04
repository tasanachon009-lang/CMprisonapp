/** นโยบายรหัสผ่าน (สเปก 2.1) — ≥ 8 ตัว และห้ามง่ายเกินไป */

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "qwertyui", "qwerty123", "11111111",
  "00000000", "abcd1234", "1q2w3e4r", "aaaaaaaa", "88888888", "iloveyou", "admin123", "p@ssw0rd",
  "password123", "123123123", "987654321", "abc12345",
]);

export function checkPassword(pw: string, ctx: { firstName?: string; lastName?: string } = {}): string | null {
  if (pw.length < 8) return "รหัสผ่านต้องยาวอย่างน้อย 8 ตัวอักษร";
  if (pw.length > 128) return "รหัสผ่านยาวเกินไป";
  if (COMMON.has(pw.toLowerCase())) return "รหัสผ่านนี้ง่ายเกินไป กรุณาตั้งใหม่ให้เดายากขึ้น";
  if (/^(.)\1+$/.test(pw)) return "ห้ามใช้ตัวอักษรเดียวซ้ำกันทั้งหมด";
  if (/^\d+$/.test(pw) && isSequential(pw)) return "ห้ามใช้ตัวเลขเรียงกัน";
  const kinds = [/[a-zA-Zก-๙]/, /\d/].filter((r) => r.test(pw)).length;
  if (kinds < 2) return "รหัสผ่านต้องมีทั้งตัวอักษรและตัวเลข";
  const lower = pw.toLowerCase();
  for (const n of [ctx.firstName, ctx.lastName]) {
    if (n && n.length >= 3 && lower.includes(n.toLowerCase())) return "ห้ามใช้ชื่อหรือนามสกุลของตัวเองในรหัสผ่าน";
  }
  return null;
}

function isSequential(s: string) {
  let up = true, down = true;
  for (let i = 1; i < s.length; i++) {
    const d = s.charCodeAt(i) - s.charCodeAt(i - 1);
    if (d !== 1) up = false;
    if (d !== -1) down = false;
  }
  return up || down;
}
