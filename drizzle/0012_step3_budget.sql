CREATE TABLE `budget_allocations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`fiscal_year` integer NOT NULL,
	`source` text NOT NULL,
	`doc_no` text,
	`doc_date` text,
	`subject` text NOT NULL,
	`course_id` integer,
	`amount_satang` integer NOT NULL,
	`target_people` integer,
	`target_cohorts` integer,
	`flexible` integer DEFAULT true NOT NULL,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_allocations_amount_int" CHECK(typeof(amount_satang) = 'integer' AND amount_satang >= 0)
);
--> statement-breakpoint
CREATE INDEX `budget_allocations_fy_idx` ON `budget_allocations` (`fiscal_year`);--> statement-breakpoint
CREATE TABLE `budget_expenses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`allocation_id` integer NOT NULL,
	`kind` text DEFAULT 'expense' NOT NULL,
	`item` text,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`doc_no` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `budget_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_expenses_amount_int" CHECK(typeof(amount_satang) = 'integer' AND amount_satang > 0)
);
--> statement-breakpoint
CREATE INDEX `budget_expenses_cohort_idx` ON `budget_expenses` (`cohort_id`);--> statement-breakpoint
CREATE TABLE `budget_lines` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`allocation_id` integer NOT NULL,
	`item` text NOT NULL,
	`label` text,
	`unit_satang` integer NOT NULL,
	`factors` text NOT NULL,
	`amount_satang` integer NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `budget_allocations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "budget_lines_amount_int" CHECK(typeof(amount_satang) = 'integer' AND amount_satang >= 0),
	CONSTRAINT "budget_lines_unit_int" CHECK(typeof(unit_satang) = 'integer' AND unit_satang >= 0)
);
--> statement-breakpoint
CREATE INDEX `budget_lines_cohort_idx` ON `budget_lines` (`cohort_id`);--> statement-breakpoint
CREATE INDEX `budget_lines_alloc_idx` ON `budget_lines` (`allocation_id`);--> statement-breakpoint
CREATE TABLE `budget_overrun_acks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`allocation_id` integer NOT NULL,
	`category` text NOT NULL,
	`over_satang` integer NOT NULL,
	`note` text NOT NULL,
	`via_delegation_id` integer,
	`created_by` integer NOT NULL,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`allocation_id`) REFERENCES `budget_allocations`(`id`) ON UPDATE no action ON DELETE no action
);
