CREATE TABLE `attendance_accounts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `employeeId` int,
  `role` enum('manager','employee') NOT NULL,
  `name` varchar(160) NOT NULL,
  `username` varchar(80) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `email` varchar(320),
  `passwordHash` varchar(255) NOT NULL,
  `job` varchar(160),
  `active` int NOT NULL DEFAULT 1,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_accounts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_employees` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `name` varchar(160) NOT NULL,
  `initial` varchar(8) NOT NULL,
  `job` varchar(160) NOT NULL,
  `username` varchar(80) NOT NULL,
  `phone` varchar(32) NOT NULL,
  `salary` int NOT NULL DEFAULT 0,
  `leaveBalance` int NOT NULL DEFAULT 4,
  `attendance` enum('حاضر','متأخر','غائب') NOT NULL DEFAULT 'غائب',
  `checkIn` varchar(5) NOT NULL DEFAULT '—',
  `checkOut` varchar(5),
  `lateMinutes` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_employees_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_schedules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `employeeId` int NOT NULL,
  `day` varchar(32) NOT NULL,
  `date` varchar(16) NOT NULL,
  `status` enum('دوام','راحة') NOT NULL,
  `start` varchar(5) NOT NULL,
  `end` varchar(5) NOT NULL,
  `shiftType` enum('صباحي','مسائي','مرن') NOT NULL,
  CONSTRAINT `attendance_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_deductions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `employeeId` int NOT NULL,
  `type` varchar(16) NOT NULL,
  `reason` text NOT NULL,
  `amount` int,
  `createdBy` varchar(160) NOT NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `cancelled` int NOT NULL DEFAULT 0,
  `cancelledBy` varchar(160),
  `cancelledAt` timestamp,
  CONSTRAINT `attendance_deductions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `employeeId` int NOT NULL,
  `kind` varchar(32) NOT NULL,
  `title` varchar(160) NOT NULL,
  `date` varchar(64) NOT NULL,
  `days` int NOT NULL DEFAULT 0,
  `note` text NOT NULL,
  `status` enum('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decisionBy` varchar(160),
  CONSTRAINT `attendance_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `attendance_settings` (
  `id` int AUTO_INCREMENT NOT NULL,
  `ownerOpenId` varchar(64) NOT NULL,
  `workDays` int NOT NULL DEFAULT 30,
  `leaveDays` int NOT NULL DEFAULT 4,
  `penaltyUnit` varchar(16) NOT NULL DEFAULT 'quarter',
  `latitude` varchar(32) NOT NULL,
  `longitude` varchar(32) NOT NULL,
  `radius` int NOT NULL DEFAULT 200,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `attendance_settings_id` PRIMARY KEY(`id`),
  CONSTRAINT `attendance_settings_owner_unique` UNIQUE(`ownerOpenId`)
);
