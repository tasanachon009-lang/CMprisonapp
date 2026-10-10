CREATE TABLE `phase_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`phase` text NOT NULL,
	`start_date` text NOT NULL,
	`approved_by` integer,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `phase_records_unique` ON `phase_records` (`enrollment_id`,`phase`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `phase_records_enr_idx` ON `phase_records` (`enrollment_id`);--> statement-breakpoint
ALTER TABLE `courses` ADD `duration_weeks` integer;