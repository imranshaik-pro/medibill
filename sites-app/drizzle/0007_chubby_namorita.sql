ALTER TABLE `customers` ADD `dl_no` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `address` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `city` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `state` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `state_code` text;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `pack` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `manufacturer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `hsn` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `expiry` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `mrp` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `available_stock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoice_lines` ADD `discount_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `invoice_time` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `invoice_type` text DEFAULT 'Tax Invoice' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payment_mode` text DEFAULT 'Credit' NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `due_date` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `payment_terms` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `seller_state_code` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `buyer_state_code` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `transport_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `vehicle_no` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `lr_no` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `freight_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `freight_gst_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `insurance_amount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `insurance_gst_rate` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `gross_taxable` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `line_discount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `cash_discount` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `cgst` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `sgst` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `igst` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `round_off` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `invoices` ADD `amount_in_words` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `total_quantity` integer DEFAULT 0 NOT NULL;