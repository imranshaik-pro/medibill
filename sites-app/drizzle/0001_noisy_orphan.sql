CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`payment_no` text NOT NULL,
	`type` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`amount` real NOT NULL,
	`method` text DEFAULT 'Bank' NOT NULL,
	`payment_date` text NOT NULL,
	`notes` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_payments_tenant_no` ON `payments` (`tenant_id`,`payment_no`);--> statement-breakpoint
CREATE INDEX `idx_payments_tenant_date` ON `payments` (`tenant_id`,`payment_date`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`purchase_no` text NOT NULL,
	`supplier_id` text NOT NULL,
	`supplier_name` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` real NOT NULL,
	`gst_rate` real DEFAULT 0 NOT NULL,
	`amount` real NOT NULL,
	`status` text DEFAULT 'Pending' NOT NULL,
	`purchase_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchases_tenant_no` ON `purchases` (`tenant_id`,`purchase_no`);--> statement-breakpoint
CREATE INDEX `idx_purchases_tenant_date` ON `purchases` (`tenant_id`,`purchase_date`);--> statement-breakpoint
CREATE TABLE `returns` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`return_no` text NOT NULL,
	`type` text NOT NULL,
	`party_id` text NOT NULL,
	`party_name` text NOT NULL,
	`reference_no` text NOT NULL,
	`amount` real NOT NULL,
	`reason` text NOT NULL,
	`return_date` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_returns_tenant_no` ON `returns` (`tenant_id`,`return_no`);--> statement-breakpoint
CREATE INDEX `idx_returns_tenant_date` ON `returns` (`tenant_id`,`return_date`);--> statement-breakpoint
CREATE TABLE `suppliers` (
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
CREATE INDEX `idx_suppliers_tenant` ON `suppliers` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_suppliers_tenant_name` ON `suppliers` (`tenant_id`,`name`);