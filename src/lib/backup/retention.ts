/**
 * นโยบายเก็บไฟล์สำรอง (สเปก 3): รายวัน 30 / รายสัปดาห์ 12 / รายเดือน 12 / รายปีเก็บตลอด
 * เก็บไฟล์ "ล่าสุด" ของแต่ละวัน/สัปดาห์/เดือน/ปี — ฟังก์ชันล้วน ทดสอบได้
 */
export type BackupFileInfo = { name: string; date: string /* YYYY-MM-DD */; time: string /* HHmm */ };

export function filesToKeep(files: BackupFileInfo[], today: string): Set<string> {
  const keep = new Set<string>();
  const sorted = [...files].sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)); // ใหม่สุดก่อน
  const t = Date.parse(today + "T00:00:00Z");
  const daysAgo = (d: string) => Math.floor((t - Date.parse(d + "T00:00:00Z")) / 86400000);

  const seen = { day: new Set<string>(), week: new Set<string>(), month: new Set<string>(), year: new Set<string>() };
  for (const f of sorted) {
    const age = daysAgo(f.date);
    // ภายในวันนี้ เก็บทุกไฟล์ (หลายรอบต่อวัน)
    if (age <= 0) {
      keep.add(f.name);
      continue;
    }
    if (age < 30 && !seen.day.has(f.date)) {
      seen.day.add(f.date);
      keep.add(f.name);
    }
    const wk = isoWeek(f.date);
    if (age < 12 * 7 && !seen.week.has(wk)) {
      seen.week.add(wk);
      keep.add(f.name);
    }
    const mo = f.date.slice(0, 7);
    if (age < 366 && !seen.month.has(mo)) {
      seen.month.add(mo);
      keep.add(f.name);
    }
    const yr = f.date.slice(0, 4);
    if (!seen.year.has(yr)) {
      seen.year.add(yr);
      keep.add(f.name);
    }
  }
  return keep;
}

function isoWeek(iso: string) {
  const d = new Date(iso + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d.getTime() - firstThursday.getTime()) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${week}`;
}

/** ชื่อไฟล์: rehab-20261004-2200-nightly.rhbk */
export function parseBackupName(name: string): BackupFileInfo | null {
  const m = /^rehab-(\d{4})(\d{2})(\d{2})-(\d{4})(?:\d{2})?-[a-z_]+\.rhbk$/.exec(name);
  if (!m) return null;
  return { name, date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] };
}
