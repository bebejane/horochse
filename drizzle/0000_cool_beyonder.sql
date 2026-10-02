CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`source_key` text NOT NULL,
	`venue_slug` text NOT NULL,
	`place` text,
	`title` text NOT NULL,
	`starts_at` integer NOT NULL,
	`date` text NOT NULL,
	`time` text NOT NULL,
	`image` text,
	`text` text,
	`url` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`cancelled` integer DEFAULT false NOT NULL,
	`is_club` integer DEFAULT false NOT NULL,
	`first_seen_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	`first_run_id` integer,
	`last_run_id` integer,
	`seen_count` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`source_key`) REFERENCES `sources`(`key`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`venue_slug`) REFERENCES `venues`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_date_idx` ON `events` (`date`);--> statement-breakpoint
CREATE INDEX `events_source_status_idx` ON `events` (`source_key`,`status`);--> statement-breakpoint
CREATE INDEX `events_venue_date_idx` ON `events` (`venue_slug`,`date`);--> statement-breakpoint
CREATE INDEX `events_starts_at_idx` ON `events` (`starts_at`);--> statement-breakpoint
CREATE TABLE `scrape_errors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` integer NOT NULL,
	`source` text NOT NULL,
	`message` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `scrape_runs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`source`) REFERENCES `sources`(`key`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`range_from` text,
	`range_to` text,
	`event_count` integer DEFAULT 0 NOT NULL,
	`error_count` integer DEFAULT 0 NOT NULL,
	`ok` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sources` (
	`key` text PRIMARY KEY NOT NULL,
	`venue_slug` text NOT NULL,
	`label` text,
	`active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`venue_slug`) REFERENCES `venues`(`slug`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `tracks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`position` integer NOT NULL,
	`source` text NOT NULL,
	`artist` text,
	`album` text,
	`title` text,
	`url` text,
	`image` text,
	`band_id` integer,
	`album_id` integer,
	`track_id` integer,
	`type` text,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tracks_event_position_idx` ON `tracks` (`event_id`,`position`);--> statement-breakpoint
CREATE TABLE `venues` (
	`slug` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`address` text,
	`active` integer DEFAULT true NOT NULL
);
