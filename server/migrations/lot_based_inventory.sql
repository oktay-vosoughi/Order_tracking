-- Migration: LOT-based Inventory Management System
-- This migration transforms the inventory system to properly track LOT/batch instances

USE `order_Tracking`;

-- ============================================================
-- 1. Create item_definitions table (generic item info)
-- ============================================================
CREATE TABLE IF NOT EXISTS `item_definitions` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(255) NULL,
  `department` VARCHAR(100) NULL,
  `unit` VARCHAR(50) NULL,
  `minStock` INT NOT NULL DEFAULT 0,
  `supplier` VARCHAR(255) NULL,
  `catalogNo` VARCHAR(255) NULL,
  `brand` VARCHAR(255) NULL,
  `storageLocation` VARCHAR(255) NULL,
  `storageTemp` VARCHAR(50) NULL,
  `chemicalType` VARCHAR(100) NULL,
  `msdsUrl` TEXT NULL,
  `notes` TEXT NULL,
  `status` VARCHAR(50) DEFAULT 'ACTIVE',
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(255) NULL,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_item_code` (`code`),
  INDEX `idx_item_name` (`name`),
  INDEX `idx_item_category` (`category`),
  INDEX `idx_item_department` (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. Create lots table (LOT/batch instances)
-- ============================================================
CREATE TABLE IF NOT EXISTS `lots` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `lotNumber` VARCHAR(100) NOT NULL,
  `manufacturer` VARCHAR(255) NULL,
  `catalogNo` VARCHAR(255) NULL,
  `expiryDate` DATE NULL,
  `receivedDate` DATE NOT NULL,
  `initialQuantity` INT NOT NULL,
  `currentQuantity` INT NOT NULL,
  `status` VARCHAR(50) DEFAULT 'ACTIVE',
  `department` VARCHAR(100) NULL,
  `location` VARCHAR(255) NULL,
  `storageLocation` VARCHAR(255) NULL,
  `invoiceNo` VARCHAR(255) NULL,
  `attachmentUrl` TEXT NULL,
  `attachmentName` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(255) NULL,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_lot_itemId` (`itemId`),
  INDEX `idx_lot_number` (`lotNumber`),
  INDEX `idx_lot_expiry` (`expiryDate`),
  INDEX `idx_lot_status` (`status`),
  UNIQUE KEY `uniq_item_lot` (`itemId`, `lotNumber`),
  CONSTRAINT `fk_lot_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. Create usage_records table (consumption history)
-- ============================================================
CREATE TABLE IF NOT EXISTS `usage_records` (
  `id` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `quantityUsed` INT NOT NULL,
  `usedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `usedBy` VARCHAR(255) NOT NULL,
  `department` VARCHAR(100) NULL,
  `purpose` TEXT NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_usage_lotId` (`lotId`),
  INDEX `idx_usage_itemId` (`itemId`),
  INDEX `idx_usage_usedAt` (`usedAt`),
  INDEX `idx_usage_department` (`department`),
  CONSTRAINT `fk_usage_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_usage_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. Create lot_adjustments table (for corrections, waste, etc.)
-- ============================================================
CREATE TABLE IF NOT EXISTS `lot_adjustments` (
  `id` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `adjustmentType` VARCHAR(50) NOT NULL,
  `quantityChange` INT NOT NULL,
  `reason` TEXT NULL,
  `adjustedAt` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `adjustedBy` VARCHAR(255) NOT NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_adj_lotId` (`lotId`),
  INDEX `idx_adj_type` (`adjustmentType`),
  CONSTRAINT `fk_adj_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- Note: The existing tables (items, purchases, receipts, distributions, waste_records)
-- will be kept for backward compatibility. The new LOT-based system runs in parallel.
-- Data migration from old to new structure can be done separately if needed.
-- ============================================================
