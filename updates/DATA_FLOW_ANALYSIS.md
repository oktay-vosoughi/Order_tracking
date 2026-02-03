# DATA FLOW ANALYSIS - Current State

## A) CURRENT DATA FLOW COMPARISON

### 1. "Stok" Tab (Main Stock List)
**Location:** `src/App.jsx` lines 1498-1600
**Data Source:** Local state `items` array (from localStorage)
**API:** None - uses legacy localStorage data
**Display Logic:**
- Lines 730-753: Aggregates items by code (recent fix)
- Shows ONE row per material code
- Total stock = sum of currentStock across duplicate codes
- Problem: **NOT using LOT system data**

### 2. "LOT Stok Yönetimi" Tab
**Location:** `src/LotInventory.jsx`
**Data Source:** Two separate API calls
- `/api/item-definitions` (line 61) → Material master list
- `/api/lots` (line 61) → LOT records
**Display Logic:**
- "Malzemeler" view: Shows `itemDefinitions` with aggregated `totalStock` from DB
- "LOT'lar" view: Shows `lots` table directly
- Expandable rows: Fetches lots per material (lines 255-256)

### 3. Excel Import
**Location:** `src/App.jsx` lines 770-931
**Current Behavior:**
- Parses Excel → Creates items array
- Calls `/api/import-items` (line 883)
- **ALSO** saves to localStorage `items` array (line 896)
- Problem: **Dual write - creates divergence**

### 4. Backend Endpoints

#### `/api/item-definitions` (server/index.js:457)
```sql
SELECT 
  id.*, 
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
  COUNT(CASE WHEN l.status = 'ACTIVE' THEN l.id END) AS activeLotCount
FROM item_definitions id
LEFT JOIN lots l ON id.id = l.itemId
GROUP BY id.id
```
**Returns:** Material master with aggregated stock

#### `/api/lots` (server/index.js:571)
```sql
SELECT l.*, id.name AS itemName, id.code AS itemCode, id.unit AS itemUnit
FROM lots l
JOIN item_definitions id ON l.itemId = id.id
```
**Returns:** All LOT records with item info

#### `/api/unified-stock` (server/index.js:936)
```sql
SELECT 
  id.*,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND (l.expiryDate IS NULL OR l.expiryDate >= CURDATE()) THEN l.currentQuantity ELSE 0 END), 0) AS totalStock,
  MIN(CASE WHEN l.status = 'ACTIVE' AND l.currentQuantity > 0 THEN l.expiryDate END) AS earliestExpiry,
  ...
FROM item_definitions id
LEFT JOIN lots l ON id.id = l.itemId
GROUP BY id.id
```
**Returns:** Enhanced material list with FEFO-aware stock

#### `/api/import-items` (server/index.js:1356)
**Behavior:**
- Groups items by code (lines 1371-1383)
- UPSERT material master (one per code)
- Creates LOT records (lines 1425-1474)
- Validates dates (lines 1430-1444)

---

## B) ROOT CAUSE: DATA SOURCE DIVERGENCE

### Problem 1: "Stok" uses localStorage, "LOT Stok Yönetimi" uses DB
```
Excel Import
    ↓
    ├─→ /api/import-items → item_definitions + lots (DB)
    └─→ localStorage.items (legacy array)

"Stok" Tab reads localStorage.items ❌
"LOT Stok Yönetimi" reads /api/item-definitions ✅
```

**Result:** Two different datasets!

### Problem 2: Date Handling
**Current Implementation (src/utils/dateParser.js):**
- Handles Excel serial numbers
- Handles Turkish dd.MM.yyyy
- Handles ISO yyyy-MM-dd

**NEW FACT from user:** Excel already has ISO format (yyyy-MM-dd)
- No need for serial number conversion
- Just validate ISO format

### Problem 3: No Expandable Lots in "Stok" Tab
- "Stok" tab has no drill-down to LOT details
- "LOT Stok Yönetimi" has expandable rows (lines 317-326)
- Need to unify UX

---

## C) DATABASE SCHEMA (Verified)

### `item_definitions` (Material Master)
```sql
- id (PK)
- code (unique key)
- name
- category
- department
- unit
- minStock
- supplier, catalogNo, brand, storageLocation, storageTemp, chemicalType, msdsUrl
- status (default 'ACTIVE')
- createdBy, createdAt, updatedBy, updatedAt
```

### `lots` (Batch Records)
```sql
- id (PK)
- itemId (FK → item_definitions.id)
- purchaseId, receiptId (optional FK)
- lotNumber
- expiryDate (DATE, nullable)
- receivedDate (DATE)
- initialQuantity, currentQuantity
- manufacturer, catalogNo, invoiceNo
- department, location, storageLocation
- attachmentUrl, attachmentName
- status ('ACTIVE', 'DEPLETED', 'EXPIRED')
- notes
- createdBy, createdAt, updatedBy, updatedAt
```

**Constraints:**
- No unique constraint on (itemId, lotNumber, expiryDate) - **MISSING**
- No unique constraint on (code, department) - **MISSING**

---

## D) REQUIRED FIXES

### Fix 1: Unify "Stok" Data Source
**Change:** Make "Stok" tab use `/api/unified-stock` instead of localStorage
**Impact:** Both tabs will show same data from DB

### Fix 2: Simplify Date Handling
**Change:** Since input is already ISO, just validate format
**Remove:** Excel serial number conversion (not needed)

### Fix 3: Add Expandable Lots to "Stok" Tab
**Change:** Implement same expandable row pattern as LOT Stok Yönetimi
**API:** Use `/api/unified-stock/:itemId/lots` for drill-down

### Fix 4: Remove Dual Write
**Change:** Excel import should NOT save to localStorage
**Keep:** Only write to DB via `/api/import-items`

### Fix 5: Add DB Constraints
**Change:** Add unique constraints to prevent duplicates
```sql
ALTER TABLE item_definitions ADD UNIQUE KEY uk_code_dept (code, department);
ALTER TABLE lots ADD UNIQUE KEY uk_item_lot_skt (itemId, lotNumber, expiryDate);
```

---

## E) IMPLEMENTATION PLAN

### Step 1: Fix Date Normalization (ISO Only)
- Update `src/utils/dateParser.js` to focus on ISO validation
- Remove Excel serial logic (not needed per user)
- Add strict YYYY-MM-DD regex validation

### Step 2: Unify "Stok" Tab Data Source
- Remove localStorage dependency
- Use `/api/unified-stock` endpoint
- Add loading state and error handling

### Step 3: Implement Expandable Lots UI
- Add expandedItem state to App.jsx
- Fetch lots on expand using `/api/unified-stock/:itemId/lots`
- Display lot breakdown table (LOT No, SKT, Qty, Status)

### Step 4: Remove Dual Write from Import
- Remove localStorage save in handleExcelUpload
- Only use API response to update UI

### Step 5: Add DB Constraints (Optional Migration)
- Create migration SQL for unique constraints
- Handle existing duplicates

---

## F) ACCEPTANCE CRITERIA MAPPING

| Criterion | Current Status | Fix Required |
|-----------|---------------|--------------|
| ISO date "2025-06-30" displays correctly | ❌ Uses complex parser | Simplify to ISO-only |
| One row per material in "Stok" | ⚠️ Frontend aggregation only | Use DB aggregation |
| Click material → show lots | ❌ Not implemented | Add expandable rows |
| "LOT Stok Yönetimi" = "Stok" data | ❌ Different sources | Unify to `/api/unified-stock` |
| No dataset divergence | ❌ localStorage vs DB | Remove localStorage |

---

## G) FILES TO MODIFY

1. **`src/utils/dateParser.js`** - Simplify to ISO-only validation
2. **`src/App.jsx`** - Unify data source, add expandable lots
3. **`src/api.js`** - Ensure fetchUnifiedStock is used
4. **`server/index.js`** - Verify `/api/unified-stock` returns correct data
5. **`server/migrations/add_unique_constraints.sql`** (NEW) - Add DB constraints
