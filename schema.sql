CREATE DATABASE IF NOT EXISTS `x7_bot`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `x7_bot`;

CREATE TABLE IF NOT EXISTS `vouches` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `exchangerId` VARCHAR(32) NOT NULL,
  `exchangerUsername` VARCHAR(100) NOT NULL,
  `clientId` VARCHAR(32) NOT NULL,
  `fromCurrency` VARCHAR(50) NOT NULL,
  `toCurrency` VARCHAR(50) NOT NULL,
  `amount` DECIMAL(15, 2) NOT NULL,
  `currency` VARCHAR(10) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_vouches_exchangerId` (`exchangerId`),
  KEY `idx_vouches_clientId` (`clientId`),
  KEY `idx_vouches_createdAt` (`createdAt`)
) ENGINE = InnoDB
  DEFAULT CHARSET = utf8mb4
  COLLATE = utf8mb4_unicode_ci;