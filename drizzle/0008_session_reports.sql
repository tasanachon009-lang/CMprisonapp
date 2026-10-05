CREATE TABLE `session_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`outcome` text NOT NULL,
	`reason` text,
	`participation` text,
	`summary` text,
	`issues` text,
	`participants` integer,
	`proxy_entry` integer DEFAULT false NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_reports_session_unique` ON `session_reports` (`session_id`) WHERE deleted_at IS NULL;--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `taught_at` integer;--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `taught_by` integer;--> statement-breakpoint
ALTER TABLE `session_staff` ADD `did_teach` integer DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE `session_staff` ADD `actual_hours` real;--> statement-breakpoint
ALTER TABLE `session_staff` ADD `invite_status` text;--> statement-breakpoint
ALTER TABLE `session_staff` ADD `invite_updated_at` integer;