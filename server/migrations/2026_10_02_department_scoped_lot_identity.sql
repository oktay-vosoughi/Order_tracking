-- Allow the same material and physical LOT number to exist independently in
-- different department stock pools. Safe to run repeatedly.
SET @drop_old_item_lot_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'lots'
      AND index_name = 'uniq_item_lot'
  ),
  'ALTER TABLE lots DROP INDEX uniq_item_lot',
  'SELECT 1'
);
PREPARE drop_old_item_lot_index_stmt FROM @drop_old_item_lot_index;
EXECUTE drop_old_item_lot_index_stmt;
DEALLOCATE PREPARE drop_old_item_lot_index_stmt;

SET @add_department_lot_index = IF(
  EXISTS(
    SELECT 1 FROM information_schema.statistics
    WHERE table_schema = DATABASE() AND table_name = 'lots'
      AND index_name = 'uniq_item_lot_department'
  ),
  'SELECT 1',
  'ALTER TABLE lots ADD UNIQUE KEY uniq_item_lot_department (itemId, lotNumber, department)'
);
PREPARE add_department_lot_index_stmt FROM @add_department_lot_index;
EXECUTE add_department_lot_index_stmt;
DEALLOCATE PREPARE add_department_lot_index_stmt;
