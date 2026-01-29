-- Migration: Add receipt tracking fields to purchases table
-- Date: 2026-01-27
-- These fields are needed for the receive goods functionality

-- Add receivedBy column
ALTER TABLE purchases 
ADD COLUMN receivedBy VARCHAR(255) NULL AFTER receivedQtyTotal;

-- Add receivedDate column
ALTER TABLE purchases 
ADD COLUMN receivedDate DATETIME NULL AFTER receivedBy;

-- Add lotNo column
ALTER TABLE purchases 
ADD COLUMN lotNo VARCHAR(255) NULL AFTER receivedDate;

-- Add expiryDate column
ALTER TABLE purchases 
ADD COLUMN expiryDate DATE NULL AFTER lotNo;
