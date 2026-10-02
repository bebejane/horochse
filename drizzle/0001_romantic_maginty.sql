CREATE TABLE `bandcamp_artists` (
	`artist_key` text PRIMARY KEY NOT NULL,
	`artist` text NOT NULL,
	`release` text,
	`found` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `bandcamp_artists_updated_idx` ON `bandcamp_artists` (`updated_at`);