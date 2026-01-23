-- Add orderedDate column to purchases table
-- This represents when "Sipariş Ver" button is clicked (order placement date)
-- Different from receivedDate which is when goods are received

USE `order_Tracking`;

-- Check if column exists before adding
SET @col_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
                   WHERE TABLE_SCHEMA = 'order_Tracking' 
                   AND TABLE_NAME = 'purchases' 
                   AND COLUMN_NAME = 'orderedDate');

SET @sql = IF(@col_exists = 0, 
              'ALTER TABLE purchases ADD COLUMN orderedDate DATE NULL AFTER orderedAt',
              'SELECT "Column orderedDate already exists" AS message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SELECT 'Migration complete: orderedDate column added to purchases table' AS status;
