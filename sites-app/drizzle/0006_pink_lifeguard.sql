ALTER TABLE `products` ADD `pack_multiplier` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `physical_stock` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `landing_cost_per_unit` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `products` ADD `mrp_per_unit` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_inward_items` ADD `gross_total` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_inward_items` ADD `pack_multiplier` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_inward_items` ADD `physical_units` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_inward_items` ADD `landing_cost_per_unit` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `purchase_inward_items` ADD `mrp_per_unit` real DEFAULT 0 NOT NULL;