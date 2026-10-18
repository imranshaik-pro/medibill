CREATE TABLE `firm_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`username` text NOT NULL,
	`mobile` text NOT NULL,
	`email` text NOT NULL,
	`firm_name` text NOT NULL,
	`address` text NOT NULL,
	`gstin` text NOT NULL,
	`logo_key` text,
	`status` text DEFAULT 'pending_approval' NOT NULL,
	`reviewed_by` text,
	`reviewed_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_firm_registrations_user` ON `firm_registrations` (`user_id`);--> statement-breakpoint
CREATE INDEX `idx_firm_registrations_status` ON `firm_registrations` (`status`,`created_at`);--> statement-breakpoint
ALTER TABLE `users` ADD `username` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `mobile` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;