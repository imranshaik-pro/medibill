CREATE TABLE `invoice_lines` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`invoice_id` text NOT NULL,
	`customer_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`batch` text NOT NULL,
	`quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`unit_rate` real NOT NULL,
	`discount_percent` real DEFAULT 0 NOT NULL,
	`gst_rate` real DEFAULT 0 NOT NULL,
	`taxable_amount` real NOT NULL,
	`gst_amount` real NOT NULL,
	`line_total` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invoice_id`) REFERENCES `invoices`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_tenant_invoice` ON `invoice_lines` (`tenant_id`,`invoice_id`);--> statement-breakpoint
CREATE INDEX `idx_invoice_lines_customer_product_created` ON `invoice_lines` (`tenant_id`,`customer_id`,`product_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `products` ADD `hsn` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `pack` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `manufacturer` text DEFAULT '' NOT NULL;