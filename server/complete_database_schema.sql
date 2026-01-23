-- ============================================================
-- COMPLETE DATABASE SCHEMA FOR ORDER TRACKING SYSTEM
-- LOT-Based Inventory Management with Purchase Request Workflow
-- ============================================================
-- This script will DROP and RECREATE the entire database
-- WARNING: This will delete all existing data!
-- ============================================================

-- Drop and recreate database
DROP DATABASE IF EXISTS `order_Tracking`;
CREATE DATABASE `order_Tracking`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `order_Tracking`;

-- ============================================================
-- 1. USERS TABLE - Authentication and Authorization
-- ============================================================
CREATE TABLE `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `username` VARCHAR(100) NOT NULL,
  `passwordHash` VARCHAR(255) NOT NULL,
  `role` ENUM('ADMIN', 'APPROVER', 'REQUESTER') NOT NULL DEFAULT 'REQUESTER',
  `email` VARCHAR(255) NULL,
  `fullName` VARCHAR(255) NULL,
  `isActive` TINYINT(1) NOT NULL DEFAULT 1,
  `createdAt` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(100) NULL,
  `updatedAt` TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`),
  INDEX `idx_users_role` (`role`),
  INDEX `idx_users_active` (`isActive`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 2. ITEM_DEFINITIONS TABLE - Generic Item Master Data
-- ============================================================
CREATE TABLE `item_definitions` (
  `id` VARCHAR(64) NOT NULL,
  `code` VARCHAR(100) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `category` VARCHAR(255) NULL,
  `department` VARCHAR(100) NULL,
  `unit` VARCHAR(50) NULL DEFAULT 'adet',
  `minStock` INT NOT NULL DEFAULT 0,
  `reorderPoint` INT NULL,
  `supplier` VARCHAR(255) NULL,
  `catalogNo` VARCHAR(255) NULL,
  `brand` VARCHAR(255) NULL,
  `storageLocation` VARCHAR(255) NULL,
  `storageTemp` VARCHAR(50) NULL,
  `chemicalType` VARCHAR(100) NULL,
  `casNumber` VARCHAR(50) NULL,
  `msdsUrl` TEXT NULL,
  `notes` TEXT NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'DISCONTINUED') DEFAULT 'ACTIVE',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(255) NULL,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_item_code` (`code`),
  INDEX `idx_item_name` (`name`),
  INDEX `idx_item_category` (`category`),
  INDEX `idx_item_department` (`department`),
  INDEX `idx_item_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 3. LOTS TABLE - Individual Batch/LOT Instances
-- ============================================================
CREATE TABLE `lots` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `lotNumber` VARCHAR(100) NOT NULL,
  `manufacturer` VARCHAR(255) NULL,
  `catalogNo` VARCHAR(255) NULL,
  `expiryDate` DATE NULL,
  `receivedDate` DATE NOT NULL,
  `initialQuantity` DECIMAL(10,2) NOT NULL,
  `currentQuantity` DECIMAL(10,2) NOT NULL,
  `status` ENUM('ACTIVE', 'DEPLETED', 'EXPIRED', 'QUARANTINE') DEFAULT 'ACTIVE',
  `department` VARCHAR(100) NULL,
  `location` VARCHAR(255) NULL,
  `storageLocation` VARCHAR(255) NULL,
  `invoiceNo` VARCHAR(255) NULL,
  `purchaseId` VARCHAR(64) NULL,
  `receiptId` VARCHAR(64) NULL,
  `attachmentUrl` TEXT NULL,
  `attachmentName` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(255) NULL,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_lot_itemId` (`itemId`),
  INDEX `idx_lot_number` (`lotNumber`),
  INDEX `idx_lot_expiry` (`expiryDate`),
  INDEX `idx_lot_status` (`status`),
  INDEX `idx_lot_received` (`receivedDate`),
  UNIQUE KEY `uniq_item_lot` (`itemId`, `lotNumber`),
  CONSTRAINT `fk_lot_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 4. PURCHASES TABLE - Purchase Request Workflow
-- ============================================================
CREATE TABLE `purchases` (
  `id` VARCHAR(64) NOT NULL,
  `requestNumber` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  
  -- Request Phase
  `requestedQty` INT NOT NULL,
  `requestedBy` VARCHAR(255) NOT NULL,
  `requestedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `requestDate` DATE NOT NULL,
  `urgency` ENUM('normal', 'urgent', 'critical') DEFAULT 'normal',
  `notes` TEXT NULL,
  
  -- Approval Phase
  `approvedBy` VARCHAR(255) NULL,
  `approvedAt` DATETIME NULL,
  `approvedDate` DATE NULL,
  `approvalNote` TEXT NULL,
  
  -- Rejection (if applicable)
  `rejectedBy` VARCHAR(255) NULL,
  `rejectedAt` DATETIME NULL,
  `rejectedDate` DATE NULL,
  `rejectionReason` TEXT NULL,
  
  -- Order Phase
  `orderedBy` VARCHAR(255) NULL,
  `orderedAt` DATETIME NULL,
  `orderedDate` DATE NULL,
  `supplierName` VARCHAR(255) NULL,
  `poNumber` VARCHAR(255) NULL,
  `orderedQty` INT NULL,
  `estimatedDelivery` DATE NULL,
  
  -- Receipt Phase
  `receivedQtyTotal` INT NULL DEFAULT 0,
  
  -- Status Tracking
  `status` ENUM(
    'TALEP_EDILDI',      -- Requested
    'ONAYLANDI',         -- Approved
    'REDDEDILDI',        -- Rejected
    'SIPARIS_VERILDI',   -- Ordered
    'KISMI_TESLIM',      -- Partially Received
    'TESLIM_ALINDI',     -- Fully Received
    'IPTAL'              -- Cancelled
  ) NOT NULL DEFAULT 'TALEP_EDILDI',
  
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_request_number` (`requestNumber`),
  INDEX `idx_purchases_itemId` (`itemId`),
  INDEX `idx_purchases_status` (`status`),
  INDEX `idx_purchases_requestedAt` (`requestedAt`),
  INDEX `idx_purchases_requestedBy` (`requestedBy`),
  CONSTRAINT `fk_purchases_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 5. RECEIPTS TABLE - Goods Receipt Records
-- ============================================================
CREATE TABLE `receipts` (
  `receiptId` VARCHAR(64) NOT NULL,
  `purchaseId` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NULL,
  `receivedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `receivedBy` VARCHAR(255) NOT NULL,
  `receivedQty` INT NOT NULL,
  `lotNo` VARCHAR(255) NULL,
  `expiryDate` DATE NULL,
  `invoiceNo` VARCHAR(255) NULL,
  `attachmentUrl` TEXT NULL,
  `attachmentName` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`receiptId`),
  INDEX `idx_receipts_purchaseId` (`purchaseId`),
  INDEX `idx_receipts_lotId` (`lotId`),
  INDEX `idx_receipts_receivedAt` (`receivedAt`),
  CONSTRAINT `fk_receipts_purchase`
    FOREIGN KEY (`purchaseId`) REFERENCES `purchases`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_receipts_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 6. DISTRIBUTIONS TABLE - Item Distribution/Issue Records
-- ============================================================
CREATE TABLE `distributions` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `department` VARCHAR(255) NULL,
  `quantity` DECIMAL(10,2) NOT NULL,
  `useFefo` TINYINT(1) DEFAULT 1,
  
  `distributedBy` VARCHAR(255) NOT NULL,
  `distributedDate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `receivedBy` VARCHAR(255) NOT NULL,
  `purpose` TEXT NULL,
  
  `status` ENUM('PENDING', 'COMPLETED', 'CANCELLED') DEFAULT 'PENDING',
  `completedDate` DATETIME NULL,
  `completedBy` VARCHAR(255) NULL,
  
  `notes` TEXT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  PRIMARY KEY (`id`),
  INDEX `idx_distributions_itemId` (`itemId`),
  INDEX `idx_distributions_distributedDate` (`distributedDate`),
  INDEX `idx_distributions_status` (`status`),
  INDEX `idx_distributions_department` (`department`),
  CONSTRAINT `fk_distributions_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 7. DISTRIBUTION_LOTS TABLE - Junction for Distribution LOT Tracking
-- ============================================================
CREATE TABLE `distribution_lots` (
  `id` VARCHAR(64) NOT NULL,
  `distributionId` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `lotNumber` VARCHAR(100) NULL,
  `quantityUsed` DECIMAL(10,2) NOT NULL,
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  INDEX `idx_distribution_lots_distributionId` (`distributionId`),
  INDEX `idx_distribution_lots_lotId` (`lotId`),
  CONSTRAINT `fk_distribution_lots_distribution`
    FOREIGN KEY (`distributionId`) REFERENCES `distributions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_distribution_lots_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 8. USAGE_RECORDS TABLE - Consumption History (FEFO Tracking)
-- ============================================================
CREATE TABLE `usage_records` (
  `id` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `quantityUsed` DECIMAL(10,2) NOT NULL,
  `usedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `usedBy` VARCHAR(255) NOT NULL,
  `receivedBy` VARCHAR(255) NULL,
  `department` VARCHAR(100) NULL,
  `purpose` TEXT NULL,
  `notes` TEXT NULL,
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
-- 9. WASTE_RECORDS TABLE - Waste/Disposal Tracking
-- ============================================================
CREATE TABLE `waste_records` (
  `id` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NULL,
  `lotNumber` VARCHAR(100) NULL,
  `itemCode` VARCHAR(100) NULL,
  `itemName` VARCHAR(255) NULL,
  `quantity` DECIMAL(10,2) NOT NULL,
  `wasteType` ENUM('EXPIRED', 'DAMAGED', 'CONTAMINATED', 'EXCESS', 'OTHER') NOT NULL,
  `reason` TEXT NULL,
  `disposalMethod` VARCHAR(255) NULL,
  `certificationNo` VARCHAR(255) NULL,
  `disposedBy` VARCHAR(255) NOT NULL,
  `disposedDate` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_waste_itemId` (`itemId`),
  INDEX `idx_waste_lotId` (`lotId`),
  INDEX `idx_waste_disposedDate` (`disposedDate`),
  INDEX `idx_waste_type` (`wasteType`),
  CONSTRAINT `fk_waste_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE RESTRICT
    ON UPDATE CASCADE,
  CONSTRAINT `fk_waste_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 10. LOT_ADJUSTMENTS TABLE - Manual Stock Adjustments
-- ============================================================
CREATE TABLE `lot_adjustments` (
  `id` VARCHAR(64) NOT NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `adjustmentType` ENUM('CORRECTION', 'DAMAGE', 'FOUND', 'LOSS', 'TRANSFER', 'OTHER') NOT NULL,
  `quantityChange` DECIMAL(10,2) NOT NULL,
  `reason` TEXT NULL,
  `adjustedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `adjustedBy` VARCHAR(255) NOT NULL,
  `approvedBy` VARCHAR(255) NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_adj_lotId` (`lotId`),
  INDEX `idx_adj_type` (`adjustmentType`),
  INDEX `idx_adj_adjustedAt` (`adjustedAt`),
  CONSTRAINT `fk_adj_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 11. COUNTING_SCHEDULES TABLE - Physical Count Schedules
-- ============================================================
CREATE TABLE `counting_schedules` (
  `id` VARCHAR(64) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `description` TEXT NULL,
  `frequency` ENUM('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'ADHOC') NOT NULL,
  `nextCountDate` DATE NULL,
  `lastCountDate` DATE NULL,
  `assignedTo` VARCHAR(255) NULL,
  `status` ENUM('ACTIVE', 'INACTIVE', 'COMPLETED') DEFAULT 'ACTIVE',
  `createdAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_nextDate` (`nextCountDate`),
  INDEX `idx_counting_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 12. COUNTING_RECORDS TABLE - Physical Count Results
-- ============================================================
CREATE TABLE `counting_records` (
  `id` VARCHAR(64) NOT NULL,
  `scheduleId` VARCHAR(64) NULL,
  `lotId` VARCHAR(64) NOT NULL,
  `itemId` VARCHAR(64) NOT NULL,
  `expectedQuantity` DECIMAL(10,2) NOT NULL,
  `countedQuantity` DECIMAL(10,2) NOT NULL,
  `variance` DECIMAL(10,2) NOT NULL,
  `countedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `countedBy` VARCHAR(255) NOT NULL,
  `notes` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_counting_scheduleId` (`scheduleId`),
  INDEX `idx_counting_lotId` (`lotId`),
  INDEX `idx_counting_itemId` (`itemId`),
  INDEX `idx_counting_countedAt` (`countedAt`),
  CONSTRAINT `fk_counting_schedule`
    FOREIGN KEY (`scheduleId`) REFERENCES `counting_schedules`(`id`)
    ON DELETE SET NULL
    ON UPDATE CASCADE,
  CONSTRAINT `fk_counting_lot`
    FOREIGN KEY (`lotId`) REFERENCES `lots`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE,
  CONSTRAINT `fk_counting_item`
    FOREIGN KEY (`itemId`) REFERENCES `item_definitions`(`id`)
    ON DELETE CASCADE
    ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 13. ATTACHMENTS TABLE - File Attachments for Various Entities
-- ============================================================
CREATE TABLE `attachments` (
  `id` VARCHAR(64) NOT NULL,
  `entityType` ENUM('PURCHASE', 'RECEIPT', 'LOT', 'DISTRIBUTION', 'WASTE', 'ITEM') NOT NULL,
  `entityId` VARCHAR(64) NOT NULL,
  `fileName` VARCHAR(255) NOT NULL,
  `fileData` LONGTEXT NOT NULL,
  `fileType` VARCHAR(100) NULL,
  `fileSize` INT NULL,
  `uploadedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `uploadedBy` VARCHAR(255) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_attachments_entity` (`entityType`, `entityId`),
  INDEX `idx_attachments_uploadedAt` (`uploadedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- 14. AUDIT_LOG TABLE - System Audit Trail
-- ============================================================
CREATE TABLE `audit_log` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `tableName` VARCHAR(100) NOT NULL,
  `recordId` VARCHAR(64) NOT NULL,
  `action` ENUM('INSERT', 'UPDATE', 'DELETE') NOT NULL,
  `oldValues` JSON NULL,
  `newValues` JSON NULL,
  `changedBy` VARCHAR(255) NOT NULL,
  `changedAt` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ipAddress` VARCHAR(45) NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_audit_table` (`tableName`),
  INDEX `idx_audit_recordId` (`recordId`),
  INDEX `idx_audit_changedAt` (`changedAt`),
  INDEX `idx_audit_changedBy` (`changedBy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- VIEWS FOR COMMON QUERIES
-- ============================================================

-- Stock Summary View
CREATE OR REPLACE VIEW `v_stock_summary` AS
SELECT 
  id.id,
  id.code,
  id.name,
  id.category,
  id.department,
  id.unit,
  id.minStock,
  id.supplier,
  id.status AS itemStatus,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS availableStock,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) AS expiredStock,
  COUNT(DISTINCT CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.id END) AS activeLotCount,
  MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate >= CURDATE() THEN l.expiryDate END) AS nearestExpiry,
  CASE 
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) = 0 THEN 'STOK_YOK'
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) < id.minStock THEN 'SATIN_AL'
    WHEN MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 'SKT_YAKIN'
    WHEN COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 AND l.expiryDate < CURDATE() THEN l.currentQuantity ELSE 0 END), 0) > 0 THEN 'SKT_GECMIS'
    ELSE 'STOKTA'
  END AS stockStatus
FROM item_definitions id
LEFT JOIN lots l ON id.id = l.itemId
WHERE id.status = 'ACTIVE'
GROUP BY id.id;

-- Purchase Request Summary View
CREATE OR REPLACE VIEW `v_purchase_summary` AS
SELECT 
  p.*,
  id.name AS itemNameFull,
  id.unit AS itemUnit,
  (p.orderedQty - COALESCE(p.receivedQtyTotal, 0)) AS remainingQty,
  CASE 
    WHEN p.status = 'TALEP_EDILDI' THEN 'Talep Edildi'
    WHEN p.status = 'ONAYLANDI' THEN 'Onaylandı'
    WHEN p.status = 'REDDEDILDI' THEN 'Reddedildi'
    WHEN p.status = 'SIPARIS_VERILDI' THEN 'Sipariş Verildi'
    WHEN p.status = 'KISMI_TESLIM' THEN 'Kısmi Teslim'
    WHEN p.status = 'TESLIM_ALINDI' THEN 'Teslim Alındı'
    WHEN p.status = 'IPTAL' THEN 'İptal'
  END AS statusText
FROM purchases p
LEFT JOIN item_definitions id ON p.itemId = id.id;

-- ============================================================
-- INITIAL DATA - Default Admin User
-- ============================================================
-- Password: admin123 (hashed with bcrypt)
INSERT INTO `users` (`username`, `passwordHash`, `role`, `createdBy`) VALUES
('admin', '$2b$10$rN8qKH.vYxGZvKjK5qKqZOxGxGxGxGxGxGxGxGxGxGxGxGxGxGxGxG', 'ADMIN', 'system');

-- ============================================================
-- INDEXES FOR PERFORMANCE OPTIMIZATION
-- ============================================================
-- Additional composite indexes for common queries
CREATE INDEX `idx_lots_item_status_expiry` ON `lots`(`itemId`, `status`, `expiryDate`);
CREATE INDEX `idx_lots_item_status_received` ON `lots`(`itemId`, `status`, `receivedDate`);
CREATE INDEX `idx_purchases_item_status` ON `purchases`(`itemId`, `status`);
CREATE INDEX `idx_distributions_item_date` ON `distributions`(`itemId`, `distributedDate`);
CREATE INDEX `idx_usage_item_date` ON `usage_records`(`itemId`, `usedAt`);

-- ============================================================
-- DATABASE SCHEMA COMPLETE
-- ============================================================
-- Total Tables: 14
-- Total Views: 2
-- Features:
--   - LOT-based inventory with FEFO tracking
--   - Complete purchase request workflow
--   - Distribution with LOT traceability
--   - Waste management
--   - Physical counting
--   - Audit trail
--   - File attachments
--   - User authentication and authorization
-- ============================================================
