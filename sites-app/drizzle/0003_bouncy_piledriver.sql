CREATE TABLE `product_masters` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`hsn` text NOT NULL,
	`manufacturer` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_product_masters_tenant` ON `product_masters` (`tenant_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_product_masters_tenant_name` ON `product_masters` (`tenant_id`,`name`);--> statement-breakpoint
ALTER TABLE `products` ADD `product_master_id` text REFERENCES product_masters(id);