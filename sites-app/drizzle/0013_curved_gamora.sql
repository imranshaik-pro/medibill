ALTER TABLE `customers` ADD `legal_name` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `trade_name` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `pin_code` text;--> statement-breakpoint
ALTER TABLE `customers` ADD `registration_status` text DEFAULT 'Unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `legal_name` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `trade_name` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `dl_no` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `address` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `city` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `state` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `state_code` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `pin_code` text;--> statement-breakpoint
ALTER TABLE `suppliers` ADD `registration_status` text DEFAULT 'Unverified' NOT NULL;