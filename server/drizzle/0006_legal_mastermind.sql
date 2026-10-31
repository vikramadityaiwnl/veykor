ALTER TABLE `projects` ADD `section_id` text;
--> statement-breakpoint
INSERT INTO `sidebar_sections` (`id`, `user_id`, `title`, `kind`, `position`, `is_expanded`, `is_fixed`)
SELECT 'projects-' || `u`.`id`, `u`.`id`, 'Projects', 'projects', (SELECT COUNT(*) FROM `sidebar_sections` WHERE `user_id` = `u`.`id`), 1, 0
FROM `users` `u`
WHERE EXISTS (SELECT 1 FROM `projects` WHERE `user_id` = `u`.`id`)
  AND NOT EXISTS (SELECT 1 FROM `sidebar_sections` WHERE `user_id` = `u`.`id` AND `kind` IN ('projects', 'custom'));
--> statement-breakpoint
UPDATE `projects` SET `section_id` = (SELECT `id` FROM `sidebar_sections` WHERE `user_id` = `projects`.`user_id` AND `kind` IN ('projects', 'custom') ORDER BY `position` LIMIT 1) WHERE `section_id` IS NULL;