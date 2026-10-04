/**
 * แบบประเมินที่ใส่ไว้ให้พร้อม (สเปก 15, 16A ส่วนที่ 2) — เก็บในคลังกลาง หลักสูตร 12 วันและชุมชนบำบัดเรียกใช้ร่วมกัน
 *
 * ⚠️ ข้อความข้อคำถามของ PMHQ-Thai (สงวนลิขสิทธิ์โดยกรมราชทัณฑ์) ความรู้ ทัศนคติ ความก้าวหน้า และคัดกรองโรคจิต
 *    ใส่เป็น "ข้อ 1, ข้อ 2 …" ไว้ก่อน — ผู้ดูแลพิมพ์ข้อความจริงจากคู่มือได้ในหน้า "คลังแบบประเมิน" (สร้างเวอร์ชันใหม่)
 *    เกณฑ์คิดคะแนน/แปลผล/เฉลย ตั้งไว้ตามสเปกแล้ว
 * ⚠️ 2Q/9Q/8Q ใส่ข้อความตามแบบคัดกรองของกรมสุขภาพจิต — ควรตรวจทานกับแบบฟอร์มฉบับที่หน่วยงานใช้
 */
import type { Band, Item, Option } from "./scoring";
import { Q9_BANDS, Q8_BANDS } from "./scoring";

const numbered = (n: number, note: string, extra: (i: number) => Partial<Item> = () => ({})): Item[] =>
  Array.from({ length: n }, (_, i) => ({ no: i + 1, text: `ข้อ ${i + 1} (${note})`, ...extra(i + 1) }));

const scale = (labels: Array<[number, string]>): Option[] => labels.map(([value, label]) => ({ value, label }));

export type FormDef = {
  code: string;
  name: string;
  shortName: string;
  category: string;
  kind: "items" | "depression" | "single" | "fitness" | "condition";
  sensitive: boolean;
  rounds: string[];
  courseCodes: string[];
  description?: string;
  sortOrder: number;
  items: Item[];
  scoring: Record<string, unknown>;
};

const KNOW_TRUE = [1, 2, 4, 7, 8, 11, 12, 13, 15];
const ATT_REVERSE = [1, 2, 7, 8, 9, 12, 13, 15, 16, 17];

const Q2_TEXT = [
  "ใน 2 สัปดาห์ที่ผ่านมารวมวันนี้ ท่านรู้สึก หดหู่ เศร้า หรือท้อแท้สิ้นหวัง หรือไม่",
  "ใน 2 สัปดาห์ที่ผ่านมารวมวันนี้ ท่านรู้สึก เบื่อ ทำอะไรก็ไม่เพลิดเพลิน หรือไม่",
];
const Q9_TEXT = [
  "เบื่อ ไม่สนใจอยากทำอะไร",
  "ไม่สบายใจ ซึมเศร้า ท้อแท้",
  "หลับยากหรือหลับๆ ตื่นๆ หรือหลับมากไป",
  "เหนื่อยง่ายหรือไม่ค่อยมีแรง",
  "เบื่ออาหารหรือกินมากเกินไป",
  "รู้สึกไม่ดีกับตัวเอง คิดว่าตัวเองล้มเหลวหรือครอบครัวผิดหวัง",
  "สมาธิไม่ดี เวลาทำอะไร เช่น ดูโทรทัศน์ ฟังวิทยุ หรือทำงานที่ต้องใช้ความตั้งใจ",
  "พูดช้า ทำอะไรช้าลงจนคนอื่นสังเกตเห็นได้ หรือกระสับกระส่ายไม่สามารถอยู่นิ่งได้เหมือนที่เคยเป็น",
  "คิดทำร้ายตนเอง หรือคิดว่าถ้าตายไปคงจะดี",
];
const Q8_TEXT = [
  "คิดอยากตาย หรือคิดว่าตายไปจะดีกว่า",
  "อยากทำร้ายตัวเอง หรือทำให้ตัวเองบาดเจ็บ",
  "คิดเกี่ยวกับการฆ่าตัวตาย",
  "มีแผนการที่จะฆ่าตัวตาย",
  "ได้เตรียมการที่จะทำร้ายตนเองหรือเตรียมการจะฆ่าตัวตาย โดยตั้งใจว่าจะให้ตายจริงๆ",
  "ได้ทำให้ตนเองบาดเจ็บ แต่ไม่ตั้งใจที่จะทำให้เสียชีวิต",
  "ได้พยายามฆ่าตัวตาย โดยคาดหวัง/ตั้งใจที่จะให้ตาย",
  "ตลอดชีวิตที่ผ่านมา ท่านเคยพยายามฆ่าตัวตาย",
];

export const FORM_DEFS: FormDef[] = [
  {
    code: "COND", name: "แบบประเมินสภาวะร่างกาย/จิตใจในการเข้ารับการบำบัด", shortName: "สภาวะกาย/จิต",
    category: "health_physical", kind: "condition", sensitive: true, rounds: ["pre"], courseCodes: ["B12", "FAST"], sortOrder: 1,
    description: "ถ้าผลเป็น \"ยังเข้าร่วมไม่ได้\" ระบบไม่ให้ยืนยันรับเข้า (ยกเว้นผู้ดูแล)",
    items: [], scoring: {},
  },
  {
    code: "PMHQ", name: "แบบคัดกรองสุขภาพจิต PMHQ-Thai", shortName: "PMHQ-Thai",
    category: "health_mental", kind: "items", sensitive: true, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 2,
    description: "สงวนลิขสิทธิ์โดยกรมราชทัณฑ์ — ใช้ภายในหน่วยงานตามที่ได้รับ ไม่เผยแพร่ภายนอก",
    items: numbered(24, "พิมพ์ข้อความจากแบบ PMHQ-Thai"),
    scoring: {
      method: "sum",
      options: scale([[0, "0"], [1, "1"], [2, "2"], [3, "3"]]),
      bands: [
        { min: 0, max: 28, label: "ปกติ", tone: "ok" },
        { min: 29, max: 72, label: "มีปัญหาสุขภาพจิต", tone: "danger", alert: { severity: "warning", message: "PMHQ-Thai ≥ 29: มีปัญหาสุขภาพจิต" } },
      ] satisfies Band[],
    },
  },
  {
    code: "DEP", name: "แบบคัดกรองโรคซึมเศร้า 2Q → 9Q และประเมินการฆ่าตัวตาย 8Q", shortName: "2Q/9Q/8Q",
    category: "health_mental", kind: "depression", sensitive: true, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 3,
    description: "ทำเป็นลำดับขั้นอัตโนมัติ: 2Q มีข้อใด → 9Q; 9Q ≥ 7 → 8Q",
    items: [
      ...Q2_TEXT.map((text, i) => ({ no: 100 + i + 1, text, group: "2Q" })),
      ...Q9_TEXT.map((text, i) => ({ no: 200 + i + 1, text, group: "9Q" })),
      ...Q8_TEXT.map((text, i) => ({ no: 300 + i + 1, text, group: "8Q" })),
    ],
    scoring: {
      q9Options: scale([[0, "ไม่มีเลย"], [1, "เป็นบางวัน 1–7 วัน"], [2, "เป็นบ่อย > 7 วัน"], [3, "เป็นทุกวัน"]]),
      q9Bands: Q9_BANDS,
      q8Bands: Q8_BANDS,
      q8ControlText: "ท่านสามารถควบคุมความอยากฆ่าตัวตายที่ท่านคิดอยู่นั้นได้หรือไม่ หรือบอกได้ไหมว่าคงจะไม่ทำตามความคิดนั้นในขณะนี้",
    },
  },
  {
    code: "PSY", name: "แบบคัดกรองโรคจิต", shortName: "คัดกรองโรคจิต",
    category: "health_mental", kind: "items", sensitive: true, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 4,
    description: "สัมภาษณ์คนใกล้ชิด 8 ข้อ + สัมภาษณ์ผู้ป่วย 3 ข้อ — มี = 1 รวม ≥ 1 = สงสัยโรคจิต",
    items: numbered(11, "พิมพ์ข้อความจากคู่มือ", (i) => ({ group: i <= 8 ? "สัมภาษณ์คนใกล้ชิด" : "สัมภาษณ์ผู้ป่วย", help: "คำอธิบายข้อนี้จากคู่มือ (ผู้ดูแลแก้ได้)" })),
    scoring: {
      method: "sum",
      options: scale([[0, "ไม่มี"], [1, "มี"]]),
      bands: [
        { min: 0, max: 0, label: "ไม่พบอาการ", tone: "ok" },
        { min: 1, max: 11, label: "สงสัยโรคจิต", tone: "danger", alert: { severity: "warning", message: "คัดกรองโรคจิต: สงสัยโรคจิต" } },
      ] satisfies Band[],
    },
  },
  {
    code: "KNOW", name: "แบบประเมินความรู้ความเข้าใจเกี่ยวกับยาเสพติด", shortName: "ความรู้ยาเสพติด",
    category: "knowledge", kind: "items", sensitive: false, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 10,
    description: "15 ข้อ ถูก/ผิด ข้อละ 1 คะแนน (เฉลยเป็นค่าตั้ง ผู้ดูแลแก้ได้)",
    items: numbered(15, "พิมพ์ข้อความจากคู่มือ", (i) => ({ correct: KNOW_TRUE.includes(i) })),
    scoring: {
      method: "correct",
      options: scale([[1, "ถูก"], [0, "ผิด"]]),
      // ⚠️ ช่วงระดับเป็นค่าเริ่มต้น — ผู้ดูแลกำหนดเองได้ตามสเปก
      bands: [
        { min: 0, max: 7, label: "ควรปรับปรุง", tone: "danger" },
        { min: 8, max: 11, label: "พอใช้", tone: "warn" },
        { min: 12, max: 15, label: "ดี", tone: "ok" },
      ] satisfies Band[],
    },
  },
  {
    code: "ATT", name: "แบบสอบถามทัศนคติต่อการใช้สารเสพติด", shortName: "ทัศนคติ",
    category: "attitude", kind: "items", sensitive: false, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 11,
    description: "21 ข้อ (5–1) ข้อเชิงลบกลับคะแนน: 1,2,7,8,9,12,13,15,16,17",
    items: numbered(21, "พิมพ์ข้อความจากคู่มือ", (i) => ({ reverse: ATT_REVERSE.includes(i) })),
    scoring: {
      method: "sum",
      reverseBase: 6,
      options: scale([[5, "เห็นด้วยอย่างยิ่ง"], [4, "เห็นด้วย"], [3, "ไม่แน่ใจ"], [2, "ไม่เห็นด้วย"], [1, "ไม่เห็นด้วยอย่างยิ่ง"]]),
      bands: [
        { min: 21, max: 48, label: "ต่ำ", tone: "danger" },
        { min: 49, max: 76, label: "ปานกลาง", tone: "warn" },
        { min: 77, max: 105, label: "สูง", tone: "ok" },
      ] satisfies Band[],
    },
  },
  {
    code: "MOTIV", name: "แบบสอบถามขั้นบันไดแรงจูงใจ", shortName: "แรงจูงใจ",
    category: "motivation", kind: "single", sensitive: false, rounds: ["pre", "post"], courseCodes: ["B12", "FAST"], sortOrder: 12,
    items: [],
    scoring: {
      options: scale([
        [1, "ก. ยังไม่คิดจะหยุด"],
        [2, "ข. วันหนึ่งจะไตร่ตรอง"],
        [3, "ค. ควรลดแต่ยังไม่พร้อม"],
        [4, "ง. เริ่มคิดหาวิธีเปลี่ยน"],
        [5, "จ. เริ่มลงมือเปลี่ยน"],
      ]),
    },
  },
  {
    code: "TEMP", name: "อุณหภูมิใจ (0–10)", shortName: "อุณหภูมิใจ",
    category: "motivation", kind: "single", sensitive: false, rounds: ["pre", "post"], courseCodes: ["B12"], sortOrder: 13,
    items: [],
    scoring: { options: Array.from({ length: 11 }, (_, i) => ({ value: i, label: String(i) })) },
  },
  {
    code: "FIT", name: "สมรรถภาพร่างกาย 5 ฐาน", shortName: "สมรรถภาพ 5 ฐาน",
    category: "fitness", kind: "fitness", sensitive: false, rounds: ["pre", "post"], courseCodes: ["B12"], sortOrder: 14,
    description: "1 สัญญาณชีพ+น้ำหนัก+ส่วนสูง (BMI) · 2 ชีพจรก่อน/หลังกระโดด 1 นาที · 3 วิดพื้น 30 วินาที · 4 ระยะปลายนิ้วถึงข้อเท้า · 5 เวลายืนทรงตัว",
    items: [], scoring: {},
  },
  {
    code: "PROG", name: "แบบประเมินความก้าวหน้าสมาชิก (เจ้าหน้าที่ประเมิน)", shortName: "ความก้าวหน้า",
    category: "behavior", kind: "items", sensitive: false, rounds: ["post", "monthly"], courseCodes: ["B12", "FAST"], sortOrder: 15,
    description: "27 ข้อ 10 ด้าน (1–5) — 12 วัน: หลังจบหลักสูตร · ชุมชนบำบัด: ทุกสิ้นเดือน",
    items: numbered(27, "พิมพ์ข้อความจากคู่มือ"),
    scoring: {
      method: "sum",
      options: scale([[1, "1"], [2, "2"], [3, "3"], [4, "4"], [5, "5"]]),
      // สมุดเขียน 64–100 ซ้อนกับ 100 → ใช้ 64–99 ตามสเปก
      bands: [
        { min: 27, max: 63, label: "ต่ำ/ต้องปรับปรุง", tone: "danger" },
        { min: 64, max: 99, label: "ปานกลาง", tone: "warn" },
        { min: 100, max: 135, label: "ดี", tone: "ok" },
      ] satisfies Band[],
    },
  },
];

/** แบบที่ใช้ในรอบ "ก่อนเรียน" ของหลักสูตร (ใช้สร้างงาน Baseline) */
export function formsFor(courseCode: string, round: string) {
  return FORM_DEFS.filter((f) => f.courseCodes.includes(courseCode) && f.rounds.includes(round));
}
