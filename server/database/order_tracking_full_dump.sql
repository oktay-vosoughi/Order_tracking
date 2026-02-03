-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `attachments`
--

DROP TABLE IF EXISTS `attachments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `attachments` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityType` enum('PURCHASE','RECEIPT','LOT','DISTRIBUTION','WASTE','ITEM') COLLATE utf8mb4_unicode_ci NOT NULL,
  `entityId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileName` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileData` longtext COLLATE utf8mb4_unicode_ci NOT NULL,
  `fileType` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fileSize` int DEFAULT NULL,
  `uploadedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `uploadedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_attachments_entity` (`entityType`,`entityId`),
  KEY `idx_attachments_uploadedAt` (`uploadedAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:21
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `audit_log`
--

DROP TABLE IF EXISTS `audit_log`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `audit_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `tableName` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `recordId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `action` enum('INSERT','UPDATE','DELETE') COLLATE utf8mb4_unicode_ci NOT NULL,
  `oldValues` json DEFAULT NULL,
  `newValues` json DEFAULT NULL,
  `changedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `changedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ipAddress` varchar(45) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_audit_table` (`tableName`),
  KEY `idx_audit_recordId` (`recordId`),
  KEY `idx_audit_changedAt` (`changedAt`),
  KEY `idx_audit_changedBy` (`changedBy`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:19
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `counting_records`
--

DROP TABLE IF EXISTS `counting_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `counting_records` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `scheduleId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `expectedQuantity` decimal(10,2) NOT NULL,
  `countedQuantity` decimal(10,2) NOT NULL,
  `variance` decimal(10,2) NOT NULL,
  `countedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `countedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_counting_scheduleId` (`scheduleId`),
  KEY `idx_counting_lotId` (`lotId`),
  KEY `idx_counting_itemId` (`itemId`),
  KEY `idx_counting_countedAt` (`countedAt`),
  CONSTRAINT `fk_counting_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_counting_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_counting_schedule` FOREIGN KEY (`scheduleId`) REFERENCES `counting_schedules` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:20
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `counting_schedules`
--

DROP TABLE IF EXISTS `counting_schedules`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `counting_schedules` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `frequency` enum('DAILY','WEEKLY','MONTHLY','QUARTERLY','YEARLY','ADHOC') COLLATE utf8mb4_unicode_ci NOT NULL,
  `nextCountDate` date DEFAULT NULL,
  `lastCountDate` date DEFAULT NULL,
  `assignedTo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` enum('ACTIVE','INACTIVE','COMPLETED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_counting_nextDate` (`nextCountDate`),
  KEY `idx_counting_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:19
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `distribution_lots`
--

DROP TABLE IF EXISTS `distribution_lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distribution_lots` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distributionId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotNumber` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantityUsed` decimal(10,2) NOT NULL,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_distribution_lots_distributionId` (`distributionId`),
  KEY `idx_distribution_lots_lotId` (`lotId`),
  CONSTRAINT `fk_distribution_lots_distribution` FOREIGN KEY (`distributionId`) REFERENCES `distributions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_distribution_lots_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:20
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `distributions`
--

DROP TABLE IF EXISTS `distributions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `distributions` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemCode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `useFefo` tinyint(1) DEFAULT '1',
  `distributedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `distributedDate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `receivedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `status` enum('PENDING','COMPLETED','CANCELLED') COLLATE utf8mb4_unicode_ci DEFAULT 'PENDING',
  `completedDate` datetime DEFAULT NULL,
  `completedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_distributions_itemId` (`itemId`),
  KEY `idx_distributions_distributedDate` (`distributedDate`),
  KEY `idx_distributions_status` (`status`),
  KEY `idx_distributions_department` (`department`),
  KEY `idx_distributions_item_date` (`itemId`,`distributedDate`),
  CONSTRAINT `fk_distributions_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:20
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `item_definitions`
--

DROP TABLE IF EXISTS `item_definitions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `item_definitions` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `code` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `category` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `unit` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'adet',
  `minStock` int NOT NULL DEFAULT '0',
  `ideal_stock` decimal(10,2) DEFAULT NULL,
  `max_stock` decimal(10,2) DEFAULT NULL,
  `reorderPoint` int DEFAULT NULL,
  `supplier` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `catalogNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `brand` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storageLocation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storageTemp` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `chemicalType` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `casNumber` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `msdsUrl` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `status` enum('ACTIVE','INACTIVE','DISCONTINUED') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_item_code` (`code`),
  KEY `idx_item_name` (`name`),
  KEY `idx_item_category` (`category`),
  KEY `idx_item_department` (`department`),
  KEY `idx_item_status` (`status`),
  KEY `idx_item_ideal_stock` (`ideal_stock`),
  KEY `idx_item_max_stock` (`max_stock`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:22
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `lot_adjustments`
--

DROP TABLE IF EXISTS `lot_adjustments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lot_adjustments` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `adjustmentType` enum('CORRECTION','DAMAGE','FOUND','LOSS','TRANSFER','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantityChange` decimal(10,2) NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `adjustedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `adjustedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `approvedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_adj_lotId` (`lotId`),
  KEY `idx_adj_type` (`adjustmentType`),
  KEY `idx_adj_adjustedAt` (`adjustedAt`),
  CONSTRAINT `fk_adj_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:19
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `lots`
--

DROP TABLE IF EXISTS `lots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `lots` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotNumber` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `manufacturer` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `catalogNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiryDate` date DEFAULT NULL,
  `receivedDate` date NOT NULL,
  `initialQuantity` decimal(10,2) NOT NULL,
  `currentQuantity` decimal(10,2) NOT NULL,
  `status` enum('ACTIVE','DEPLETED','EXPIRED','QUARANTINE') COLLATE utf8mb4_unicode_ci DEFAULT 'ACTIVE',
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `storageLocation` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `invoiceNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purchaseId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receiptId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachmentUrl` longtext COLLATE utf8mb4_unicode_ci,
  `attachmentName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `updatedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_item_lot` (`itemId`,`lotNumber`),
  KEY `idx_lot_itemId` (`itemId`),
  KEY `idx_lot_number` (`lotNumber`),
  KEY `idx_lot_expiry` (`expiryDate`),
  KEY `idx_lot_status` (`status`),
  KEY `idx_lot_received` (`receivedDate`),
  KEY `idx_lots_item_status_expiry` (`itemId`,`status`,`expiryDate`),
  KEY `idx_lots_item_status_received` (`itemId`,`status`,`receivedDate`),
  CONSTRAINT `fk_lot_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:21
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `purchases`
--

DROP TABLE IF EXISTS `purchases`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchases` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requestNumber` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemCode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `requestedQty` int NOT NULL,
  `requestedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `requestedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `requestDate` date NOT NULL,
  `urgency` enum('normal','urgent','critical') COLLATE utf8mb4_unicode_ci DEFAULT 'normal',
  `notes` text COLLATE utf8mb4_unicode_ci,
  `approvedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `approvedAt` datetime DEFAULT NULL,
  `approvedDate` date DEFAULT NULL,
  `approvalNote` text COLLATE utf8mb4_unicode_ci,
  `rejectedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `rejectedAt` datetime DEFAULT NULL,
  `rejectedDate` date DEFAULT NULL,
  `rejectionReason` text COLLATE utf8mb4_unicode_ci,
  `orderedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orderedAt` datetime DEFAULT NULL,
  `orderedDate` date DEFAULT NULL,
  `supplierName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `poNumber` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `orderedQty` int DEFAULT NULL,
  `estimatedDelivery` date DEFAULT NULL,
  `receivedQtyTotal` int DEFAULT '0',
  `receivedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receivedDate` datetime DEFAULT NULL,
  `lotNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiryDate` date DEFAULT NULL,
  `status` enum('TALEP_EDILDI','ONAYLANDI','REDDEDILDI','SIPARIS_VERILDI','KISMI_TESLIM','TESLIM_ALINDI','IPTAL') COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'TALEP_EDILDI',
  `createdAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` datetime DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_request_number` (`requestNumber`),
  KEY `idx_purchases_itemId` (`itemId`),
  KEY `idx_purchases_status` (`status`),
  KEY `idx_purchases_requestedAt` (`requestedAt`),
  KEY `idx_purchases_requestedBy` (`requestedBy`),
  KEY `idx_purchases_item_status` (`itemId`,`status`),
  CONSTRAINT `fk_purchases_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:21
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `receipts`
--

DROP TABLE IF EXISTS `receipts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `receipts` (
  `receiptId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `purchaseId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `receivedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `receivedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `receivedQty` int NOT NULL,
  `lotNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `expiryDate` date DEFAULT NULL,
  `invoiceNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `attachmentUrl` longtext COLLATE utf8mb4_unicode_ci,
  `attachmentName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`receiptId`),
  KEY `idx_receipts_purchaseId` (`purchaseId`),
  KEY `idx_receipts_lotId` (`lotId`),
  KEY `idx_receipts_receivedAt` (`receivedAt`),
  CONSTRAINT `fk_receipts_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_receipts_purchase` FOREIGN KEY (`purchaseId`) REFERENCES `purchases` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:21
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Temporary view structure for view `v_purchase_summary`
--

DROP TABLE IF EXISTS `v_purchase_summary`;
/*!50001 DROP VIEW IF EXISTS `v_purchase_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_purchase_summary` AS SELECT 
 1 AS `id`,
 1 AS `requestNumber`,
 1 AS `itemId`,
 1 AS `itemCode`,
 1 AS `itemName`,
 1 AS `department`,
 1 AS `requestedQty`,
 1 AS `requestedBy`,
 1 AS `requestedAt`,
 1 AS `requestDate`,
 1 AS `urgency`,
 1 AS `notes`,
 1 AS `approvedBy`,
 1 AS `approvedAt`,
 1 AS `approvedDate`,
 1 AS `approvalNote`,
 1 AS `rejectedBy`,
 1 AS `rejectedAt`,
 1 AS `rejectedDate`,
 1 AS `rejectionReason`,
 1 AS `orderedBy`,
 1 AS `orderedAt`,
 1 AS `orderedDate`,
 1 AS `supplierName`,
 1 AS `poNumber`,
 1 AS `orderedQty`,
 1 AS `estimatedDelivery`,
 1 AS `receivedQtyTotal`,
 1 AS `status`,
 1 AS `createdAt`,
 1 AS `updatedAt`,
 1 AS `itemNameFull`,
 1 AS `itemUnit`,
 1 AS `remainingQty`,
 1 AS `statusText`*/;
SET character_set_client = @saved_cs_client;

--
-- Temporary view structure for view `v_stock_summary`
--

DROP TABLE IF EXISTS `v_stock_summary`;
/*!50001 DROP VIEW IF EXISTS `v_stock_summary`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `v_stock_summary` AS SELECT 
 1 AS `id`,
 1 AS `code`,
 1 AS `name`,
 1 AS `category`,
 1 AS `department`,
 1 AS `unit`,
 1 AS `minStock`,
 1 AS `supplier`,
 1 AS `itemStatus`,
 1 AS `totalStock`,
 1 AS `availableStock`,
 1 AS `expiredStock`,
 1 AS `activeLotCount`,
 1 AS `nearestExpiry`,
 1 AS `stockStatus`*/;
SET character_set_client = @saved_cs_client;

--
-- Final view structure for view `v_purchase_summary`
--

/*!50001 DROP VIEW IF EXISTS `v_purchase_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_purchase_summary` AS select `p`.`id` AS `id`,`p`.`requestNumber` AS `requestNumber`,`p`.`itemId` AS `itemId`,`p`.`itemCode` AS `itemCode`,`p`.`itemName` AS `itemName`,`p`.`department` AS `department`,`p`.`requestedQty` AS `requestedQty`,`p`.`requestedBy` AS `requestedBy`,`p`.`requestedAt` AS `requestedAt`,`p`.`requestDate` AS `requestDate`,`p`.`urgency` AS `urgency`,`p`.`notes` AS `notes`,`p`.`approvedBy` AS `approvedBy`,`p`.`approvedAt` AS `approvedAt`,`p`.`approvedDate` AS `approvedDate`,`p`.`approvalNote` AS `approvalNote`,`p`.`rejectedBy` AS `rejectedBy`,`p`.`rejectedAt` AS `rejectedAt`,`p`.`rejectedDate` AS `rejectedDate`,`p`.`rejectionReason` AS `rejectionReason`,`p`.`orderedBy` AS `orderedBy`,`p`.`orderedAt` AS `orderedAt`,`p`.`orderedDate` AS `orderedDate`,`p`.`supplierName` AS `supplierName`,`p`.`poNumber` AS `poNumber`,`p`.`orderedQty` AS `orderedQty`,`p`.`estimatedDelivery` AS `estimatedDelivery`,`p`.`receivedQtyTotal` AS `receivedQtyTotal`,`p`.`status` AS `status`,`p`.`createdAt` AS `createdAt`,`p`.`updatedAt` AS `updatedAt`,`id`.`name` AS `itemNameFull`,`id`.`unit` AS `itemUnit`,(`p`.`orderedQty` - coalesce(`p`.`receivedQtyTotal`,0)) AS `remainingQty`,(case when (`p`.`status` = 'TALEP_EDILDI') then 'Talep Edildi' when (`p`.`status` = 'ONAYLANDI') then 'Onaylandı' when (`p`.`status` = 'REDDEDILDI') then 'Reddedildi' when (`p`.`status` = 'SIPARIS_VERILDI') then 'Sipariş Verildi' when (`p`.`status` = 'KISMI_TESLIM') then 'Kısmi Teslim' when (`p`.`status` = 'TESLIM_ALINDI') then 'Teslim Alındı' when (`p`.`status` = 'IPTAL') then 'İptal' end) AS `statusText` from (`purchases` `p` left join `item_definitions` `id` on((`p`.`itemId` = `id`.`id`))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- Final view structure for view `v_stock_summary`
--

/*!50001 DROP VIEW IF EXISTS `v_stock_summary`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = utf8mb4 */;
/*!50001 SET character_set_results     = utf8mb4 */;
/*!50001 SET collation_connection      = utf8mb4_0900_ai_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `v_stock_summary` AS select `id`.`id` AS `id`,`id`.`code` AS `code`,`id`.`name` AS `name`,`id`.`category` AS `category`,`id`.`department` AS `department`,`id`.`unit` AS `unit`,`id`.`minStock` AS `minStock`,`id`.`supplier` AS `supplier`,`id`.`status` AS `itemStatus`,coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0)) then `l`.`currentQuantity` else 0 end)),0) AS `totalStock`,coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and ((`l`.`expiryDate` is null) or (`l`.`expiryDate` >= curdate()))) then `l`.`currentQuantity` else 0 end)),0) AS `availableStock`,coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and (`l`.`expiryDate` < curdate())) then `l`.`currentQuantity` else 0 end)),0) AS `expiredStock`,count(distinct (case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0)) then `l`.`id` end)) AS `activeLotCount`,min((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and (`l`.`expiryDate` >= curdate())) then `l`.`expiryDate` end)) AS `nearestExpiry`,(case when (coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and ((`l`.`expiryDate` is null) or (`l`.`expiryDate` >= curdate()))) then `l`.`currentQuantity` else 0 end)),0) = 0) then 'STOK_YOK' when (coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and ((`l`.`expiryDate` is null) or (`l`.`expiryDate` >= curdate()))) then `l`.`currentQuantity` else 0 end)),0) < `id`.`minStock`) then 'SATIN_AL' when (min((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0)) then `l`.`expiryDate` end)) <= (curdate() + interval 30 day)) then 'SKT_YAKIN' when (coalesce(sum((case when ((`l`.`status` = 'ACTIVE') and (`l`.`currentQuantity` > 0) and (`l`.`expiryDate` < curdate())) then `l`.`currentQuantity` else 0 end)),0) > 0) then 'SKT_GECMIS' else 'STOKTA' end) AS `stockStatus` from (`item_definitions` `id` left join `lots` `l` on((`id`.`id` = `l`.`itemId`))) where (`id`.`status` = 'ACTIVE') group by `id`.`id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:23
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `usage_records`
--

DROP TABLE IF EXISTS `usage_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `usage_records` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `quantityUsed` decimal(10,2) NOT NULL,
  `usedAt` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `usedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `receivedBy` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `department` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `purpose` text COLLATE utf8mb4_unicode_ci,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_usage_lotId` (`lotId`),
  KEY `idx_usage_itemId` (`itemId`),
  KEY `idx_usage_usedAt` (`usedAt`),
  KEY `idx_usage_department` (`department`),
  KEY `idx_usage_item_date` (`itemId`,`usedAt`),
  CONSTRAINT `fk_usage_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_usage_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:20
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `passwordHash` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `role` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'OBSERVER',
  `email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `fullName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `isActive` tinyint(1) NOT NULL DEFAULT '1',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `createdBy` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_username` (`username`),
  KEY `idx_users_role` (`role`),
  KEY `idx_users_active` (`isActive`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:22
-- MySQL dump 10.13  Distrib 8.0.43, for Win64 (x86_64)
--
-- Host: localhost    Database: order_tracking
-- ------------------------------------------------------
-- Server version	8.0.43

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `waste_records`
--

DROP TABLE IF EXISTS `waste_records`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `waste_records` (
  `id` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `itemId` varchar(64) COLLATE utf8mb4_unicode_ci NOT NULL,
  `lotId` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `lotNumber` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `itemCode` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `itemName` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `quantity` decimal(10,2) NOT NULL,
  `wasteType` enum('EXPIRED','DAMAGED','CONTAMINATED','EXCESS','OTHER') COLLATE utf8mb4_unicode_ci NOT NULL,
  `reason` text COLLATE utf8mb4_unicode_ci,
  `disposalMethod` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `certificationNo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `disposedBy` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `disposedDate` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `notes` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_waste_itemId` (`itemId`),
  KEY `idx_waste_lotId` (`lotId`),
  KEY `idx_waste_disposedDate` (`disposedDate`),
  KEY `idx_waste_type` (`wasteType`),
  CONSTRAINT `fk_waste_item` FOREIGN KEY (`itemId`) REFERENCES `item_definitions` (`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `fk_waste_lot` FOREIGN KEY (`lotId`) REFERENCES `lots` (`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-29 15:28:18
