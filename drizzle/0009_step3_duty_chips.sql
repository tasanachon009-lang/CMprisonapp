CREATE TABLE `duty_officers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`date` text NOT NULL,
	`user_id` integer NOT NULL,
	`source` text DEFAULT 'auto' NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `duty_officers_unique` ON `duty_officers` (`cohort_id`,`date`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `duty_officers_user_idx` ON `duty_officers` (`user_id`,`date`);--> statement-breakpoint
ALTER TABLE `activity_topics` ADD `outcome_chips` text;--> statement-breakpoint
ALTER TABLE `activity_topics` ADD `chips_reviewed_at` integer;--> statement-breakpoint
ALTER TABLE `session_reports` ADD `chips` text;--> statement-breakpoint
ALTER TABLE `session_reports` ADD `source` text DEFAULT 'direct' NOT NULL;