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
