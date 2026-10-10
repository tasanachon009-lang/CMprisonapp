import { desc, eq } from "drizzle-orm";
import type { DB } from "../db";
import { schema } from "../db";
import { config } from "../config";
import { getSetting } from "../bootstrap";
import { notify } from "../notify";
import { RuleError } from "../errors";
import { splitText, looksLikeInmateData } from "./messages";

/**
 * ส่ง LINE Broadcast (สเปก 12) — เชื่อมต่อออกได้เฉพาะ api.line.me (สเปก 2.5)
 * โหมดทดลอง (บันทึกข้อความแต่ไม่ส่งจริง) เมื่อ: ไม่มี token ใน .env หรือฐานข้อมูลเป็นข้อมูลปลอม (seed)
 * — กันไม่ให้ตารางจากข้อมูลปลอมไปถึงเจ้าหน้าที่จริง (decisions 5 ต.ค. 2569)
 */
const LINE_API = "https://api.line.me";

export type LineKind = "daily" | "weekly_schedule" | "change" | "test" | "weekly_report";
export const LINE_KIND_LABEL: Record<LineKind, string> = { daily: "ตารางพรุ่งนี้", weekly_schedule: "ตารางสัปดาห์หน้า", change: "แจ้งเปลี่ยนแปลง", test: "ทดสอบ", weekly_report: "สรุปรายงานสัปดาห์" };
export const LINE_STATUS_LABEL: Record<string, string> = { sent: "ส่งแล้ว", dry_run: "โหมดทดลอง (ไม่ได้ส่งจริง)", failed: "ส่งไม่สำเร็จ" };

export function lineMode(db: DB): { live: boolean; reason: string | null } {
  if (!config.lineToken) return { live: false, reason: "ยังไม่ได้ตั้งค่าการเชื่อมต่อ LINE" };
  if (getSetting<boolean>(db, "app.isDemoData", false) === true) return { live: false, reason: "ฐานข้อมูลนี้เป็นข้อมูลตัวอย่าง" };
  return { live: true, reason: null };
}

export function lineEnabled(db: DB) {
  return getSetting<boolean>(db, "line.enabled", false) === true;
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

/** ส่งข้อความ (หลายข้อความ = หลายคำขอ ครั้งละไม่เกิน 5) · บันทึกประวัติทุกครั้ง · ล้มเหลว → แจ้งผู้ดูแล */
export async function sendLine(db: DB, kind: LineKind, text: string, o: { targetDate?: string | null; contentHash?: string | null; sentBy?: number | null; fetcher?: Fetcher } = {}) {
  if (looksLikeInmateData(text)) throw new RuleError("ข้อความมีรูปแบบคล้ายข้อมูลผู้ต้องขัง — ระงับการส่ง (ข้อความ LINE ห้ามมีข้อมูลผู้ต้องขัง)");
  const mode = lineMode(db);
  const base = { kind, targetDate: o.targetDate ?? null, text, contentHash: o.contentHash ?? null, sentBy: o.sentBy ?? null };
  if (!mode.live) {
    return db.insert(schema.lineMessages).values({ ...base, status: "dry_run", error: mode.reason }).returning().get();
  }
  const chunks = splitText(text);
  const doFetch = o.fetcher ?? fetch;
  try {
    for (let i = 0; i < chunks.length; i += 5) {
      const res = await doFetch(`${LINE_API}/v2/bot/message/broadcast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.lineToken}`, "X-Line-Retry-Key": crypto.randomUUID() },
        body: JSON.stringify({ messages: chunks.slice(i, i + 5).map((t) => ({ type: "text", text: t })) }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const body = (await res.text()).slice(0, 300);
        throw Object.assign(new Error(`LINE ตอบกลับ ${res.status}: ${body}`), { status: res.status });
      }
    }
    return db.insert(schema.lineMessages).values({ ...base, status: "sent", httpStatus: 200 }).returning().get();
  } catch (e) {
    const status = (e as { status?: number }).status ?? null;
    const msg = e instanceof Error ? e.message : String(e);
    const row = db.insert(schema.lineMessages).values({ ...base, status: "failed", httpStatus: status, error: msg.slice(0, 500) }).returning().get();
    notify(db, { role: "admin", severity: "danger", kind: "line_failed", message: `ส่ง LINE (${LINE_KIND_LABEL[kind]}) ไม่สำเร็จ — เปิดหน้า LINE แล้วกด "คัดลอกข้อความ" ส่งเองในกลุ่ม LINE`, link: "/admin/line" });
    return row;
  }
}

/** โควตาข้อความเดือนนี้ (นับตามจำนวนผู้รับ) — null เมื่อโหมดทดลอง/เรียกไม่สำเร็จ */
export async function lineQuota(db: DB, fetcher: Fetcher = fetch): Promise<{ limit: number | null; used: number; pct: number | null } | null> {
  if (!lineMode(db).live) return null;
  try {
    const h = { Authorization: `Bearer ${config.lineToken}` };
    const [q, c] = await Promise.all([
      doJson(fetcher, `${LINE_API}/v2/bot/message/quota`, h),
      doJson(fetcher, `${LINE_API}/v2/bot/message/quota/consumption`, h),
    ]);
    const limit = q.type === "limited" ? Number(q.value) : null;
    const used = Number(c.totalUsage ?? 0);
    return { limit, used, pct: limit ? Math.round((used / limit) * 100) : null };
  } catch {
    return null;
  }
}

async function doJson(fetcher: Fetcher, url: string, headers: Record<string, string>) {
  const r = await fetcher(url, { headers, signal: AbortSignal.timeout(10000) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as Record<string, unknown>;
}

export function lastMessage(db: DB, kind: LineKind, targetDate: string) {
  return db.select().from(schema.lineMessages).where(eq(schema.lineMessages.kind, kind)).orderBy(desc(schema.lineMessages.id)).all().find((m) => m.targetDate === targetDate && m.status !== "failed") ?? null;
}
