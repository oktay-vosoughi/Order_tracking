PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  minStock INTEGER DEFAULT 0,
  currentStock INTEGER DEFAULT 0,
  location TEXT,
  supplier TEXT,
  catalogNo TEXT,
  lotNo TEXT,
  brand TEXT,
  storageLocation TEXT,
  status TEXT,
  createdAt TEXT,
  createdBy TEXT
);

CREATE TABLE IF NOT EXISTS purchases (
  id TEXT PRIMARY KEY,
  requestNumber TEXT,
  itemId TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  itemCode TEXT,
  itemName TEXT,
  requestedQty INTEGER,
  requestedBy TEXT,
  requestedAt TEXT,
  requestDate TEXT,
  status TEXT,
  approvedBy TEXT,
  approvedAt TEXT,
  approvedDate TEXT,
  approvalNote TEXT,
  orderedBy TEXT,
  orderedAt TEXT,
  supplierName TEXT,
  poNumber TEXT,
  orderedQty INTEGER,
  receivedQtyTotal INTEGER,
  receivedQty INTEGER,
  receivedBy TEXT,
  receivedDate TEXT,
  lotNo TEXT,
  expiryDate TEXT,
  distributorCompany TEXT,
  notes TEXT,
  urgency TEXT,
  rejectionReason TEXT,
  rejectedBy TEXT,
  rejectedDate TEXT
);

CREATE TABLE IF NOT EXISTS receipts (
  receiptId TEXT PRIMARY KEY,
  purchaseId TEXT NOT NULL REFERENCES purchases(id) ON DELETE CASCADE,
  receivedAt TEXT,
  receivedBy TEXT,
  receivedQty INTEGER,
  lotNo TEXT,
  expiryDate TEXT,
  invoiceNo TEXT
);

CREATE TABLE IF NOT EXISTS distributions (
  id TEXT PRIMARY KEY,
  itemId TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  itemCode TEXT,
  itemName TEXT,
  quantity INTEGER,
  distributedBy TEXT,
  distributedDate TEXT,
  receivedBy TEXT,
  purpose TEXT,
  completedDate TEXT,
  completedBy TEXT
);
