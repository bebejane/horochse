CREATE TABLE `track_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`artist_key` text NOT NULL,
	`action` text NOT NULL,
	`source` text,
	`artist` text,
	`album` text,
	`title` text,
	`url` text,
	`image` text,
	`band_id` integer,
	`album_id` integer,
	`track_id` integer,
	`video_id` text,
	`type` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `track_overrides_event_artist_idx` ON `track_overrides` (`event_id`,`artist_key`);