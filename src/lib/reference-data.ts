/**
 * ข้อมูลอ้างอิงเริ่มต้น (ไม่ใช่ข้อมูลบุคคล) — ใช้ทั้งตอนติดตั้งจริงและตอน seed
 * ทุกค่าแก้ได้ภายหลังในหน้าตั้งค่า
 */

import { fastTotalHours, FAST_WEEK_BLOCKS } from "./fast/template";

/** สเปก 17: เกณฑ์คัดเลือกหลักสูตรฟื้นฟูก่อนพ้นโทษ 3 วัน */
export const PRE3_CRITERIA = {
  /** ต้องมีเลขบัตรประชาชน (บังคับก่อนยืนยันรับเข้า) */
  requireNationalId: true,
  /** ติ๊กยืนยัน: ผู้ต้องขังเด็ดขาด เหลือโทษไม่เกิน 6 เดือนหรือ 1 ปี */
  confirmations: [{ code: "sentence_remaining", label: "เป็นผู้ต้องขังเด็ดขาด เหลือโทษไม่เกิน 6 เดือนหรือ 1 ปี", required: true }],
  /** ประวัติยาเสพติด (คัดกรอง V.2) */
  drugClassLabel: "ประวัติยาเสพติด (คัดกรอง บคก.สธ. V.2)",
  drugClasses: [{ code: "user", label: "ผู้ใช้" }, { code: "abuser", label: "ผู้เสพ" }, { code: "addict", label: "ผู้ติด" }],
  exclusions: [{ code: "health", label: "มีปัญหาสุขภาพที่เป็นอุปสรรคต่อการเข้าร่วม" }],
  /** ป้าย "ควรพิจารณาก่อน": เข้าเกณฑ์พักโทษ/ลดวันต้องโทษ และยังไม่เคยบำบัด */
  priorityFlags: [{ code: "parole_eligible", label: "เข้าเกณฑ์พักการลงโทษ/ลดวันต้องโทษ" }],
  /** วิทยากร 1 คนต่อผู้ต้องขัง 50 คน (เตือนเมื่อเกิน) */
  peoplePerSpeaker: 50,
};

/**
 * สเปก 16: เกณฑ์รับเข้าชุมชนบำบัด FAST — นักโทษชั้นกลางขึ้นไป · อายุ 18–60 (คำนวณจากวันเกิด) ·
 * ไม่มีโรคแทรกซ้อนที่เป็นอุปสรรค · เงื่อนไขกำหนดโทษ (ตั้งค่าได้) · สมัครใจ
 */
export const FAST_CRITERIA = {
  minAge: 18,
  maxAge: 60,
  prisonerClasses: ["medium", "good", "very_good", "excellent"],
  prisonerClassLabel: "นักโทษชั้นกลางขึ้นไป",
  confirmations: [
    { code: "sentence_condition", label: "กำหนดโทษและโทษที่เหลือเข้าเงื่อนไขของโปรแกรม (เหลือโทษเพียงพอสำหรับ 6 เดือน)", required: true },
    { code: "voluntary", label: "สมัครใจเข้ารับการฟื้นฟูในรูปแบบชุมชนบำบัด", required: true },
  ],
  exclusions: [
    { code: "psych", label: "มีปัญหาจิตเวชที่เป็นอุปสรรคต่อการเข้าร่วม" },
    { code: "physical", label: "มีโรคแทรกซ้อนทางกายที่เป็นอุปสรรคต่อการเข้าร่วม" },
  ],
  /** อัตราส่วนตามสเปก 16: เจ้าหน้าที่ 1:10–15 · อส.รจ. (พี่เลี้ยง) 1:10 — เตือนเมื่อเกิน */
  membersPerStaff: 15,
  membersPerMentor: 10,
};

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
    // 24 สัปดาห์ × จันทร์–ศุกร์ = 120 วันกิจกรรม (นับเป็นสัปดาห์ตามปฏิทิน ดู planDayMap)
    durationDays: 120,
    durationWeeks: 24,
    totalHours: fastTotalHours(),
    passAttendancePct: 80,
    requiresBst: true,
    requiresRt101: true,
    requiresFollowup: true,
    enabled: true, // เปิดในขั้น 5
    color: "#2E8B57",
    sortOrder: 2,
    intakeCriteria: FAST_CRITERIA,
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
    requiresRt101: true, // สเปก 14.2: รท.101 ลงทั้ง 3 หลักสูตร
    requiresFollowup: false,
    enabled: true, // เปิดในขั้น 4
    color: "#C07A2C",
    sortOrder: 3,
    intakeCriteria: PRE3_CRITERIA,
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

/**
 * แม่แบบตาราง 3 วัน (สเปก 17: 12 กิจกรรม 15 ชม. วันละ 5 ชม.) — ⚠️ ร่างจัดเวลา ตรวจกับคู่มือแล้วแก้ที่ ตั้งค่า > แม่แบบตาราง
 * กิจกรรม 4 แบ่ง 2 ครั้ง (ชื่อลงท้าย "(1)"/"(2)" ผูกกับหัวข้อเดียวกันในคลังหัวข้อ)
 */
export const PRE3_TEMPLATE: Array<{ dayNo: number; startTime: string; endTime: string; title: string; category: string | null; hours: number; sortOrder: number }> = [
  [1, "09:00", "10:00", "ทบทวนสถานภาพ", 1],
  [1, "10:00", "11:30", "เป้าหมายและคุณค่าชีวิต", 1.5],
  [1, "13:00", "14:30", "หลีกเลี่ยงการเสพซ้ำ-สิ่งยึดเหนี่ยว", 1.5],
  [1, "14:30", "15:30", "การหาเหตุผลในการกลับไปเสพซ้ำ (1)", 1],
  [2, "09:00", "10:00", "การหาเหตุผลในการกลับไปเสพซ้ำ (2)", 1],
  [2, "10:00", "11:30", "ทักษะการปฏิเสธ", 1.5],
  [2, "13:00", "14:00", "อารมณ์ทางลบ", 1],
  [2, "14:00", "15:30", "การจัดการอารมณ์ (โกรธ รับรู้ความเครียด ลดความเครียด)", 1.5],
  [3, "09:00", "10:00", "การฟื้นฟูสัมพันธภาพ", 1],
  [3, "10:00", "11:00", "การสร้างความไว้วางใจ", 1],
  [3, "11:00", "12:00", "การเคารพคุณค่าในตนเอง", 1],
  [3, "13:00", "14:00", "การส่งต่อข้อมูลสุขภาพ", 1],
  [3, "14:00", "15:00", "ปัจฉิมนิเทศ", 1],
].map(([dayNo, startTime, endTime, title, hours], i) => ({ dayNo: dayNo as number, startTime: startTime as string, endTime: endTime as string, title: title as string, category: null, hours: hours as number, sortOrder: i + 1 }));

export const B12_TEMPLATE = B12_TOPICS.flatMap(([am, amCat, pm, pmCat], i) => {
  const dayNo = i + 1;
  return [
    { dayNo, startTime: "08:00", endTime: "08:30", title: "ประชุมเช้า", category: G4, hours: 0.5, sortOrder: 1 },
    { dayNo, startTime: "09:00", endTime: "11:00", title: am, category: amCat, hours: 2, sortOrder: 2 },
    { dayNo, startTime: "13:00", endTime: "14:00", title: pm, category: pmCat, hours: 1, sortOrder: 3 },
    { dayNo, startTime: "16:30", endTime: "18:00", title: "เขียนบันทึกประจำวัน", category: G2, hours: 1.5, sortOrder: 4 },
  ];
});

// ───────── ขั้น 3: อัตรา คลังหัวข้อ (สเปก 11.1–11.3) ─────────

/** อัตราตัวอย่าง — ⚠️ ต้องแก้เป็นอัตราจริงของหน่วยงาน (ติดป้าย "ตัวอย่าง" จนกว่าจะแก้) */
export const SAMPLE_RATES = [
  { key: "internal", name: "วิทยากรภายใน (ตัวอย่าง)", kind: "internal", externalType: null, perHourSatang: 0, dailyCapSatang: null },
  { key: "gov", name: "วิทยากรภายนอก ภาครัฐ (ตัวอย่าง)", kind: "external", externalType: "gov", perHourSatang: 60000, dailyCapSatang: null },
  { key: "private", name: "วิทยากรภายนอก ภาคเอกชน (ตัวอย่าง)", kind: "external", externalType: "private", perHourSatang: 120000, dailyCapSatang: null },
] as const;

export const ACTIVITY_TYPE_LABEL: Record<string, string> = { lecture: "บรรยาย", panel: "อภิปราย/สัมมนา", group: "แบ่งกลุ่ม/ฝึกปฏิบัติ", practice: "ฝึกปฏิบัติ", other: "อื่นๆ" };
export const EXTERNAL_TYPE_LABEL: Record<string, string> = { gov: "ราชการ", private: "เอกชน", volunteer: "อาสาสมัคร", civil: "ภาคประชาสังคม" };

type TopicSeed = { name: string; category?: string; hours?: number; activityType?: string; staffingType?: "individual" | "team"; maxStaff?: number; payable?: boolean };
const team = (name: string, category?: string, hours?: number): TopicSeed => ({ name, category, hours, activityType: "other", staffingType: "team", payable: false });

/** หัวข้อเริ่มต้นจากคู่มือ — ⚠️ ผู้ดูแลตรวจแก้ในหน้า "คลังหัวข้อ" (12 วันยังเป็นร่างเดียวกับแม่แบบตาราง) */
export const TOPIC_SEEDS: Record<string, TopicSeed[]> = {
  B12: [
    team("ประชุมเช้า", G4, 0.5),
    team("เขียนบันทึกประจำวัน", G2, 1.5),
    ...Array.from(new Map(B12_TOPICS.flatMap(([am, amCat, pm, pmCat]) => [[am, amCat], [pm, pmCat]] as Array<[string, string]>)).entries()).map(([name, category]): TopicSeed =>
      /ประเมิน/.test(name) ? team(name, category)
        : /MET/.test(name) ? { name, category, activityType: "group", maxStaff: 2 }
          : { name, category, activityType: "lecture", maxStaff: 2 }),
  ],
  PRE3: [
    "ทบทวนสถานภาพ", "เป้าหมายและคุณค่าชีวิต", "หลีกเลี่ยงการเสพซ้ำ-สิ่งยึดเหนี่ยว", "การหาเหตุผลในการกลับไปเสพซ้ำ",
    "ทักษะการปฏิเสธ", "อารมณ์ทางลบ", "การจัดการอารมณ์ (โกรธ รับรู้ความเครียด ลดความเครียด)", "การฟื้นฟูสัมพันธภาพ",
    "การสร้างความไว้วางใจ", "การเคารพคุณค่าในตนเอง", "การส่งต่อข้อมูลสุขภาพ", "ปัจฉิมนิเทศ",
  ].map((name, i): TopicSeed => (i === 11 ? team(name) : { name, activityType: "group", maxStaff: 2 })),
  FAST: [
    team("Morning Brief"), team("Staff Meeting"), team("กลุ่มประชุมเช้า"),
    ...["วงจรการใช้ยาและหยุดความคิด", "การเปลี่ยนแปลงของร่างกาย", "ตัวกระตุ้น", "ความคิด-อารมณ์-พฤติกรรม", "ความรับผิดชอบและงาน",
      "การป้องกันการเสพซ้ำ", "ความไว้วางใจ", "ทักษะการสื่อสาร", "การปฏิเสธ", "แรงจูงใจใฝ่สัมฤทธิ์", "การแก้ปัญหา", "การตั้งเป้าหมาย"]
      .map((name): TopicSeed => ({ name, category: "การเรียนรู้แบบมีส่วนร่วม", activityType: "group", maxStaff: 2 })),
    { name: "กิจกรรมครอบครัว", category: "ครอบครัว", activityType: "group", maxStaff: 2 },
    team("ประเมินก่อนจบโปรแกรม"),
    ...Array.from(new Set(FAST_WEEK_BLOCKS.map((b) => b.activity))).map((name): TopicSeed => ({ name, category: "กิจกรรมประจำวัน", activityType: "group", maxStaff: 2 })),
  ],
};
/**
 * ชิป "สิ่งที่ได้" ชุดร่างของแต่ละหัวข้อ (สเปก 22B)
 * ⚠️ ยังไม่มีไฟล์คู่มือหลักสูตรในระบบ — ร่างจากชื่อหัวข้อ ผู้ดูแลต้องตรวจกับ "จุดประสงค์การเรียนรู้" ในคู่มือ แล้วแก้ที่คลังหัวข้อ
 */
export function draftChips(name: string, staffingType: string): string[] {
  const time = ["ใช้เวลาเกิน", "เวลาไม่พอ"];
  if (/ปฏิเสธ/.test(name)) return ["ฝึกบทบาทสมมติครบทุกกลุ่ม", "สมาชิกบอกหลักการปฏิเสธได้", "สมาชิกยกตัวอย่างสถานการณ์เสี่ยงได้", ...time];
  if (/ประชุมเช้า|Morning|กลุ่มประชุมเช้า/.test(name)) return ["ทุกคนเข้าร่วม", "แจ้งข่าว/กฎบ้านครบ", "สมาชิกทบทวนปรัชญา/คำขวัญได้", "มีประเด็นต้องติดตาม"];
  if (/บันทึกประจำวัน/.test(name)) return ["ทุกคนส่งบันทึก", "มีผู้ไม่ส่งบันทึก", "พบเนื้อหาที่ต้องติดตาม"];
  if (/Staff Meeting/.test(name)) return ["ทบทวนรายบุคคลครบ", "มีมติ/งานมอบหมาย"];
  if (/ประเมิน/.test(name)) return ["ประเมินครบทุกคน", "มีผู้ประเมินไม่ครบ (ตามเก็บภายหลัง)"];
  if (/ครอบครัว/.test(name)) return ["ครอบครัวเข้าร่วม", "สมาชิกสื่อสารกับครอบครัวได้ดี", "มีครอบครัวไม่มา"];
  if (staffingType === "team") return ["ทุกคนเข้าร่วม", ...time];
  return [`สมาชิกบอกสาระสำคัญเรื่อง "${name}" ได้`, "ฝึกปฏิบัติ/อภิปรายกลุ่มครบ", "สมาชิกเชื่อมโยงกับชีวิตตนเองได้", ...time];
}

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
  // ชุมชนบำบัด (สเปก 16): ตำแหน่งในบ้าน เรียงจากสูงไปต่ำ (ลำดับ = ระดับ ใช้ตัดสินเลื่อน/ลดตำแหน่ง) — "หัวหน้าศูนย์" เป็นเจ้าหน้าที่ ไม่ใช่ตำแหน่งของสมาชิก
  tc_position: [
    ["cod", "C.O.D"],
    ["chief_expeditor", "Chief Expeditor"],
    ["expeditor", "Expeditor (หัวหน้าแผนก)"],
    ["work_leader", "Work Leader (หัวหน้าทีม)"],
    ["resident", "Resident"],
    ["newcomer", "Newcomer"],
  ],
  // ทีมงาน (งานบำบัด) — เพิ่มได้ที่ตั้งค่า
  tc_team: [
    ["pr", "ประชาสัมพันธ์"],
    ["kitchen", "ครัวและความสะอาด"],
    ["garden", "ตกแต่งและเกษตรกรรม"],
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
  // สเปก 13.1: แหล่งเงิน (ตั้งค่าได้)
  fund_source: [
    ["dept", "กรมราชทัณฑ์"],
    ["nhso", "สปสช."],
    ["oncb", "ป.ป.ส."],
    ["prison", "งบเรือนจำ"],
    ["donation", "เงินบริจาค"],
    ["other", "อื่นๆ"],
  ],
  // สเปก 13.2: หมวด/รายการงบ — รหัส "<หมวด>.<รายการ>" (หมวด: compensation ค่าตอบแทน / operating ค่าใช้สอย / materials ค่าวัสดุ)
  // ค่าวิทยากรภายใน/ภายนอก ตัดงบอัตโนมัติจากรอบเบิกที่อนุมัติแล้ว (สเปก 11.5A, 13.3)
  budget_item: [
    ["compensation.speaker_internal", "ค่าตอบแทนวิทยากรภายใน"],
    ["compensation.speaker_external", "ค่าตอบแทนวิทยากรภายนอก"],
    ["compensation.overtime", "ค่าตอบแทนนอกเวลาราชการ"],
    ["operating.food", "ค่าอาหาร/อาหารว่างและเครื่องดื่ม"],
    ["operating.copy", "ค่าถ่ายเอกสาร"],
    ["operating.contract", "ค่าจ้างเหมา"],
    ["materials.stationery", "ค่าเครื่องเขียน"],
    ["materials.equipment", "ค่าอุปกรณ์"],
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
  // สเปก 18.4: ตั้งค่าหน่วยงานครั้งเดียวสำหรับเอกสารราชการ
  "org.headName": "",
  "org.docPrefix": "",
  "docs.unitHeadName": "",
  "docs.unitHeadTitle": "",
  "docs.thaiNumerals": true,
  "pdpa.consentRequired": true,
  "security.idleLockMinutes": 15,
  "security.deviceTrustDays": 30,
  "security.maxFailedAttempts": 5,
  "security.lockoutMinutes": 15,
  "security.officeHours": { start: "07:00", end: "18:00" },
  // สเปก 2.1: ผู้ดูแลไม่ใช้ OTP เป็นค่าเริ่มต้น (ห้ามนำมือถือเข้าเรือนจำ) — เปิดได้ที่ตั้งค่า
  "security.adminOtp": false,
  // สเปก 11.4: วิทยากรสูงสุดต่อคาบเมื่อหัวข้อไม่ได้กำหนด (ขั้น 3 กำหนดรายหัวข้อในคลังหัวข้อ; 0 = ไม่จำกัด)
  "schedule.defaultMaxStaff": 2,
  // สเปก 11.1: จำนวนวิทยากรที่เบิกได้ตามลักษณะกิจกรรม — ⚠️ ค่าตัวอย่างตามแนวระเบียบค่าใช้จ่ายฝึกอบรม ให้การเงินตรวจ
  "pay.maxPayableByType": { lecture: 1, panel: 5, group: 2, practice: 2, other: 1 },
  // สเปก 9: คาบสอนชดเชยคิดค่าตอบแทนหรือไม่ (ค่าเริ่มต้น = ไม่คิด)
  "pay.makeupPayable": false,
  // สเปก 11.5C/D: เอกสารการเงิน
  "docs.payerName": "",
  "docs.voucherCorner": "เอกสารหมายเลข ๑",
  "docs.showKtbForm": true,
  // สเปก 18.2: รายงานประจำสัปดาห์ (บันทึกข้อความ) เรียนถึง
  "docs.weeklyTo": "ผู้อำนวยการสถานพยาบาล",
  // สเปก 13.2/17: แม่แบบงบของหลักสูตร — ใส่จำนวนคน → คำนวณทั้งหมด · var: people = จำนวนคน, speakers = ceil(คน/perSpeaker)
  // ⚠️ ค่าตัวอย่างจากคู่มือ (3 วัน: วิทยากร 600 × 15 ชม. ต่อ 50 คน, วัสดุ 159 บาท/คน) — แก้ได้ทุกปี
  "budget.templates": {
    PRE3: { perSpeaker: 50, lines: [
      { item: "compensation.speaker_external", unitSatang: 60000, factors: [{ qty: 15, unit: "ชม." }, { var: "speakers", unit: "คน" }] },
      { item: "materials.stationery", unitSatang: 15900, factors: [{ var: "people", unit: "คน" }] },
    ] },
    B12: { perSpeaker: 50, lines: [
      { item: "compensation.speaker_external", unitSatang: 60000, factors: [{ qty: 20, unit: "ชม." }, { var: "speakers", unit: "คน" }] },
      { item: "operating.food", unitSatang: 3500, factors: [{ var: "people", unit: "คน" }, { qty: 12, unit: "วัน" }] },
      { item: "materials.stationery", unitSatang: 2000, factors: [{ var: "people", unit: "คน" }] },
    ] },
  },
  // สเปก 12: LINE (ค่าเริ่มต้นปิด — เปิดที่ ตั้งค่า → LINE เมื่อใส่ token ในเครื่องทำงานแล้ว)
  "line.enabled": false,
  "line.sendTime": "16:00",
  "line.weeklyOnFriday": true,
  "line.weeklyReportSummary": false,
  "line.quotaWarnPct": 80,
  // สเปก 22: ปรับตำแหน่งการพิมพ์ทั้งหน้า (มม.) ต่อแบบฟอร์ม
  "print.offsets": { ktb: { dx: 0, dy: 0 }, voucher: { dx: 0, dy: 0 }, report: { dx: 0, dy: 0 } },
  "docs.ktbTemplate": {
    intro: "ขอรับเงินผ่านระบบ KTB Corporate Online โดยได้แนบสำเนาหน้าสมุดบัญชีเงินฝากธนาคารมาเพื่อเป็นหลักฐานด้วยแล้ว",
    companyNote: "(กรณีชื่อบัญชีไม่ตรงกับชื่อบริษัทฯ ห้างหุ้นส่วนจำกัด ร้านค้า ฯลฯ ให้แนบเอกสารที่เกี่ยวข้องที่แสดงว่าเป็นเจ้าของบัญชี)",
  },
  // สเปก 22B: ชิปทั่วไป (ทุกหัวข้อ) + เหตุผลสำเร็จรูป — แก้ได้ในตั้งค่า · ชิป "มีเหตุการณ์ต้องแจ้งเวร" มีเสมอ
  "report.generalChips": ["สมาชิกกล้าแสดงออก", "มีสมาชิกไม่พร้อม/ง่วง", "สมาชิกช่วยเหลือกันดี"],
  "report.reasons": {
    partial: ["เวลาไม่พอ", "เริ่มช้า (นับยอด/เบิกตัว)", "ผู้เข้าร่วมน้อย", "อุปกรณ์/สถานที่ไม่พร้อม"],
    not_done: ["เรือนจำงดกิจกรรม", "วิทยากรไม่มา", "เลื่อนไปจัดวันอื่น", "เหตุฉุกเฉิน/ปิดแดน"],
  },
  /** ติดตามหลังบำบัด: เดือนที่ (ตั้งค่าได้) */
  "followup.months": [1, 3, 6, 12],
  /** กำหนดลง บสต./รท.101 (วันนับจากวันลงทะเบียน/วันจบ) */
  "bst.dueDays": { register: 7, screen: 7, treat: 7, discharge: 7, followup: 7, rt101: 7 },
  /**
   * ผู้จบหลักสูตรแล้วออกจากเรือนจำระหว่างติดตาม: "close" ปิดการติดตาม | "continue" ติดตามต่อ (รายเหตุผล)
   * ค่าเริ่มต้น = ปิดการติดตาม (เจ้าของโครงการตัดสินใจ 4 ต.ค. 2569 — docs/decisions.md)
   */
  "release.followupPolicy": { completed_sentence: "close", parole: "close", sentence_reduction: "close", bail: "close", transfer: "close", death: "close", other: "close" },
  "backup.externalDir": "",
  "backup.removableDir": "",
};
