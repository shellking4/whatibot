CREATE TABLE `logs` (
	`id` integer PRIMARY KEY NOT NULL,
	`level` text,
	`content` text
);
--> statement-breakpoint
CREATE TABLE `requests` (
	`id` integer PRIMARY KEY NOT NULL,
	`correlation_key` text,
	`method` text,
	`url` text,
	`status_code` text,
	`user_agent` text,
	`client_ip` text,
	`user_id` text,
	`content_length` text,
	`latency` text,
	`metadata` text
);
