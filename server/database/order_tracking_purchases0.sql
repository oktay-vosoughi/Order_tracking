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

-- Dump completed on 2026-01-29 11:28:57
