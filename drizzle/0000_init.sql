CREATE TABLE `attendance` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`enrollment_id` integer NOT NULL,
	`status` text NOT NULL,
	`corrections_type` text,
	`note` text,
	`source` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`enrollment_id`) REFERENCES `enrollments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_unique` ON `attendance` (`session_id`,`enrollment_id`);--> statement-breakpoint
CREATE INDEX `attendance_enrollment_idx` ON `attendance` (`enrollment_id`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`user_id` integer,
	`action` text NOT NULL,
	`entity` text,
	`entity_id` text,
	`person_id` integer,
	`before` text,
	`after` text,
	`note` text,
	`ip` text
);
--> statement-breakpoint
CREATE INDEX `audit_at_idx` ON `audit_logs` (`at`);--> statement-breakpoint
CREATE INDEX `audit_user_idx` ON `audit_logs` (`user_id`,`at`);--> statement-breakpoint
CREATE INDEX `audit_person_idx` ON `audit_logs` (`person_id`,`at`);--> statement-breakpoint
CREATE TABLE `backup_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`kind` text NOT NULL,
	`status` text NOT NULL,
	`file_name` text,
	`size_bytes` integer,
	`sha256` text,
	`targets` text,
	`row_counts` text,
	`error` text,
	`triggered_by` integer
);
--> statement-breakpoint
CREATE INDEX `backup_runs_started_idx` ON `backup_runs` (`started_at`);--> statement-breakpoint
CREATE TABLE `cohort_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`cohort_id` integer NOT NULL,
	`date` text NOT NULL,
	`day_no` integer,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`hours` real NOT NULL,
	`location` text,
	`takes_attendance` integer DEFAULT true NOT NULL,
	`makeup_of_id` integer,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`attendance_checked_at` integer,
	`attendance_checked_by` integer,
	`locked_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`makeup_of_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cohort_sessions_idx` ON `cohort_sessions` (`cohort_id`,`date`);--> statement-breakpoint
CREATE INDEX `cohort_sessions_date_idx` ON `cohort_sessions` (`date`);--> statement-breakpoint
CREATE TABLE `cohorts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`fiscal_year` integer NOT NULL,
	`number` integer NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL,
	`target_count` integer,
	`location` text,
	`note` text,
	`closed_at` integer,
	`closed_by` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cohorts_unique` ON `cohorts` (`course_id`,`fiscal_year`,`number`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `cohorts_dates_idx` ON `cohorts` (`start_date`,`end_date`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`kind` text NOT NULL,
	`name` text,
	`relation` text,
	`phone` text,
	`address` text,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_person_idx` ON `contacts` (`person_id`);--> statement-breakpoint
CREATE TABLE `course_template_sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`course_id` integer NOT NULL,
	`day_no` integer NOT NULL,
	`start_time` text NOT NULL,
	`end_time` text NOT NULL,
	`title` text NOT NULL,
	`category` text,
	`hours` real NOT NULL,
	`takes_attendance` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cts_course_idx` ON `course_template_sessions` (`course_id`,`day_no`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`short_name` text NOT NULL,
	`description` text,
	`duration_days` integer NOT NULL,
	`skip_holidays` integer DEFAULT true NOT NULL,
	`skip_weekends` integer DEFAULT true NOT NULL,
	`total_hours` real NOT NULL,
	`pass_attendance_pct` integer DEFAULT 80 NOT NULL,
	`requires_bst` integer DEFAULT false NOT NULL,
	`requires_rt101` integer DEFAULT false NOT NULL,
	`requires_followup` integer DEFAULT false NOT NULL,
	`enabled` integer DEFAULT false NOT NULL,
	`intake_criteria` text,
	`color` text,
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
CREATE UNIQUE INDEX `courses_code_unique` ON `courses` (`code`);--> statement-breakpoint
CREATE TABLE `document_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incarceration_id` integer NOT NULL,
	`doc_type` text NOT NULL,
	`doc_date` text,
	`result` text,
	`issuer` text,
	`storage_location` text,
	`note` text,
	`file_path` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`incarceration_id`) REFERENCES `incarcerations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_records_inc_idx` ON `document_records` (`incarceration_id`);--> statement-breakpoint
CREATE TABLE `drafts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`key` text NOT NULL,
	`data` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `drafts_user_key` ON `drafts` (`user_id`,`key`);--> statement-breakpoint
CREATE TABLE `drug_use_history` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incarceration_id` integer NOT NULL,
	`substance` text NOT NULL,
	`age_started` integer,
	`frequency` text,
	`times_per_month` integer,
	`duration_years` real,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`incarceration_id`) REFERENCES `incarcerations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `drug_use_inc_idx` ON `drug_use_history` (`incarceration_id`);--> statement-breakpoint
CREATE TABLE `dual_approvals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`action` text NOT NULL,
	`payload` text,
	`reason` text NOT NULL,
	`requested_by` integer NOT NULL,
	`requested_at` integer NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`decided_by` integer,
	`decided_at` integer,
	`executed_at` integer,
	`result` text
);
--> statement-breakpoint
CREATE TABLE `edit_presence` (
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `edit_presence_unique` ON `edit_presence` (`entity`,`entity_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `enrollments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`incarceration_id` integer NOT NULL,
	`cohort_id` integer NOT NULL,
	`course_id` integer NOT NULL,
	`override_seq` integer DEFAULT 0 NOT NULL,
	`override_by` integer,
	`override_reason` text,
	`status` text DEFAULT 'draft' NOT NULL,
	`enrolled_date` text NOT NULL,
	`left_date` text,
	`left_reason` text,
	`intake` text,
	`screening_score` integer,
	`consent_signed` integer DEFAULT false NOT NULL,
	`consent_date` text,
	`consent_receiver_id` integer,
	`consent_refused` integer DEFAULT false NOT NULL,
	`consent_refuse_reason` text,
	`group_no` integer,
	`status_before_release` text,
	`release_event_id` integer,
	`note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`incarceration_id`) REFERENCES `incarcerations`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`cohort_id`) REFERENCES `cohorts`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `enrollments_no_duplicate` ON `enrollments` (`incarceration_id`,`course_id`,`override_seq`) WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `enrollments_cohort_idx` ON `enrollments` (`cohort_id`,`status`);--> statement-breakpoint
CREATE INDEX `enrollments_inc_idx` ON `enrollments` (`incarceration_id`);--> statement-breakpoint
CREATE TABLE `holidays` (
	`date` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`cohort_id` integer,
	`total_rows` integer NOT NULL,
	`imported_rows` integer NOT NULL,
	`summary` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `incarcerations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`person_id` integer NOT NULL,
	`inmate_no` text NOT NULL,
	`admitted_date` text,
	`offense` text,
	`case_note` text,
	`sentence_years` integer,
	`sentence_months` integer,
	`sentence_days` integer,
	`sentence_status` text,
	`zone` text,
	`room` text,
	`prisoner_class` text,
	`photo_path` text,
	`thumb_path` text,
	`released_date` text,
	`release_reason` text,
	`release_note` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`person_id`) REFERENCES `persons`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `incarcerations_inmate_no_unique` ON `incarcerations` (`inmate_no`);--> statement-breakpoint
CREATE INDEX `incarcerations_person_idx` ON `incarcerations` (`person_id`);--> statement-breakpoint
CREATE TABLE `job_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`job` text NOT NULL,
	`slot` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`message` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `job_runs_slot` ON `job_runs` (`job`,`slot`);--> statement-breakpoint
CREATE TABLE `lookups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`code` text NOT NULL,
	`label` text NOT NULL,
	`sort_order` integer DEFAULT 100 NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`meta` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `lookups_cat_code` ON `lookups` (`category`,`code`);--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer NOT NULL,
	`user_id` integer,
	`role` text,
	`severity` text DEFAULT 'info' NOT NULL,
	`kind` text NOT NULL,
	`message` text NOT NULL,
	`link` text,
	`read_at` integer,
	`read_by` integer
);
--> statement-breakpoint
CREATE INDEX `notifications_target_idx` ON `notifications` (`user_id`,`role`,`read_at`);--> statement-breakpoint
CREATE TABLE `permission_grants` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`permission` text NOT NULL,
	`allow` integer DEFAULT true NOT NULL,
	`scope` text,
	`valid_from` text,
	`valid_to` text,
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
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `permission_grants_user_idx` ON `permission_grants` (`user_id`);--> statement-breakpoint
CREATE TABLE `persons` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`national_id` text,
	`prefix` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`birth_date` text,
	`gender` text,
	`marital_status` text,
	`education` text,
	`occupation` text,
	`family_size` integer,
	`search_key` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `persons_national_id_unique` ON `persons` (`national_id`) WHERE national_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX `persons_search_idx` ON `persons` (`search_key`);--> statement-breakpoint
CREATE INDEX `persons_name_birth_idx` ON `persons` (`first_name`,`last_name`,`birth_date`);--> statement-breakpoint
CREATE TABLE `release_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` text NOT NULL,
	`incarceration_id` integer NOT NULL,
	`released_date` text NOT NULL,
	`reason` text NOT NULL,
	`note` text,
	`effects` text,
	`cancelled_at` integer,
	`cancelled_by` integer,
	`cancel_reason` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`incarceration_id`) REFERENCES `incarcerations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `release_events_inc_idx` ON `release_events` (`incarceration_id`);--> statement-breakpoint
CREATE TABLE `restore_tests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`at` integer NOT NULL,
	`backup_file` text NOT NULL,
	`status` text NOT NULL,
	`detail` text
);
--> statement-breakpoint
CREATE TABLE `session_staff` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`user_id` integer,
	`external_name` text,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `cohort_sessions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_staff_session_idx` ON `session_staff` (`session_id`);--> statement-breakpoint
CREATE INDEX `session_staff_user_idx` ON `session_staff` (`user_id`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`device_id` text,
	`created_at` integer NOT NULL,
	`last_active_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`locked_at` integer,
	`mfa_verified_at` integer,
	`ip` text,
	`user_agent` text,
	`ended_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `sessions_user_idx` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE TABLE `trusted_devices` (
	`id` text PRIMARY KEY NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer,
	`ip` text,
	`user_agent` text,
	`revoked_at` integer
);
--> statement-breakpoint
CREATE TABLE `user_roles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`role` text NOT NULL,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_roles_unique` ON `user_roles` (`user_id`,`role`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`prefix` text,
	`first_name` text NOT NULL,
	`last_name` text NOT NULL,
	`nickname` text,
	`position` text,
	`profession` text DEFAULT 'other' NOT NULL,
	`level` text DEFAULT 'staff' NOT NULL,
	`title_label` text,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`password_changed_at` integer,
	`failed_attempts` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`totp_secret` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`suspended_reason` text,
	`last_login_at` integer,
	`photo_path` text,
	`color` text,
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
CREATE INDEX `users_status_idx` ON `users` (`status`);