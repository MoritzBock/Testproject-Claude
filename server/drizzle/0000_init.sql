CREATE TABLE `achievements` (
	`user_id` text NOT NULL,
	`achievement_id` text NOT NULL,
	`unlocked_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `achievement_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `activity_daily` (
	`user_id` text NOT NULL,
	`day` text NOT NULL,
	`minutes` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `day`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_id` text,
	`actor_name` text NOT NULL,
	`action` text NOT NULL,
	`target_user_id` text,
	`target_name` text,
	`target_class_id` text,
	`params` text DEFAULT '{}' NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_created` ON `audit_log` (`created_at`);--> statement-breakpoint
CREATE INDEX `audit_class` ON `audit_log` (`target_class_id`);--> statement-breakpoint
CREATE TABLE `characters` (
	`user_id` text PRIMARY KEY NOT NULL,
	`skin_tone` integer NOT NULL,
	`equipped` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `class_teachers` (
	`class_id` text NOT NULL,
	`teacher_id` text NOT NULL,
	PRIMARY KEY(`class_id`, `teacher_id`),
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`teacher_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `classes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`school_year` text NOT NULL,
	`join_code` text NOT NULL,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_join_code_unique` ON `classes` (`join_code`);--> statement-breakpoint
CREATE TABLE `deletion_requests` (
	`user_id` text PRIMARY KEY NOT NULL,
	`requested_at` integer NOT NULL,
	`execute_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `group_members` (
	`group_id` text NOT NULL,
	`user_id` text NOT NULL,
	PRIMARY KEY(`group_id`, `user_id`),
	FOREIGN KEY (`group_id`) REFERENCES `groups`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `groups` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`name` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`owner_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `inventory` (
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`source` text NOT NULL,
	`acquired_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `item_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `level_overrides` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`level_id` text NOT NULL,
	`mode` text NOT NULL,
	`actor_id` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `level_overrides_scope` ON `level_overrides` (`scope_type`,`scope_id`,`level_id`);--> statement-breakpoint
CREATE TABLE `level_progress` (
	`user_id` text NOT NULL,
	`level_id` text NOT NULL,
	`status` text NOT NULL,
	`best_stars` integer DEFAULT 0 NOT NULL,
	`rewarded_stars` integer DEFAULT 0 NOT NULL,
	`completion_rewarded` integer DEFAULT false NOT NULL,
	`runs` integer DEFAULT 0 NOT NULL,
	`total_time_ms` integer DEFAULT 0 NOT NULL,
	`first_started_at` integer NOT NULL,
	`completed_at` integer,
	PRIMARY KEY(`user_id`, `level_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `level_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`level_id` text NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`state` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `lootbox_pity` (
	`user_id` text NOT NULL,
	`box_id` text NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`opened` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`user_id`, `box_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pending_boxes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`box_id` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `policies` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`scope_type` text NOT NULL,
	`scope_id` text NOT NULL,
	`key` text NOT NULL,
	`value` text NOT NULL,
	`updated_by` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `policies_scope_key` ON `policies` (`scope_type`,`scope_id`,`key`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`last_seen_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `task_attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`class_id` text,
	`level_id` text NOT NULL,
	`task_id` text NOT NULL,
	`attempt_no` integer NOT NULL,
	`correct` integer NOT NULL,
	`points` integer NOT NULL,
	`max_points` integer NOT NULL,
	`hints_used` integer NOT NULL,
	`duration_ms` integer NOT NULL,
	`wrong_answer_key` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `task_attempts_user` ON `task_attempts` (`user_id`);--> statement-breakpoint
CREATE INDEX `task_attempts_created` ON `task_attempts` (`created_at`);--> statement-breakpoint
CREATE TABLE `task_stats_anon` (
	`class_id` text NOT NULL,
	`level_id` text NOT NULL,
	`task_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`hints` integer DEFAULT 0 NOT NULL,
	`time_sum_ms` integer DEFAULT 0 NOT NULL,
	`wrong_answers` text DEFAULT '{}' NOT NULL,
	PRIMARY KEY(`class_id`, `level_id`, `task_id`)
);
--> statement-breakpoint
CREATE TABLE `task_stats_user` (
	`user_id` text NOT NULL,
	`level_id` text NOT NULL,
	`task_id` text NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`errors` integer DEFAULT 0 NOT NULL,
	`hints` integer DEFAULT 0 NOT NULL,
	`time_sum_ms` integer DEFAULT 0 NOT NULL,
	`last_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `level_id`, `task_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `teacher_notes` (
	`user_id` text PRIMARY KEY NOT NULL,
	`text` text NOT NULL,
	`author_id` text,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`ref` text,
	`actor_id` text,
	`balance_after` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `transactions_user_ref` ON `transactions` (`user_id`,`ref`) WHERE ref IS NOT NULL;--> statement-breakpoint
CREATE INDEX `transactions_user` ON `transactions` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`username` text NOT NULL,
	`username_key` text NOT NULL,
	`class_id` text,
	`password_hash` text NOT NULL,
	`must_change_password` integer DEFAULT true NOT NULL,
	`totp_secret_enc` text,
	`totp_enabled` integer DEFAULT false NOT NULL,
	`failed_logins` integer DEFAULT 0 NOT NULL,
	`locked_until` integer,
	`status` text DEFAULT 'active' NOT NULL,
	`privacy_ack_version` integer,
	`privacy_ack_at` integer,
	`last_active_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_class_username` ON `users` (`class_id`,`username_key`);--> statement-breakpoint
CREATE INDEX `users_last_active` ON `users` (`last_active_at`);--> statement-breakpoint
CREATE TABLE `wallets` (
	`user_id` text PRIMARY KEY NOT NULL,
	`balance` integer DEFAULT 0 NOT NULL,
	`total_earned` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
