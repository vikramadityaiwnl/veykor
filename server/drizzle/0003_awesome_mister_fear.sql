CREATE TABLE `sidebar_sections` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'custom' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`is_expanded` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `sidebar_sections` (`id`, `user_id`, `title`, `kind`, `position`, `is_expanded`) SELECT 'chats-' || `id`, `id`, 'Chats', 'chats', 0, 0 FROM `users`;
--> statement-breakpoint
INSERT INTO `sidebar_sections` (`id`, `user_id`, `title`, `kind`, `position`, `is_expanded`) SELECT 'projects-' || `id`, `id`, 'Projects', 'projects', 1, 1 FROM `users`;
