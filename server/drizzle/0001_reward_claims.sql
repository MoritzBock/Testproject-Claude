CREATE TABLE `reward_claims` (
	`user_id` text NOT NULL,
	`ref` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `ref`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
