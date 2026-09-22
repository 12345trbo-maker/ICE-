CREATE TABLE `attendance_employee_documents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ownerOpenId` varchar(64) NOT NULL,
	`employeeId` int NOT NULL,
	`fileName` varchar(255) NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`fileUrl` varchar(768) NOT NULL,
	`mimeType` varchar(120) NOT NULL,
	`fileSize` int NOT NULL DEFAULT 0,
	`uploadedBy` varchar(160) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `attendance_employee_documents_id` PRIMARY KEY(`id`)
);
