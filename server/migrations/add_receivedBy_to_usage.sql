-- Add receivedBy column to usage_records table
-- This field stores the name of the person who received the material

ALTER TABLE `usage_records` 
ADD COLUMN `receivedBy` VARCHAR(255) NULL AFTER `usedBy`;
