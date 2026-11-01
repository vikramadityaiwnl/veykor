CREATE TABLE `mcp_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`transport` text DEFAULT 'stdio' NOT NULL,
	`command` text DEFAULT '' NOT NULL,
	`args` text DEFAULT '[]' NOT NULL,
	`env` text DEFAULT '{}' NOT NULL,
	`url` text DEFAULT '' NOT NULL,
	`headers` text DEFAULT '{}' NOT NULL,
	`enabled` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_error` text DEFAULT '' NOT NULL,
	`tool_count` integer DEFAULT 0 NOT NULL,
	`last_checked` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
