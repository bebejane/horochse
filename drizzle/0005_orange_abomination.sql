CREATE TABLE `newsletter` (
	`email` text PRIMARY KEY NOT NULL,
	`venues` text NOT NULL,
	`frequency` text DEFAULT 'monthly' NOT NULL,
	`validated` integer DEFAULT false NOT NULL,
	`verification_token` text NOT NULL,
	`mailed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_verification_token_unique` ON `newsletter` (`verification_token`);--> statement-breakpoint
CREATE INDEX `newsletter_due_idx` ON `newsletter` (`validated`,`frequency`,`mailed_at`);