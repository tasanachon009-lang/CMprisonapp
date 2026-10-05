CREATE TABLE `line_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`target_date` text,
	`text` text NOT NULL,
	`content_hash` text,
	`status` text NOT NULL,
	`http_status` integer,
	`error` text,
	`sent_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `line_messages_kind_idx` ON `line_messages` (`kind`,`target_date`);--> statement-breakpoint
CREATE TABLE `weekly_reports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`week_start` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`data` text NOT NULL,
	`issues` text,
	`next_plan` text,
	`note` text,
	`approved_by` integer,
	`approved_at` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weekly_reports_week_unique` ON `weekly_reports` (`week_start`) WHERE deleted_at IS NULL;