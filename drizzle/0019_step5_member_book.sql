CREATE TABLE `member_book_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`kind` text NOT NULL,
	`period` text DEFAULT '' NOT NULL,
	`note_date` text NOT NULL,
	`author_id` integer NOT NULL,
	`text` text NOT NULL,
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
CREATE UNIQUE INDEX `member_book_notes_monthly_unique` ON `member_book_notes` (`enrollment_id`,`period`) WHERE kind = 'monthly' AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX `member_book_notes_enr_idx` ON `member_book_notes` (`enrollment_id`,`kind`);--> statement-breakpoint
CREATE TABLE `member_books` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`enrollment_id` integer NOT NULL,
	`housing_before` text,
	`family_bond` text,
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
CREATE UNIQUE INDEX `member_books_enr_unique` ON `member_books` (`enrollment_id`);