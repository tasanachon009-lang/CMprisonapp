ALTER TABLE `cohort_sessions` ADD `max_staff` integer;--> statement-breakpoint
ALTER TABLE `session_staff` ADD `role` text;--> statement-breakpoint
-- ก่อนสร้าง unique: ปิดแถวซ้ำ (คนเดียวกันในคาบเดียวกัน) เก็บแถวแรกไว้
UPDATE `session_staff` SET `deleted_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `deleted_at` IS NULL AND `user_id` IS NOT NULL AND `id` NOT IN (
  SELECT min(`id`) FROM `session_staff` WHERE `deleted_at` IS NULL AND `user_id` IS NOT NULL GROUP BY `session_id`, `user_id`
);--> statement-breakpoint
UPDATE `session_staff` SET `deleted_at` = CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE `deleted_at` IS NULL AND `external_name` IS NOT NULL AND `id` NOT IN (
  SELECT min(`id`) FROM `session_staff` WHERE `deleted_at` IS NULL AND `external_name` IS NOT NULL GROUP BY `session_id`, `external_name`
);--> statement-breakpoint
CREATE UNIQUE INDEX `session_staff_user_unique` ON `session_staff` (`session_id`,`user_id`) WHERE deleted_at IS NULL AND user_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX `session_staff_external_unique` ON `session_staff` (`session_id`,`external_name`) WHERE deleted_at IS NULL AND external_name IS NOT NULL;
