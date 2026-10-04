import { hash, verify } from "@node-rs/argon2";

// Argon2id ค่ามาตรฐาน OWASP (m=19MiB, t=2, p=1)
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export function hashPassword(pw: string): Promise<string> {
  return hash(pw, OPTS);
}

export async function verifyPassword(hashed: string, pw: string): Promise<boolean> {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}
