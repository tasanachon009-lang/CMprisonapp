DROP INDEX `weekly_reports_week_unique`;--> statement-breakpoint
ALTER TABLE `weekly_reports` ADD `kind` text DEFAULT 'weekly' NOT NULL;--> statement-breakpoint
ALTER TABLE `weekly_reports` ADD `period_end` text;--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_kind_start_unique` ON `weekly_reports` (`kind`,`week_start`) WHERE deleted_at IS NULL;