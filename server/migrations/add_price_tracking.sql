-- Migration: Add price tracking to receipts and purchases
-- Run manually or applied automatically at server startup via ALTER TABLE ... IGNORE

-- Add price and supplier firm name to receipts (recorded at goods receipt time)
ALTER TABLE receipts
  ADD COLUMN price DECIMAL(12,4) NULL COMMENT 'Unit price at receipt time',
  ADD COLUMN supplierFirmName VARCHAR(255) NULL COMMENT 'Supplier firm name at receipt time';

-- Add unit price to purchases (recorded at approve/order time)
ALTER TABLE purchases
  ADD COLUMN unitPrice DECIMAL(12,4) NULL COMMENT 'Unit price at order time';
