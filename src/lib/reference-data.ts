/**
 * ข้อมูลอ้างอิงเริ่มต้น (ไม่ใช่ข้อมูลบุคคล) — ใช้ทั้งตอนติดตั้งจริงและตอน seed
 * ทุกค่าแก้ได้ภายหลังในหน้าตั้งค่า
 */

export const COURSES = [
  {
    code: "B12",
    name: "ปรับเปลี่ยนพฤติกรรม 12 วัน",
    shortName: "12 วัน",
    description: "หลักสูตรปรับเปลี่ยนพฤติกรรม 12 วัน 60 ชั่วโมง",
    durationDays: 12,
    totalHours: 60,
    passAttendancePct: 80,
    requiresBst: true,
    requiresRt101: true,
    requiresFollowup: true,
    enabled: true,
    color: "#3D5590",
    sortOrder: 1,
    intakeCriteria: {
      screeningMin: 4,
      screeningMax: 26,
      screeningLabel: "คะแนนคัดกรอง บคก.สธ. V2 ระดับ \"ผู้เสพ\" (4–26)",
      exclusions: [
        { code: "psych", label: "มีปัญหาจิตเวชที่เป็นอุปสรรคต่อการเข้าร่วม" },
        { code: "physical", label: "มีโรคทางกายรุนแรง" },
        { code: "infectious", label: "มีโรคติดต่อระยะแพร่เชื้อ" },
        { code: "opioid", label: "ผู้เสพกลุ่มฝิ่น/มอร์ฟีน/เฮโรอีน" },
        { code: "alcohol", label: "ติดสุราเรื้อรังรุนแรง" },
      ],
    },
  },
  {
    code: "FAST",
    name: "ชุมชนบำบัด FAST Model 6 เดือน",
    shortName: "ชุมชนบำบัด",
    description: "ชุมชนบำบัด FAST Model 24 สัปดาห์",
    durationDays: 168,
    totalHours: 0,
    passAttendancePct: 80,
    requiresBst: true,
    requiresRt101: true,
    requiresFollowup: true,
    enabled: false, // เปิดในขั้น 5
    color: "#2E8B57",
    sortOrder: 2,
    intakeCriteria: null,
  },
  {
    code: "PRE3",
    name: "ฟื้นฟูสมรรถภาพก่อนพ้นโทษ 3 วัน",
    shortName: "3 วัน",
    description: "หลักสูตรฟื้นฟูก่อนพ้นโทษ 3 วัน 15 ชั่วโมง",
    durationDays: 3,
    totalHours: 15,
    passAttendancePct: 80,
    requiresBst: false,
    requiresRt101: false,
    requiresFollowup: false,
    enabled: false, // เปิดในขั้น 4
    color: "#C07A2C",
    sortOrder: 3,
    intakeCriteria: null,
  },
] as const;

/**
 * แม่แบบตาราง 12 วัน — ⚠️ ร่างเบื้องต้น (วันละ 5 ชม. รวม 60 ชม.)
 * ประชุมเช้า 08.00 และบันทึกประจำวัน 16.30–18.00 ตามสเปก ส่วนหัวข้อกิจกรรมต้องตรวจแก้ให้ตรงคู่มือ
 * กรมราชทัณฑ์ในหน้า "ตั้งค่า > แม่แบบตาราง"
 */
const G1 = "ความรู้ยาเสพติดและการบำบัด";
const G2 = "ทักษะการใช้ชีวิต";
const G3 = "การทำหน้าที่ครอบครัว";
const G4 = "บทบาทหน้าที่และการอยู่ร่วมกับผู้อื่น";

const B12_TOPICS: Array<[string, string, string, string]> = [
  // [หัวข้อเช้า, หมวดเช้า, หัวข้อบ่าย, หมวดบ่าย]
  ["ปฐมนิเทศและสร้างสัมพันธภาพ", G4, "ประเมินก่อนเรียน", G1],
  ["ยาเสพติดกับผลต่อร่างกายและสมอง", G1, "กลุ่มเสริมสร้างแรงจูงใจ (MET) ครั้งที่ 1", G1],
  ["วงจรการเสพติดและตัวกระตุ้น", G1, "การจัดการอารมณ์", G2],
  ["การป้องกันการกลับไปเสพซ้ำ", G1, "กลุ่มเสริมสร้างแรงจูงใจ (MET) ครั้งที่ 2", G1],
  ["ทักษะการปฏิเสธ", G2, "การแก้ปัญหาและการตัดสินใจ", G2],
  ["การจัดการความเครียด", G2, "ทักษะการสื่อสาร", G2],
  ["บทบาทหน้าที่ในครอบครัว", G3, "กลุ่มเสริมสร้างแรงจูงใจ (MET) ครั้งที่ 3", G1],
  ["การสื่อสารในครอบครัว", G3, "การฟื้นฟูสัมพันธภาพ", G3],
  ["การอยู่ร่วมกับผู้อื่นและวินัย", G4, "การเห็นคุณค่าในตนเอง", G2],
  ["การตั้งเป้าหมายชีวิต", G2, "กลุ่มเสริมสร้างแรงจูงใจ (MET) ครั้งที่ 4", G1],
  ["จิตอาสาและการทำงานร่วมกัน", G4, "การวางแผนชีวิตหลังพ้นโทษ", G3],
  ["ทบทวนบทเรียน", G1, "ประเมินหลังเรียนและปัจฉิมนิเทศ", G4],
];

export const B12_TEMPLATE = B12_TOPICS.flatMap(([am, amCat, pm, pmCat], i) => {
  const dayNo = i + 1;
  return [
    { dayNo, startTime: "08:00", endTime: "08:30", title: "ประชุมเช้า", category: G4, hours: 0.5, sortOrder: 1 },
    { dayNo, startTime: "09:00", endTime: "11:00", title: am, category: amCat, hours: 2, sortOrder: 2 },
    { dayNo, startTime: "13:00", endTime: "14:00", title: pm, category: pmCat, hours: 1, sortOrder: 3 },
    { dayNo, startTime: "16:30", endTime: "18:00", title: "เขียนบันทึกประจำวัน", category: G2, hours: 1.5, sortOrder: 4 },
  ];
});

export const LOOKUPS: Record<string, Array<[code: string, label: string]>> = {
  release_reason: [
    ["completed_sentence", "พ้นโทษ"],
    ["parole", "พักการลงโทษ"],
    ["sentence_reduction", "ลดวันต้องโทษ"],
    ["bail", "ประกันตัว"],
    ["transfer", "ย้ายเรือนจำ"],
    ["death", "เสียชีวิต"],
    ["other", "อื่นๆ"],
  ],
  drop_reason: [
    ["released", "ออกจากเรือนจำ"],
    ["health", "ปัญหาสุขภาพ"],
    ["discipline", "ผิดวินัย"],
    ["voluntary", "ขอออกเอง"],
    ["other", "อื่นๆ"],
  ],
  prisoner_class: [
    ["excellent", "ชั้นเยี่ยม"],
    ["very_good", "ชั้นดีมาก"],
    ["good", "ชั้นดี"],
    ["medium", "ชั้นกลาง"],
    ["bad", "ชั้นเลว"],
    ["very_bad", "ชั้นเลวมาก"],
  ],
  location: [
    ["room1", "ห้องอบรม 1"],
    ["room2", "ห้องอบรม 2"],
    ["yard", "ลานกิจกรรม"],
  ],
  behavior_category: [
    ["helping", "ช่วยเหลือส่วนรวม"],
    ["fighting", "ทะเลาะวิวาท"],
    ["smoking", "สูบบุหรี่"],
    ["emotion", "อารมณ์"],
    ["participation", "การมีส่วนร่วม"],
    ["other", "อื่นๆ"],
  ],
  doc_type: [
    ["medical_cert", "ใบตรวจร่างกาย/ใบรับรองแพทย์"],
    ["lab", "ผลตรวจทางห้องปฏิบัติการ"],
    ["court", "เอกสารศาล"],
    ["other", "อื่นๆ"],
  ],
  substance: [
    ["meth", "ยาบ้า (เมทแอมเฟตามีน)"],
    ["ice", "ไอซ์"],
    ["cannabis", "กัญชา"],
    ["kratom", "กระท่อม/น้ำต้มกระท่อม"],
    ["heroin", "เฮโรอีน"],
    ["inhalant", "สารระเหย"],
    ["ketamine", "เคตามีน"],
    ["other", "อื่นๆ"],
  ],
};

/** วันหยุดราชการประจำ (วันที่คงที่) ปีงบ 2570 — ⚠️ วันหยุดทางพุทธศาสนาและวันหยุดชดเชยต้องเพิ่มเองในหน้าตั้งค่า */
export const DEFAULT_HOLIDAYS: Array<[string, string]> = [
  ["2026-10-13", "วันนวมินทรมหาราช"],
  ["2026-10-23", "วันปิยมหาราช"],
  ["2026-12-05", "วันพ่อแห่งชาติ"],
  ["2026-12-10", "วันรัฐธรรมนูญ"],
  ["2026-12-31", "วันสิ้นปี"],
  ["2027-01-01", "วันขึ้นปีใหม่"],
  ["2027-04-06", "วันจักรี"],
  ["2027-04-13", "วันสงกรานต์"],
  ["2027-04-14", "วันสงกรานต์"],
  ["2027-04-15", "วันสงกรานต์"],
  ["2027-05-01", "วันแรงงานแห่งชาติ"],
  ["2027-05-04", "วันฉัตรมงคล"],
  ["2027-06-03", "วันเฉลิมพระชนมพรรษาสมเด็จพระราชินี"],
  ["2027-07-28", "วันเฉลิมพระชนมพรรษา ร.10"],
  ["2027-08-12", "วันแม่แห่งชาติ"],
];

export const DEFAULT_SETTINGS: Record<string, unknown> = {
  "org.name": "เรือนจำกลางเชียงใหม่",
  "org.unitName": "สถานฟื้นฟูสมรรถภาพผู้ติดยาเสพติด",
  "org.type": "เรือนจำกลาง",
  "org.address": "",
  "org.phone": "",
  "org.headTitle": "ผู้บัญชาการเรือนจำกลางเชียงใหม่",
  "pdpa.consentRequired": true,
  "security.idleLockMinutes": 15,
  "security.deviceTrustDays": 30,
  "security.maxFailedAttempts": 5,
  "security.lockoutMinutes": 15,
  "security.officeHours": { start: "07:00", end: "18:00" },
  /** ติดตามหลังบำบัด: เดือนที่ (ตั้งค่าได้) */
  "followup.months": [1, 3, 6, 12],
  /** กำหนดลง บสต./รท.101 (วันนับจากวันลงทะเบียน/วันจบ) */
  "bst.dueDays": { register: 7, screen: 7, treat: 7, followup: 7, discharge: 7 },
  /**
   * ผู้จบหลักสูตรแล้วออกจากเรือนจำระหว่างติดตาม: "close" ปิดการติดตาม | "continue" ติดตามต่อ (รายเหตุผล)
   * ค่าเริ่มต้น = ปิดการติดตาม (เจ้าของโครงการตัดสินใจ 4 ต.ค. 2569 — docs/decisions.md)
   */
  "release.followupPolicy": { completed_sentence: "close", parole: "close", sentence_reduction: "close", bail: "close", transfer: "close", death: "close", other: "close" },
  "backup.externalDir": "",
  "backup.removableDir": "",
};
