CREATE TABLE `stock_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`product_id` text NOT NULL,
	`batch` text NOT NULL,
	`previous_stock` integer NOT NULL,
	`new_stock` integer NOT NULL,
	`delta` integer NOT NULL,
	`reason` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_stock_adjustments_product_created` ON `stock_adjustments` (`tenant_id`,`product_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `product_masters` ADD `default_pack` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `default_gst_rate` real DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `category` text DEFAULT 'General' NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `sale_rate` real DEFAULT 0 NOT NULL;