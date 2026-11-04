ALTER TABLE `invoices` ADD `prescription_doctor_name` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `prescription_doctor_registration` text;--> statement-breakpoint
ALTER TABLE `invoices` ADD `compliance_acknowledged` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `is_schedule_h1` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `is_prescription_required` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `is_high_caution` integer DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE `product_masters` ADD `caution_notes` text DEFAULT '' NOT NULL;