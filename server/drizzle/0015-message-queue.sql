CREATE TABLE `chat_inputs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`conversation_id` text DEFAULT '' NOT NULL,
	`client_message_id` text DEFAULT '' NOT NULL,
	`payload` text DEFAULT '{}' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`conversation_id`) REFERENCES `conversations`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `chat_inputs_submission` ON `chat_inputs` (`user_id`,`conversation_id`,`client_message_id`);--> statement-breakpoint
CREATE INDEX `chat_inputs_queue` ON `chat_inputs` (`state`,`conversation_id`,`position`);--> statement-breakpoint
ALTER TABLE `conversations` ADD `queue_paused` integer DEFAULT 0 NOT NULL;