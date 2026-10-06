/**
 * สัดส่วนวิทยากร (สเปก 17: หลักสูตร 3 วัน วิทยากร 1 คน ต่อผู้เข้าอบรม 50 คน)
 * คืน null เมื่อไม่ต้องเตือน · ไม่นับคาบที่ยังไม่มีผู้เข้าอบรม
 */
export function speakerShortfall(enrolled: number, speakers: number, perSpeaker: number | null | undefined) {
  if (!perSpeaker || perSpeaker <= 0 || enrolled <= 0) return null;
  const need = Math.ceil(enrolled / perSpeaker);
  return speakers < need ? { need, have: speakers } : null;
}
