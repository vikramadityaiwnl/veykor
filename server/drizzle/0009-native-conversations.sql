CREATE TABLE `conversations` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` integer NOT NULL REFERENCES `users`(`id`),
  `data` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `conversation_events` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `conversation_id` text NOT NULL REFERENCES `conversations`(`id`) ON DELETE CASCADE,
  `method` text DEFAULT '' NOT NULL,
  `payload` text DEFAULT '{}' NOT NULL,
  `created_at` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `conversation_events_conversation_idx` ON `conversation_events` (`conversation_id`, `id`);
