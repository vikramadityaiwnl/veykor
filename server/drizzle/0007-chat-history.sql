CREATE TABLE `chat_histories` (
	`user_id` integer PRIMARY KEY NOT NULL,
	`sessions` text DEFAULT '[]' NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
