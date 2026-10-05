CREATE TABLE `delegations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`from_user_id` integer NOT NULL,
	`to_user_id` integer NOT NULL,
	`scopes` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`reason` text,
	`revoked_at` integer,
	`revoked_by` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `delegations_to_idx` ON `delegations` (`to_user_id`,`end_date`);--> statement-breakpoint
CREATE TABLE `pay_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`total_satang` integer,
	`tax_satang` integer,
	`approved_by` integer,
	`approved_at` integer,
	`approved_via_delegation_id` integer,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `pay_batches_cohort_idx` ON `pay_batches` (`cohort_id`);--> statement-breakpoint
CREATE TABLE `pay_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`session_id` integer NOT NULL,
	`session_staff_id` integer NOT NULL,
	`user_id` integer,
	`instructor_id` integer,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`date` text NOT NULL,
	`title` text NOT NULL,
	`hours` real NOT NULL,
	`factor` real NOT NULL,
	`split_method` text NOT NULL,
	`rate_id` integer,
	`per_hour_satang` integer NOT NULL,
	`gross_satang` integer NOT NULL,
	`cap_cut_satang` integer DEFAULT 0 NOT NULL,
	`amount_satang` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `pay_batches`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_lines_unique` ON `pay_lines` (`batch_id`,`session_staff_id`);--> statement-breakpoint
CREATE INDEX `pay_lines_person_idx` ON `pay_lines` (`user_id`,`instructor_id`);--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `split_method` text;--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `split_note` text;--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `pay_batch_id` integer;