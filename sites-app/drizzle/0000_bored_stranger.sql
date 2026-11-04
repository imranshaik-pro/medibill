CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`details` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_tenant_created` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`gstin` text,
	`phone` text NOT NULL,
	`outstanding` real DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'Active' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_customers_tenant` ON `customers` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_customers_tenant_name` ON `customers` (`tenant_id`,`name`);--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`invoice_no` text NOT NULL,
	`customer_id` text NOT NULL,
	`customer_name` text NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`invoice_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_invoices_tenant_no` ON `invoices` (`tenant_id`,`invoice_no`);--> statement-breakpoint
CREATE INDEX `idx_invoices_tenant_date` ON `invoices` (`tenant_id`,`invoice_date`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`batch` text NOT NULL,
	`stock` integer DEFAULT 0 NOT NULL,
	`expiry` text NOT NULL,
	`purchase_rate` real NOT NULL,
	`mrp` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_products_tenant` ON `products` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_products_tenant_batch` ON `products` (`tenant_id`,`name`,`batch`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`company_name` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`email` text NOT NULL,
	`display_name` text NOT NULL,
	`role` text DEFAULT 'admin' NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE INDEX `idx_users_tenant` ON `users` (`tenant_id`);