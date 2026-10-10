# โครงสร้างข้อมูล (สเปกหัวข้อ 5)

ไฟล์จริง: `src/lib/db/schema.ts` · migration: `drizzle/`

```
บุคคล (persons) ── 1:N ── การต้องโทษ (incarcerations: เลขประจำตัว unique)
                                │
                                └── 1:N ── การลงทะเบียน (enrollments) ── N:1 ── รุ่น (cohorts) ── N:1 ── หลักสูตร (courses)
                                                 │                               │
                                                 └── 1:N ── เช็คชื่อ (attendance) ┘── 1:N ── คาบ (cohort_sessions)
```

## หลักการ
- **วันที่ปฏิทิน** เก็บเป็นข้อความ `YYYY-MM-DD` (ค.ศ.) — แสดง พ.ศ. ผ่าน `src/lib/thai-date.ts` (ฟังก์ชันกลางที่เดียว รวมปีงบประมาณ)
- **เวลาเหตุการณ์** เก็บเป็นมิลลิวินาที เวลาไทยใช้ `Asia/Bangkok` เสมอ
- **เงิน** เก็บเป็นสตางค์ (จำนวนเต็ม) ทุกตาราง · งบประมาณมี CHECK ในฐานข้อมูลบังคับจำนวนเต็มไม่ติดลบ
- ทุกตารางงานมี `created_by/at, updated_by/at, deleted_at, deleted_by, version` (soft delete + กันบันทึกทับ)
- **กันซ้ำที่ฐานข้อมูล:** `incarcerations.inmate_no` unique · `persons.national_id` unique (เมื่อมี) · `enrollments(incarceration, course, override_seq)` unique · `attendance(session, enrollment)` unique · `cohorts(course, fiscal_year, number)` unique
- **ปลดล็อกลงซ้ำ:** ผู้ดูแลได้ `override_seq` ถัดไป + เหตุผล + ผู้อนุมัติ (ฐานข้อมูลยังกันซ้ำโดยไม่ตั้งใจได้)
- **audit_logs** เพิ่มได้อย่างเดียว — trigger ห้าม UPDATE/DELETE (migration `0001_audit_append_only.sql`)

## ตารางในขั้นที่ 1
| กลุ่ม | ตาราง |
|---|---|
| ผู้ใช้/ความปลอดภัย | users, user_roles, permission_grants (ปรับรายคน/รายรุ่น/ช่วงวันที่), sessions, trusted_devices, dual_approvals, audit_logs, notifications, drafts, edit_presence |
| ตั้งค่า | settings (key→JSON), lookups (คลังเหตุผล/สถานที่/สาร ฯลฯ), holidays |
| ทะเบียน | persons, incarcerations, drug_use_history, contacts, document_records |
| หลักสูตร | courses, course_template_sessions, cohorts, cohort_sessions, session_staff |
| การอบรม | enrollments (รวม PDPA consent + intake), attendance, release_events (เก็บผลที่ระบบทำไว้ย้อนกลับได้), import_batches |
| ระบบ | backup_runs, restore_tests, job_runs (งานตั้งเวลา + ทำย้อนหลังเมื่อเปิดเครื่อง) |

## ตารางและคอลัมน์ที่เพิ่มในขั้นที่ 2
| กลุ่ม | ตาราง/คอลัมน์ | หมายเหตุ |
|---|---|---|
| แบบประเมิน | assessment_forms, assessment_form_versions, assessment_results | เกณฑ์/ข้อความแช่แข็งเป็นเวอร์ชัน (ผลเก่าผูก `version_id` เดิม) · ผล 1 แถวต่อ `(enrollment, form, round, period)` · `channel` (paper/system) + `paper_location` (migration 0006) |
| สถานพยาบาล | medical_notes | ข้อมูลอ่อนไหว — เห็นเฉพาะสิทธิ์สุขภาพ |
| ส่งต่อสุขภาพก่อนพ้นโทษ (ขั้น 4) | health_referrals | 1 แถวต่อการลงทะเบียน (หลักสูตร 3 วัน กิจกรรม 11) — ข้อมูลอ่อนไหว · ประวัติการแก้ไขไม่เก็บชื่อโรค · ไม่เชื่อมระบบ HIV |
| บสต./รท.101 | bst_tasks, external_ids, followups | **แยกระบบด้วย `system`**: `bst` = ลงทะเบียน→คัดกรอง→บำบัด→จำหน่าย→ติดตาม 1–4 · `rt101` = งานเดียว `record` เมื่อครบหลักสูตร (migration 0004 แปลงข้อมูลเดิม) · followups นับจากวันจำหน่าย |
| จดหมายเวร | shift_messages, shift_message_acks | ผู้รับ: `next_shift` / `all` / `user` / `cohort` (`recipient_cohort_id`, migration 0003) |
| พฤติกรรม | behavior_notes | ผูกการต้องโทษ (+ การลงทะเบียน ถ้ามี) |
| ตาราง/วิทยากร | `session_staff.role` (lead/co), unique คนซ้ำในคาบ · `cohort_sessions.max_staff` | migration 0005 — 1 คาบมีวิทยากรได้หลายคน (สเปก 11.4) |
| สิทธิ์ | `permission_grants.scope = 'cohort:N'` | มอบหมายรายรุ่นได้เฉพาะ: เช็คชื่อคาบของตน, ญาติ/ผู้ติดต่อ, ดู/บันทึก บสต.-ติดตาม, บันทึกพฤติกรรม |
## ตารางและคอลัมน์ที่เพิ่มในขั้นที่ 3 (migration 0007–0014)
| กลุ่ม | ตาราง/คอลัมน์ | หมายเหตุ |
|---|---|---|
| อัตรา | rates | สตางค์ · ภายใน/ภายนอก (+ประเภทภายนอก) · เพดานต่อวัน · ใช้ตั้งแต่ปีงบ · `is_sample` = อัตราตัวอย่าง |
| วิทยากร | instructors | ภายใน = `user_id` (unique) · ภายนอก = ข้อมูลในตาราง · ที่อยู่แยกช่อง · บัญชี KTB · เลขบัตร/ที่อยู่/บัญชี = ข้อมูลอ่อนไหว (audit ไม่เก็บค่า) |
| คลังหัวข้อ | activity_topics (+ `outcome_chips`, `chips_reviewed_at`) · `cohort_sessions.topic_id` · `course_template_sessions.topic_id` | รายบุคคล (สูงสุด N) / ทั้งทีม · เบิกได้ · อัตราภายใน/ภายนอก · วิธีแบ่ง full/equal/ratio · ชิป "สิ่งที่ได้" |
| วิทยากรในคาบ | `session_staff.instructor_id`, `share_ratio`, `did_teach`, `actual_hours`, `invite_status` | สอนจริงรายคน · สถานะเชิญวิทยากรภายนอก |
| ปิดคาบ | session_reports (+ `chips`, `source`) · `cohort_sessions.taught_at/by`, `split_method/note`, `pay_batch_id` | 1 คาบ 1 ผล · บันทึกแทน (`proxy_entry`) · คัดลอกจากใบของวิทยากร (`source = paper_copy`) |
| ผู้รับผิดชอบประจำวัน | duty_officers | 1 คนต่อรุ่นต่อวัน (unique) · หมุนเวียน (`auto`) / กำหนดเอง (`manual`) |
| ค่าตอบแทน | pay_batches, pay_lines, pay_vouchers | รอบเบิก (รุ่น + ช่วงวันที่) · อนุมัติ = เก็บยอดคงที่ใน pay_lines + ล็อกคาบ · สถานะใบพิมพ์/เซ็นรับรายคน |
| มอบอำนาจ | delegations | ขอบเขต pay/budget/schedule · ช่วงวันที่ · ยกเลิกได้ · ผู้มอบต้องยังเป็นผู้ดูแล |
| งบประมาณ | budget_allocations, budget_lines, budget_expenses, budget_overrun_acks | สตางค์ + CHECK จำนวนเต็ม · **trigger กันรวมงบทุกรุ่นเกินยอดจัดสรร** (0013) · ค่าวิทยากรไม่เก็บ คำนวณจากรอบเบิกที่อนุมัติแล้ว |
| LINE / รายงาน | line_messages, weekly_reports | ประวัติการส่ง (sent/dry_run/failed + แฮชตารางเพื่อแจ้งเปลี่ยนแปลง) · รายงานสัปดาห์ (ร่าง/อนุมัติ, ข้อมูล JSON ณ วันอนุมัติ) |
## ขั้นถัดไป (เพิ่มด้วย migration โดยผูกกับตารางข้างบน ไม่รื้อของเดิม)
| ขั้น | ตารางที่จะเพิ่ม | ผูกกับ |
|---|---|---|
| 4 | ✅ `cohorts.project_steps` (JSON ขั้นตอนโครงการ 7 ขั้น — migration 0015), health_referrals, document_templates | cohorts / enrollments |
| 5 | house_positions, teams, house_tools, discipline_records, progress_book_entries | enrollments |
| 6 | targets, fiscal_year_closures, duty_logs | courses / cohorts |
