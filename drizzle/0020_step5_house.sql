CREATE TABLE `tc_assignments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`change_type` text,
	`reason` text,
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
CREATE UNIQUE INDEX `tc_assignments_current` ON `tc_assignments` (`enrollment_id`,`kind`) WHERE end_date IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `tc_assignments_enr_idx` ON `tc_assignments` (`enrollment_id`,`kind`,`start_date`);--> statement-breakpoint
CREATE TABLE `tc_team_reviews` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`team` text NOT NULL,
	`week_start` text NOT NULL,
	`rating` text NOT NULL,
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
CREATE UNIQUE INDEX `tc_team_reviews_unique` ON `tc_team_reviews` (`cohort_id`,`team`,`week_start`) WHERE deleted_at IS NULL;