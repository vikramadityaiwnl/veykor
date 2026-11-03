CREATE TABLE `collab_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`event_id` text DEFAULT '' NOT NULL,
	`parent_conversation_id` text DEFAULT '' NOT NULL,
	`conversation_id` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collab_deliveries_target` ON `collab_deliveries` (`user_id`,`event_id`,`conversation_id`);--> statement-breakpoint
CREATE INDEX `collab_deliveries_session` ON `collab_deliveries` (`user_id`,`conversation_id`,`state`);--> statement-breakpoint
CREATE TABLE `collab_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`parent_conversation_id` text DEFAULT '' NOT NULL,
	`seq` integer DEFAULT 0 NOT NULL,
	`type` text DEFAULT 'message' NOT NULL,
	`source_kind` text DEFAULT 'system' NOT NULL,
	`source_conversation_id` text DEFAULT '' NOT NULL,
	`source_name` text DEFAULT '' NOT NULL,
	`participant_id` text DEFAULT '' NOT NULL,
	`participant_name` text DEFAULT '' NOT NULL,
	`task_id` text DEFAULT '' NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`body` text DEFAULT '' NOT NULL,
	`task_state` text DEFAULT '' NOT NULL,
	`response_required` integer DEFAULT 0 NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collab_events_seq` ON `collab_events` (`user_id`,`parent_conversation_id`,`seq`);--> statement-breakpoint
CREATE UNIQUE INDEX `collab_events_dedupe` ON `collab_events` (`user_id`,`parent_conversation_id`,`correlation_id`,`type`);--> statement-breakpoint
CREATE INDEX `collab_events_parent` ON `collab_events` (`user_id`,`parent_conversation_id`);--> statement-breakpoint
CREATE TABLE `collab_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`parent_conversation_id` text DEFAULT '' NOT NULL,
	`from_conversation_id` text DEFAULT '' NOT NULL,
	`from_name` text DEFAULT '' NOT NULL,
	`to_conversation_id` text DEFAULT '' NOT NULL,
	`to_name` text DEFAULT '' NOT NULL,
	`task_id` text DEFAULT '' NOT NULL,
	`kind` text DEFAULT 'note' NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`correlation_id` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collab_messages_parent` ON `collab_messages` (`user_id`,`parent_conversation_id`);--> statement-breakpoint
CREATE INDEX `collab_messages_task` ON `collab_messages` (`user_id`,`task_id`);--> statement-breakpoint
CREATE TABLE `collab_participants` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`parent_conversation_id` text DEFAULT '' NOT NULL,
	`conversation_id` text DEFAULT '' NOT NULL,
	`agent_id` text DEFAULT '' NOT NULL,
	`agent_name` text DEFAULT '' NOT NULL,
	`role` text DEFAULT 'delegate' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`joined_at` integer DEFAULT 0 NOT NULL,
	`last_delivered_seq` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `collab_participants_session` ON `collab_participants` (`user_id`,`parent_conversation_id`,`conversation_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `collab_participants_agent` ON `collab_participants` (`user_id`,`parent_conversation_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `collab_participants_parent` ON `collab_participants` (`user_id`,`parent_conversation_id`);--> statement-breakpoint
CREATE TABLE `collab_tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer DEFAULT 0 NOT NULL,
	`parent_conversation_id` text DEFAULT '' NOT NULL,
	`participant_id` text DEFAULT '' NOT NULL,
	`conversation_id` text DEFAULT '' NOT NULL,
	`agent_id` text DEFAULT '' NOT NULL,
	`agent_name` text DEFAULT '' NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`instructions` text DEFAULT '' NOT NULL,
	`expected_outcome` text DEFAULT '' NOT NULL,
	`context` text DEFAULT '' NOT NULL,
	`state` text DEFAULT 'queued' NOT NULL,
	`waiting_on` text DEFAULT '[]' NOT NULL,
	`blocked_by` text DEFAULT '' NOT NULL,
	`interrupt_state` text DEFAULT 'none' NOT NULL,
	`interrupt_reason` text DEFAULT '' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`result_preview` text DEFAULT '' NOT NULL,
	`result_incomplete` integer DEFAULT 0 NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`turn_id` text DEFAULT '' NOT NULL,
	`submission_id` text DEFAULT '' NOT NULL,
	`reminders` integer DEFAULT 0 NOT NULL,
	`created_by_conversation_id` text DEFAULT '' NOT NULL,
	`created_at` integer DEFAULT 0 NOT NULL,
	`updated_at` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `collab_tasks_parent` ON `collab_tasks` (`user_id`,`parent_conversation_id`);--> statement-breakpoint
CREATE INDEX `collab_tasks_session` ON `collab_tasks` (`user_id`,`conversation_id`);