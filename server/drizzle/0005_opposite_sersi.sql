ALTER TABLE `sidebar_sections` ADD `is_fixed` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `sidebar_sections` SET `is_fixed` = 1 WHERE `kind` = 'chats' AND `id` LIKE 'chats-%';