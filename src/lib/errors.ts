import type { RuleResult } from "./rules/enrollment-rules";

/** ข้อผิดพลาดตามกฎงาน — ข้อความแสดงให้ผู้ใช้ได้ตรงๆ (บอกว่าต้องทำอะไร) */
export class RuleError extends Error {
  constructor(message: string, public result?: RuleResult, public code?: string) {
    super(message);
  }
}
