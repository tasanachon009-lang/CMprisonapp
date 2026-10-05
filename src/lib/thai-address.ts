import "server-only";
import data from "./data/thai-address.json";

/**
 * ที่อยู่ไทย (ตำบล/แขวง → อำเภอ/เขต → จังหวัด → รหัสไปรษณีย์) ใช้งานออฟไลน์
 * ข้อมูล: kongvut/thai-province-data (MIT) — สร้างใหม่ด้วย scripts/build-thai-address.mjs
 */
type Raw = { p: Array<[number, string]>; d: Array<[number, number, string]>; s: Array<[number, number, string, string]> };
export type SubdistrictHit = { id: number; subdistrict: string; district: string; province: string; postcode: string };

let index: SubdistrictHit[] | null = null;
function all(): SubdistrictHit[] {
  if (index) return index;
  const raw = data as unknown as Raw;
  const prov = new Map(raw.p.map(([id, name]) => [id, name]));
  const dist = new Map(raw.d.map(([id, pid, name]) => [id, { name, province: prov.get(pid) ?? "" }]));
  index = raw.s.map(([id, did, name, zip]) => {
    const d = dist.get(did);
    return { id, subdistrict: name, district: d?.name ?? "", province: d?.province ?? "", postcode: zip };
  });
  return index;
}

/** ค้นหาตำบล: พิมพ์ชื่อตำบล (และต่อด้วยอำเภอ/จังหวัดได้ เช่น "ช้างเผือก เมือง เชียงใหม่") หรือรหัสไปรษณีย์ */
export function searchSubdistricts(q: string, limit = 20): SubdistrictHit[] {
  const words = q.trim().split(/\s+/).filter(Boolean);
  if (!words.length || words.join("").length < 2) return [];
  const [first, ...rest] = words;
  const scored: Array<[number, SubdistrictHit]> = [];
  for (const h of all()) {
    if (/^\d+$/.test(first)) {
      if (!h.postcode.startsWith(first)) continue;
    } else if (!h.subdistrict.includes(first)) continue;
    if (rest.some((w) => !(`${h.district} ${h.province}`.includes(w)))) continue;
    // ชื่อตรงทั้งคำมาก่อน แล้วขึ้นต้นด้วยคำค้น
    const score = h.subdistrict === first ? 0 : h.subdistrict.startsWith(first) ? 1 : 2;
    scored.push([score, h]);
  }
  return scored.sort((a, b) => a[0] - b[0] || a[1].province.localeCompare(b[1].province, "th")).slice(0, limit).map(([, h]) => h);
}

export function subdistrictById(id: number): SubdistrictHit | null {
  return all().find((h) => h.id === id) ?? null;
}
