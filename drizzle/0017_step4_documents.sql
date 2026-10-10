CREATE TABLE `doc_templates` (
	`code` text PRIMARY KEY NOT NULL,
	`subject` text NOT NULL,
	`to_line` text DEFAULT '' NOT NULL,
	`body` text NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer,
	`template_code` text NOT NULL,
	`kind` text NOT NULL,
	`title` text NOT NULL,
	`doc_no` text,
	`doc_date` text,
	`subject` text NOT NULL,
	`to_line` text DEFAULT '' NOT NULL,
	`refs` text,
	`attachments` text,
	`body` text NOT NULL,
	`signer_name` text,
	`signer_title` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`printed_at` integer,
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
CREATE INDEX `documents_cohort_idx` ON `documents` (`cohort_id`);