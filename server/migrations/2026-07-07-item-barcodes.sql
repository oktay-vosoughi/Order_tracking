-- Barcode → item mapping for scan-based goods receiving.
-- Many barcodes may map to one item (different suppliers / package sizes).
-- Rollback: DROP TABLE item_barcodes;

CREATE TABLE IF NOT EXISTS item_barcodes (
  id VARCHAR(64) NOT NULL,
  itemId VARCHAR(64) NOT NULL,
  barcode VARCHAR(128) NOT NULL,
  barcodeType VARCHAR(16) NOT NULL DEFAULT 'OTHER',
  createdBy VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_item_barcodes_barcode (barcode),
  KEY idx_item_barcodes_item (itemId),
  CONSTRAINT fk_item_barcodes_item FOREIGN KEY (itemId) REFERENCES item_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
