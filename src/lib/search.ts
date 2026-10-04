/** ค้นหาภาษาไทย: ไม่สนช่องว่าง/คำนำหน้า (สเปก 22) */

const PREFIXES = [
  "นางสาว", "เด็กชาย", "เด็กหญิง", "ว่าที่ร้อยตรี", "ว่าที่ ร.ต.", "นาย", "นาง", "น.ส.", "ด.ช.", "ด.ญ.", "mr.", "mrs.", "ms.",
];

export function stripPrefix(name: string): string {
  let s = name.trim();
  for (const p of PREFIXES) {
    if (s.toLowerCase().startsWith(p)) {
      s = s.slice(p.length);
      break;
    }
  }
  return s.trim();
}

/** คีย์ค้นหา: ตัดคำนำหน้า ช่องว่าง จุด ขีด และเป็นตัวเล็ก */
export function normalizeSearch(s: string): string {
  return stripPrefix(s).replace(/[\s.\-_/]/g, "").toLowerCase();
}

export function personSearchKey(firstName: string, lastName: string): string {
  return normalizeSearch(firstName) + normalizeSearch(lastName);
}
