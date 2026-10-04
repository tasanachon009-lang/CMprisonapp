/** เลขประจำตัวประชาชน 13 หลัก — ตรวจ check digit และปิดบัง (สเปก 2.2, 22) */

export function normalizeNationalId(s: string): string {
  return s.replace(/[^0-9]/g, "");
}

export function isValidNationalId(input: string): boolean {
  const id = normalizeNationalId(input);
  if (!/^\d{13}$/.test(id)) return false;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(id[i]) * (13 - i);
  const check = (11 - (sum % 11)) % 10;
  return check === Number(id[12]);
}

/** 1-2345-67890-12-3 */
export function formatNationalId(input: string): string {
  const id = normalizeNationalId(input);
  if (id.length !== 13) return input;
  return `${id[0]}-${id.slice(1, 5)}-${id.slice(5, 10)}-${id.slice(10, 12)}-${id[12]}`;
}

/** x-xxxx-xxxxx-12-3 (เห็นเฉพาะ 3 หลักท้าย) */
export function maskNationalId(input: string | null | undefined): string {
  if (!input) return "-";
  const id = normalizeNationalId(input);
  if (id.length !== 13) return "x-xxxx-xxxxx-xx-x";
  return `x-xxxx-xxxxx-${id.slice(10, 12)}-${id[12]}`;
}
