-- 1) Create database
CREATE DATABASE IF NOT EXISTS `order_Tracking`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `order_Tracking`;

-- 2) (Optional) Drop old tables (safe for re-running during development)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS `receipts`;
DROP TABLE IF EXISTS `purchases`;
DROP TABLE IF EXISTS `distributions`;
DROP TABLE IF EXISTS `items`;
SET FOREIGN_KEY_CHECKS = 1;

-- 3) Create tables
CREATE TABLE `items` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(255) NULL,
  `unit` VARCHAR(50) NULL,
  `minStock` INT NOT NULL DEFAULT 0,
  `currentStock` INT NOT NULL DEFAULT 0,
  `location` VARCHAR(255) NULL,
  `supplier` VARCHAR(255) NULL,
  `catalogNo` VARCHAR(255) NULL,
  `lotNo` VARCHAR(255) NULL,
  `brand` VARCHAR(255) NULL,
  `storageLocation` VARCHAR(255) NULL,
  `status` VARCHAR(50) NULL,
  `expiryDate` VARCHAR(40) NULL,
  `openingDate` VARCHAR(40) NULL,
  `storageTemp` VARCHAR(50) NULL,
  `chemicalType` VARCHAR(100) NULL,
  `msdsUrl` TEXT NULL,
  `wasteStatus` VARCHAR(50) NULL,
  `createdAt` VARCHAR(40) NULL,
  `createdBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_items_code` (`code`),
  INDEX `idx_items_expiryDate` (`expiryDate`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE `purchases` (
  `id` VARCHAR(64) NOT NULL,
  `requestNumber` VARCHAR(64) NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,

  `requestedQty` INT NULL,
  `requestedBy` VARCHAR(255) NULL,
  `requestedAt` VARCHAR(40) NULL,
  `requestDate` VARCHAR(40) NULL,

  `status` VARCHAR(50) NULL,

  `approvedBy` VARCHAR(255) NULL,
  `approvedAt` VARCHAR(40) NULL,
  `approvedDate` VARCHAR(40) NULL,
  `approvalNote` TEXT NULL,

  `orderedBy` VARCHAR(255) NULL,
  `orderedAt` VARCHAR(40) NULL,
  `supplierName` VARCHAR(255) NULL,
  `poNumber` VARCHAR(255) NULL,
  `orderedQty` INT NULL,

  `receivedQtyTotal` INT NULL,
  `receivedQty` INT NULL,
  `receivedBy` VARCHAR(255) NULL,
  `receivedDate` VARCHAR(40) NULL,

  `lotNo` VARCHAR(255) NULL,
  `expiryDate` VARCHAR(40) NULL,
  `distributorCompany` VARCHAR(255) NULL,

  `notes` TEXT NULL,
  `urgency` VARCHAR(50) NULL,

  `rejectionReason` TEXT NULL,
  `rejectedBy` VARCHAR(255) NULL,
  `rejectedDate` VARCHAR(40) NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_purchases_itemId` (`itemId`),
  INDEX `idx_purchases_status` (`status`),
  CONSTRAINT `fk_purchases_item`
    FOREIGN KEY (`itemId`) REFERENCES `items`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `receipts` (
  `receiptId` VARCHAR(64) NOT NULL,
  `purchaseId` VARCHAR(64) NOT NULL,
  `receivedAt` VARCHAR(40) NULL,
  `receivedBy` VARCHAR(255) NULL,
  `receivedQty` INT NULL,
  `lotNo` VARCHAR(255) NULL,
  `expiryDate` VARCHAR(40) NULL,
  `invoiceNo` VARCHAR(255) NULL,

  PRIMARY KEY (`receiptId`),
  INDEX `idx_receipts_purchaseId` (`purchaseId`),
  CONSTRAINT `fk_receipts_purchase`
    FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `distributions` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `quantity` INT NULL,

  `distributedBy` VARCHAR(255) NULL,
  `distributedDate` VARCHAR(40) NULL,
  `receivedBy` VARCHAR(255) NULL,
  `purpose` TEXT NULL,

  `completedDate` VARCHAR(40) NULL,
  `completedBy` VARCHAR(255) NULL,

  PRIMARY KEY (`id`),
  INDEX `idx_distributions_itemId` (`itemId`),
  CONSTRAINT `fk_distributions_item`
    FOREIGN KEY (`itemId`) REFERENCES `items`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;



USE `order_Tracking`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `role` VARCHAR(20) NOT NULL,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(100) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

