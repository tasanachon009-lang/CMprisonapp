-- สเปก 14 (ฉบับใหม่): แยก บสต. กับ รท.101
-- 1) หลักสูตร 3 วัน ต้องลง รท.101 (ทั้ง 3 หลักสูตร)
UPDATE `courses` SET `requires_rt101` = 1 WHERE `code` = 'PRE3';
--> statement-breakpoint
-- 2) รท.101 ไม่มีหลายขั้น/ไม่มีติดตาม: ลบงาน รท.101 แบบเดิมที่ยังไม่ได้ลง
DELETE FROM `bst_tasks` WHERE `system` = 'rt101' AND `step` <> 'record' AND `status` <> 'done';
--> statement-breakpoint
-- งานเดิมที่ลงแล้ว เก็บไว้เป็นประวัติแต่ไม่นับ (สถานะยกเลิก)
UPDATE `bst_tasks` SET `status` = 'cancelled', `reason` = 'รูปแบบงาน รท.101 เดิม (ก่อนแยกงาน)' WHERE `system` = 'rt101' AND `step` <> 'record';
--> statement-breakpoint
-- 3) รท.101 = 1 งานต่อคนต่อหลักสูตร สำหรับผู้ที่ครบหลักสูตรแล้ว (ครบกำหนด 7 วันหลังวันจบ)
INSERT INTO `bst_tasks` (`enrollment_id`, `system`, `step`, `due_date`, `status`)
SELECT e.`id`, 'rt101', 'record', date(e.`left_date`, '+7 day'), 'pending'
FROM `enrollments` e JOIN `courses` c ON c.`id` = e.`course_id`
WHERE e.`status` = 'completed' AND e.`deleted_at` IS NULL AND e.`left_date` IS NOT NULL AND c.`requires_rt101` = 1
ON CONFLICT DO NOTHING;
--> statement-breakpoint
-- 4) บสต.: จำหน่ายครบกำหนดหลังวันจบ (เดิมอยู่หลังติดตามครั้งสุดท้าย)
UPDATE `bst_tasks` SET `due_date` = (SELECT date(e.`left_date`, '+7 day') FROM `enrollments` e WHERE e.`id` = `bst_tasks`.`enrollment_id`)
WHERE `system` = 'bst' AND `step` = 'discharge' AND `status` = 'pending' AND `reason` IS NULL
  AND `enrollment_id` IN (SELECT `id` FROM `enrollments` WHERE `status` = 'completed' AND `left_date` IS NOT NULL);
