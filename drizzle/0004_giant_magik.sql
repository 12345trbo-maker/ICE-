CREATE TABLE `attendance_holidays` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`date` varchar(10) NOT NULL,
	`name` varchar(160) NOT NULL,
	`paid` int NOT NULL DEFAULT 1,
	`createdBy` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_holidays_id` PRIMARY KEY(`id`)
);
