CREATE TABLE `pay_vouchers` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`batch_id` integer NOT NULL,
	`person_key` text NOT NULL,
	`printed_amount_satang` integer,
	`printed_at` integer,
	`printed_by` integer,
	`print_count` integer DEFAULT 0 NOT NULL,
	`signed_at` integer,
	`signed_by` integer,
	`created_by` integer,
	`created_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`updated_by` integer,
	`updated_at` integer DEFAULT (CAST(unixepoch('subsec') * 1000 AS INTEGER)) NOT NULL,
	`deleted_at` integer,
	`deleted_by` integer,
	`version` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`batch_id`) REFERENCES `pay_batches`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `pay_vouchers_unique` ON `pay_vouchers` (`batch_id`,`person_key`);