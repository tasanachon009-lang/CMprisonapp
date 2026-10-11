CREATE TABLE `tc_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`code` text NOT NULL,
	`level` text,
	`record_date` text NOT NULL,
	`topic` text,
	`behavior` text NOT NULL,
	`applied_by` integer,
	`observer` text,
	`start_date` text,
	`end_date` text,
	`released_date` text,
	`outcome` text,
	`details` text,
	`status` text DEFAULT 'closed' NOT NULL,
	`source_note_id` integer,
	`cancelled_by_release_id` integer,
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
CREATE INDEX `tc_records_enr_idx` ON `tc_records` (`enrollment_id`,`kind`,`record_date`);--> statement-breakpoint
CREATE INDEX `tc_records_open_idx` ON `tc_records` (`status`,`end_date`);