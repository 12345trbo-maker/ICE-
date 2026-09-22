CREATE TABLE `password_reset_otps` (
  `id` int AUTO_INCREMENT NOT NULL,
  `accountId` int NOT NULL,
  `phone` varchar(32) NOT NULL,
  `codeHash` varchar(255) NOT NULL,
  `expiresAt` timestamp NOT NULL,
  `attempts` int NOT NULL DEFAULT 0,
  `consumed` int NOT NULL DEFAULT 0,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`)
);
