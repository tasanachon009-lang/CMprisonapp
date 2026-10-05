import type { Item, Option } from "@/lib/assessments/scoring";
import { formatThaiDate } from "@/lib/thai-date";

/** ใบเช็คชื่อเปล่าของคาบ (ใช้ซ้ำในชุดฉุกเฉิน) */
export function AttendanceSheetTable({ rows }: { rows: Array<{ name: string; inmateNo: string; duplicate?: boolean }> }) {
  const cols = ["มา", "ขาด", "ลา", "ป่วย", "เหตุราชทัณฑ์"];
  return (
    <table style={{ marginTop: 6 }}>
      <thead><tr><th style={{ width: "7%" }}>ที่</th><th>ชื่อ-สกุล</th><th style={{ width: "14%" }}>เลขประจำตัว</th>{cols.map((c) => <th key={c} style={{ width: "7%" }} className="center">{c}</th>)}<th style={{ width: "14%" }}>หมายเหตุ</th></tr></thead>
      <tbody>{rows.map((r, i) => <tr key={i}><td className="center">{i + 1}</td><td>{r.name}{r.duplicate ? " (ชื่อซ้ำ)" : ""}</td><td>{r.inmateNo}</td>{cols.map((c) => <td key={c} className="center">☐</td>)}<td /></tr>)}</tbody>
    </table>
  );
}

/** แบบประเมินเปล่ามีชื่อพิมพ์ไว้ — กรอกด้วยมือแล้วนำมากรอกเร็วภายหลัง */
/**
 * แบบประเมินเปล่ามีชื่อ (สเปก 10.1) — รหัสแบบมุมขวาบน ใช้จับคู่กระดาษกับคน/แบบ/รอบตอนกรอกเร็ว
 * รหัส = รหัสแบบ-เวอร์ชัน-รอบ-เลขลงทะเบียน เช่น KNOW-v2-ก่อน-E123
 */
export function BlankForm({ title, person, inmateNo, cohort, kind, items, scoring, code, round }: { title: string; person: string; inmateNo: string; cohort: string; kind: string; items: Item[]; scoring: Record<string, unknown>; code: string; round?: string | null }) {
  const options = (scoring.options as Option[] | undefined) ?? [];
  let lastGroup = "";
  return (
    <>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <span style={{ border: "1px solid #000", padding: "1px 8px", fontFamily: "monospace", fontSize: "0.85em" }}>รหัสแบบ {code}</span>
      </div>
      <h2 className="center" style={{ fontSize: "1.15em" }}>{title}</h2>
      <p>ชื่อ-สกุล <b>{person}</b> &nbsp; เลขประจำตัว <b>{inmateNo}</b> &nbsp; {cohort} &nbsp; รอบ {round === "pre" ? <b>ก่อนเรียน</b> : round === "post" ? <b>หลังเรียน</b> : "☐ ก่อน ☐ หลัง"} &nbsp; วันที่ ....................</p>
      {kind === "items" && (
        <table style={{ marginTop: 6 }}>
          <thead><tr><th style={{ width: "6%" }}>ข้อ</th><th>ข้อคำถาม</th>{options.map((o) => <th key={o.value} className="center" style={{ width: `${Math.max(6, 40 / options.length)}%` }}>{o.label}</th>)}</tr></thead>
          <tbody>
            {items.flatMap((it) => {
              const header = it.group && it.group !== lastGroup ? it.group : null;
              lastGroup = it.group ?? lastGroup;
              return [
                ...(header ? [<tr key={`g${it.no}`}><td colSpan={options.length + 2}><b>{header}</b></td></tr>] : []),
                // ไม่พิมพ์เครื่องหมาย (−) บนแบบที่ผู้ต้องขังตอบ — ใช้คิดคะแนนในระบบเท่านั้น
                <tr key={it.no}><td className="center">{it.label ?? it.no}</td><td>{it.text}</td>{options.map((o) => <td key={o.value} className="center">☐</td>)}</tr>,
              ];
            })}
          </tbody>
        </table>
      )}
      {kind === "single" && <p style={{ marginTop: 8 }}>{options.map((o) => `☐ ${o.label}`).join("   ")}</p>}
      {kind === "depression" && (
        <>
          <p style={{ marginTop: 6 }}><b>2Q</b> (ถ้ามีข้อใด → ทำ 9Q)</p>
          <table><tbody>{items.filter((i) => i.group === "2Q").map((it, i) => <tr key={it.no}><td style={{ width: "6%" }} className="center">{i + 1}</td><td>{it.text}</td><td style={{ width: "12%" }} className="center">☐ ไม่มี</td><td style={{ width: "12%" }} className="center">☐ มี</td></tr>)}</tbody></table>
          <p style={{ marginTop: 6 }}><b>9Q</b> (0 ไม่มีเลย / 1 เป็นบางวัน / 2 เป็นบ่อย / 3 ทุกวัน) — ≥ 7 ทำ 8Q</p>
          <table><tbody>{items.filter((i) => i.group === "9Q").map((it, i) => <tr key={it.no}><td style={{ width: "6%" }} className="center">{i + 1}</td><td>{it.text}</td>{[0, 1, 2, 3].map((v) => <td key={v} style={{ width: "6%" }} className="center">☐{v}</td>)}</tr>)}</tbody></table>
          <p style={{ marginTop: 6 }}><b>8Q</b></p>
          <table><tbody>{items.filter((i) => i.group === "8Q").map((it, i) => <tr key={it.no}><td style={{ width: "6%" }} className="center">{i + 1}</td><td>{it.text}{i === 2 ? " → ถ้ามี: ควบคุมได้ ☐ ได้ ☐ ไม่ได้" : ""}</td><td style={{ width: "12%" }} className="center">☐ ไม่มี</td><td style={{ width: "12%" }} className="center">☐ มี</td></tr>)}</tbody></table>
        </>
      )}
      {kind === "fitness" && (
        <table style={{ marginTop: 6 }}>
          <tbody>
            {["1. ความดัน ...../..... ชีพจร ..... น้ำหนัก ..... กก. ส่วนสูง ..... ซม.", "2. ชีพจรก่อนกระโดด ..... หลังกระโดด 1 นาที .....", "3. วิดพื้น 30 วินาที ..... ครั้ง", "4. ระยะปลายนิ้วถึงข้อเท้า ..... ซม.", "5. ยืนทรงตัว ..... วินาที"].map((t) => (
              <tr key={t}><td>{t}</td><td style={{ width: "20%" }}>☐ ผ่าน ☐ ไม่ผ่าน</td><td style={{ width: "25%" }}>ผู้ประเมิน ..............</td></tr>
            ))}
          </tbody>
        </table>
      )}
      <p style={{ marginTop: 14 }}>ผู้ประเมิน ...................................................... วันที่ ....................</p>
    </>
  );
}

export function SignatureBlock({ lines }: { lines: Array<{ role: string; name?: string | null; position?: string | null }> }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 16, marginTop: 36 }}>
      {lines.map((l, i) => (
        <div key={i} className="center" style={{ minWidth: 200 }}>
          <p>ลงชื่อ ......................................................</p>
          <p>({l.name ?? "......................................................"})</p>
          <p>{l.position ?? l.role}</p>
        </div>
      ))}
    </div>
  );
}

export const dateTH = formatThaiDate;
