CREATE TABLE `backup_records` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`file_name` text NOT NULL,
	`object_key` text NOT NULL,
	`kind` text DEFAULT 'manual' NOT NULL,
	`size_bytes` integer DEFAULT 0 NOT NULL,
	`checksum` text NOT NULL,
	`product_count` integer DEFAULT 0 NOT NULL,
	`purchase_count` integer DEFAULT 0 NOT NULL,
	`sales_count` integer DEFAULT 0 NOT NULL,
	`batch_count` integer DEFAULT 0 NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_backup_records_tenant_created` ON `backup_records` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `backup_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`frequency` text DEFAULT 'daily' NOT NULL,
	`retention` integer DEFAULT 14 NOT NULL,
	`storage_target` text DEFAULT 'cloud_local' NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
