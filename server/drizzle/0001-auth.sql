CREATE TABLE IF NOT EXISTS `users` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `username` text NOT NULL UNIQUE DEFAULT '',
  `password_hash` text NOT NULL DEFAULT '',
  `is_host` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `sessions` (
  `id` text PRIMARY KEY,
  `user_id` integer NOT NULL DEFAULT 0 REFERENCES `users`(`id`) ON DELETE CASCADE,
  `expires_at` integer NOT NULL DEFAULT 0,
  `created_at` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `sessions_expires_at_idx` ON `sessions` (`expires_at`);
