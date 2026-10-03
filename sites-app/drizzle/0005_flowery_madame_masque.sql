CREATE TABLE `purchase_charges` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`inward_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`hsn` text,
	`gst_rate` real DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inward_id`) REFERENCES `purchase_inwards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_charges_inward` ON `purchase_charges` (`tenant_id`,`inward_id`);--> statement-breakpoint
CREATE TABLE `purchase_inward_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`inward_id` text NOT NULL,
	`product_master_id` text,
	`product_id` text NOT NULL,
	`serial_no` integer NOT NULL,
	`product_name` text NOT NULL,
	`pack` text NOT NULL,
	`manufacturer` text NOT NULL,
	`hsn` text NOT NULL,
	`batch` text NOT NULL,
	`expiry` text NOT NULL,
	`billed_quantity` integer NOT NULL,
	`free_quantity` integer DEFAULT 0 NOT NULL,
	`mrp` real NOT NULL,
	`net_rate` real NOT NULL,
	`gst_rate` real DEFAULT 0 NOT NULL,
	`gst_amount` real DEFAULT 0 NOT NULL,
	`line_total` real NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`inward_id`) REFERENCES `purchase_inwards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_master_id`) REFERENCES `product_masters`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_purchase_inward_items_inward` ON `purchase_inward_items` (`tenant_id`,`inward_id`);--> statement-breakpoint
CREATE INDEX `idx_purchase_inward_items_product` ON `purchase_inward_items` (`tenant_id`,`product_id`);--> statement-breakpoint
CREATE TABLE `purchase_inwards` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`inward_no` text NOT NULL,
	`supplier_id` text,
	`supplier_name` text NOT NULL,
	`supplier_address` text,
	`supplier_gstin` text,
	`supplier_dl_no` text,
	`supplier_phone_email` text,
	`buyer_name` text,
	`buyer_address` text,
	`buyer_gstin` text,
	`buyer_dl_no` text,
	`customer_id` text,
	`order_no` text,
	`invoice_no` text,
	`invoice_date` text,
	`due_date` text,
	`transport_gr_no` text,
	`subtotal` real DEFAULT 0 NOT NULL,
	`igst` real DEFAULT 0 NOT NULL,
	`cgst` real DEFAULT 0 NOT NULL,
	`sgst` real DEFAULT 0 NOT NULL,
	`round_off` real DEFAULT 0 NOT NULL,
	`grand_total` real DEFAULT 0 NOT NULL,
	`bank_name` text,
	`account_number` text,
	`bank_branch` text,
	`ifsc` text,
	`status` text DEFAULT 'Pending' NOT NULL,
	`source_document_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`supplier_id`) REFERENCES `suppliers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_purchase_inwards_tenant_no` ON `purchase_inwards` (`tenant_id`,`inward_no`);--> statement-breakpoint
CREATE INDEX `idx_purchase_inwards_tenant_date` ON `purchase_inwards` (`tenant_id`,`invoice_date`);