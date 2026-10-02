CREATE TABLE `youtube_videos` (
	`artist_key` text PRIMARY KEY NOT NULL,
	`artist` text NOT NULL,
	`video` text,
	`found` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `youtube_videos_updated_idx` ON `youtube_videos` (`updated_at`);--> statement-breakpoint
ALTER TABLE `tracks` ADD `video_id` text;