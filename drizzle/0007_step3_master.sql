CREATE TABLE `activity_topics` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`name` text NOT NULL,
	`category` text,
	`standard_hours` real,
	`activity_type` text DEFAULT 'lecture' NOT NULL,
	`color` text,
	`staffing_type` text DEFAULT 'individual' NOT NULL,
	`max_staff` integer,
	`payable` integer DEFAULT true NOT NULL,
	`internal_rate_id` integer,
	`external_rates` text,
	`split_method` text DEFAULT 'full' NOT NULL,
	`default_staff` text,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`internal_rate_id`) REFERENCES `rates`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `activity_topics_unique` ON `activity_topics` (`course_id`,`name`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE TABLE `instructors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`user_id` integer,
	`external_type` text,
	`prefix` text,
	`first_name` text,
	`last_name` text,
	`position` text,
	`organization` text,
	`phone` text,
	`email` text,
	`national_id` text,
	`addr_house_no` text,
	`addr_moo` text,
	`addr_soi` text,
	`addr_road` text,
	`addr_subdistrict_id` integer,
	`addr_subdistrict` text,
	`addr_district` text,
	`addr_province` text,
	`addr_postcode` text,
	`payee_type` text DEFAULT 'person' NOT NULL,
	`company_name` text,
	`bank` text,
	`bank_branch` text,
	`account_type` text,
	`account_name` text,
	`account_no` text,
	`notify_channel` text,
	`bank_book_received` integer DEFAULT false NOT NULL,
	`bank_book_received_date` text,
	`expertise` text,
	`note` text,
	`active` integer DEFAULT true NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `instructors_user_unique` ON `instructors` (`user_id`) WHERE deleted_at IS NULL AND user_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `instructors_name_idx` ON `instructors` (`first_name`,`last_name`);--> statement-breakpoint
CREATE TABLE `rates` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`external_type` text,
	`per_hour_satang` integer NOT NULL,
	`daily_cap_satang` integer,
	`from_fiscal_year` integer NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`is_sample` integer DEFAULT false NOT NULL,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE `cohort_sessions` ADD `topic_id` integer REFERENCES activity_topics(id);--> statement-breakpoint
ALTER TABLE `course_template_sessions` ADD `topic_id` integer REFERENCES activity_topics(id);--> statement-breakpoint
ALTER TABLE `session_staff` ADD `instructor_id` integer REFERENCES instructors(id);--> statement-breakpoint
ALTER TABLE `session_staff` ADD `share_ratio` real;--> statement-breakpoint
CREATE UNIQUE INDEX `session_staff_instructor_unique` ON `session_staff` (`session_id`,`instructor_id`) WHERE deleted_at IS NULL AND instructor_id IS NOT NULL;