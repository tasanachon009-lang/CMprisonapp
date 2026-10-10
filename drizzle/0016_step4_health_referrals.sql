CREATE TABLE `health_referrals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`recorded_date` text NOT NULL,
	`needs_referral` integer NOT NULL,
	`physical` text DEFAULT '[]' NOT NULL,
	`physical_other` text,
	`mental` text,
	`treatment_plan` text,
	`coverage` text,
	`coverage_note` text,
	`hospital` text,
	`medications` text,
	`printed_at` integer,
	`printed_by` integer,
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
CREATE UNIQUE INDEX `health_referrals_enr_unique` ON `health_referrals` (`enrollment_id`) WHERE deleted_at IS NULL;