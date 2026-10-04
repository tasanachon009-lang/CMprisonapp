CREATE TABLE `assessment_form_versions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`form_id` integer NOT NULL,
	`version` integer NOT NULL,
	`items` text NOT NULL,
	`scoring` text NOT NULL,
	`effective_from` text NOT NULL,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`form_id`) REFERENCES `assessment_forms`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `afv_unique` ON `assessment_form_versions` (`form_id`,`version`);--> statement-breakpoint
CREATE TABLE `assessment_forms` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`category` text NOT NULL,
	`kind` text DEFAULT 'items' NOT NULL,
	`sensitive` integer DEFAULT false NOT NULL,
	`rounds` text NOT NULL,
	`course_codes` text NOT NULL,
	`description` text,
	`active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `assessment_forms_code_unique` ON `assessment_forms` (`code`);--> statement-breakpoint
CREATE TABLE `assessment_results` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`form_id` integer NOT NULL,
	`version_id` integer NOT NULL,
	`round` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`assessed_date` text NOT NULL,
	`assessor_id` integer,
	`answers` text NOT NULL,
	`total` real,
	`level` text,
	`tone` text,
	`details` text,
	`sensitive` integer DEFAULT false NOT NULL,
	`source` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`form_id`) REFERENCES `assessment_forms`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`version_id`) REFERENCES `assessment_form_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `ar_unique` ON `assessment_results` (`enrollment_id`,`form_id`,`round`,`period`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `ar_enrollment_idx` ON `assessment_results` (`enrollment_id`);--> statement-breakpoint
CREATE TABLE `behavior_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer,
	`incarceration_id` integer NOT NULL,
	`note_date` text NOT NULL,
	`tone` text NOT NULL,
	`category` text,
	`text` text NOT NULL,
	`converted_to` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`incarceration_id`) REFERENCES `incarcerations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `behavior_notes_inc_idx` ON `behavior_notes` (`incarceration_id`,`note_date`);--> statement-breakpoint
CREATE TABLE `bst_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`system` text NOT NULL,
	`step` text NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`done_date` text,
	`done_by` integer,
	`reason` text,
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
CREATE UNIQUE INDEX `bst_tasks_unique` ON `bst_tasks` (`enrollment_id`,`system`,`step`);--> statement-breakpoint
CREATE INDEX `bst_tasks_due_idx` ON `bst_tasks` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `external_ids` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`system` text NOT NULL,
	`external_id` text NOT NULL,
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
CREATE UNIQUE INDEX `external_ids_unique` ON `external_ids` (`enrollment_id`,`system`);--> statement-breakpoint
CREATE TABLE `followups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`seq` integer NOT NULL,
	`month_offset` integer NOT NULL,
	`due_date` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`done_date` text,
	`method` text,
	`urine_result` text,
	`relapse` text,
	`occupation` text,
	`note` text,
	`bst_recorded` integer DEFAULT false NOT NULL,
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
CREATE UNIQUE INDEX `followups_unique` ON `followups` (`enrollment_id`,`seq`);--> statement-breakpoint
CREATE INDEX `followups_due_idx` ON `followups` (`status`,`due_date`);--> statement-breakpoint
CREATE TABLE `medical_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`note_date` text NOT NULL,
	`kind` text DEFAULT 'medical' NOT NULL,
	`screening_result` text,
	`opinion` text,
	`recommendation` text,
	`referral` integer DEFAULT false NOT NULL,
	`referral_detail` text,
	`referral_status` text,
	`fields` text,
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
CREATE INDEX `medical_notes_enr_idx` ON `medical_notes` (`enrollment_id`);--> statement-breakpoint
CREATE TABLE `shift_message_acks` (
	`message_id` integer NOT NULL,
	`user_id` integer NOT NULL,
	`ack_at` integer NOT NULL,
	FOREIGN KEY (`message_id`) REFERENCES `shift_messages`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `shift_acks_unique` ON `shift_message_acks` (`message_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `shift_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`author_id` integer NOT NULL,
	`level` text DEFAULT 'normal' NOT NULL,
	`body` text NOT NULL,
	`person_id` integer,
	`health_related` integer DEFAULT false NOT NULL,
	`recipient_type` text NOT NULL,
	`recipient_user_id` integer,
	`needs_action` integer DEFAULT false NOT NULL,
	`due_date` text,
	`status` text DEFAULT 'open' NOT NULL,
	`resolved_by` integer,
	`resolved_at` integer,
	`resolution` text,
	`overdue_notified_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `shift_messages_created_idx` ON `shift_messages` (`created_at`);