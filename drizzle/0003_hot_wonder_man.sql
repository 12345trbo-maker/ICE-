CREATE TABLE `attendance_records` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`employeeId` int NOT NULL,
	`date` varchar(10) NOT NULL,
	`attendance` enum('حاضر','متأخر','غائب') NOT NULL DEFAULT 'غائب',
	`checkIn` varchar(5) NOT NULL DEFAULT '—',
	`checkOut` varchar(5),
	`lateMinutes` int NOT NULL DEFAULT 0,
	`note` text,
	`updatedBy` varchar(160),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `attendance_records_id` PRIMARY KEY(`id`)
);
