# 🔍 ROOT CAUSE ANALYSIS - Production Issues

## Date: 2026-01-21
## System: LIMS "Laboratuvar Malzeme Takip Sistemi"

---

## 📊 OBSERVED ISSUES (From Screenshots)

### Issue 1: SKT Date Corruption
**Evidence from Screenshot 1 (Excel):**
- Row 2: SKT shows `2025-06-30` (correct format)
- Row 3: SKT shows `2025-06-30` (correct format)
- Row 7: SKT shows `18102737` (Excel serial number - NOT converted)
- Row 8: SKT shows `18103837` (Excel serial number - NOT converted)

**Evidence from Screenshot 2 (UI):**
- PCR-001 shows "31.12.2025" (correct)
- PCR-001 shows "15.03.2026" (correct)
- 501R-10-01 shows "01.01.46218" (WRONG - year 46218!)
- 501R-10-01 shows "01.01.46371" (WRONG - year 46371!)
- 360002 shows "01.01.47362" (WRONG - year 47362!)
- 937236 shows "01.01.46502" (WRONG - year 46502!)

**Root Cause:** Excel serial numbers (e.g., 18102737) are being treated as strings and parsed as dates incorrectly.

### Issue 2: Duplicate Materials
**Evidence from Screenshot 2:**
- PCR-001 appears 3 times as separate rows
- 501R-10-01 appears 2 times
- 937236 appears 3 times
- 4336917 appears 3 times

**Root Cause:** Each Excel row (LOT) is being displayed as a separate material instead of aggregating by material code.

### Issue 3: LOT Stok Yönetimi Empty
**Evidence:** Tab shows "Henüz malzeme tanımı eklenmemiş"

**Root Cause:** LOT tab queries `item_definitions` table, but Excel import may be creating items in old `items` table only.

---

## 🔎 CODE ANALYSIS

### A) Excel Upload Flow (Frontend)

**File:** `src/App.jsx` lines 769-868

```javascript
const handleExcelUpload = async (event) => {
  // Line 799: RAW VALUE EXTRACTION - NO DATE PARSING!
  const expiryDate = row['Son Kullanma'] || row['SKT'] || row['Expiry Date'] || '';
  
  // Line 824: Directly assigned without conversion
  expiryDate: expiryDate,
  
  // Line 849: Sent to backend AS-IS
  const importResult = await importItems(allImportedItems);
}
```

**Problem:** `expiryDate` is extracted as raw value from Excel (could be string, number, or Date object) and sent to backend without normalization.

### B) Backend Import (API)

**File:** `server/index.js` lines 1356-1431

```javascript
app.post('/api/import-items', authRequired, async (req, res) => {
  for (const item of items) {
    // Line 1373: Check if item exists by CODE only
    const existing = await all(conn, 'SELECT * FROM item_definitions WHERE code = ?', [item.code]);
    
    if (existing.length) {
      // UPDATE existing - but this doesn't prevent duplicates if code differs slightly
      itemId = existing[0].id;
    } else {
      // CREATE new - this creates duplicate if same item imported multiple times
      itemId = generateId();
    }
    
    // Line 1417: expiryDate inserted WITHOUT PARSING
    INSERT INTO lots (id, itemId, lotNumber, expiryDate, ...)
    VALUES (?, ?, ?, ?, ...) // item.expiryDate goes directly to DB
  }
}
```

**Problems:**
1. No date parsing/validation - Excel serial numbers go directly to MySQL DATE column
2. Each row creates a separate item if code doesn't match exactly
3. No aggregation logic for displaying totals

### C) Stock Display (Frontend)

**File:** `src/App.jsx` - Stock tab displays `items` array directly

```javascript
{filteredItems.map(item => (
  <tr key={item.id}>
    <td>{item.code}</td>
    <td>{item.name}</td>
    <td>{item.currentStock}</td> // Shows individual row stock, not total
  </tr>
))}
```

**Problem:** Displays each imported row as separate item, no aggregation by code.

---

## 🎯 ROOT CAUSES IDENTIFIED

### 1. DATE PARSING FAILURE
**Location:** Frontend `App.jsx:799` + Backend `index.js:1417`

Excel stores dates as serial numbers (days since 1900-01-01):
- `18102737` = Excel serial for a date in ~49600 AD (invalid!)
- When MySQL receives string "18102737", it tries to parse as "18102737-01-01" → year 18102737
- When displayed, JavaScript Date shows "01.01.46218" (truncated/wrapped year)

**Fix Required:** 
- Detect Excel serial numbers (typeof === 'number' && value > 1000)
- Convert using Excel epoch: `new Date((serial - 25569) * 86400 * 1000)`
- Validate range (2000-2100)
- Format as YYYY-MM-DD for MySQL

### 2. NO MATERIAL MASTER AGGREGATION
**Location:** Frontend display logic + Backend import logic

Current flow:
1. Excel row 1: PCR-001, LOT-001, 10 units → Creates item ID "abc123"
2. Excel row 2: PCR-001, LOT-002, 15 units → Creates item ID "def456" (NEW ITEM!)
3. UI displays both as separate materials

**Fix Required:**
- Backend: UPSERT material by code (one material master)
- Backend: Create separate LOT records under same material
- Frontend: Query aggregated stock from `v_item_stock_summary` view or aggregate in code
- Frontend: Display ONE row per material with total stock

### 3. LOT TAB DATA SOURCE MISMATCH
**Location:** LOT Inventory component queries wrong table

**Fix Required:**
- Verify LOT tab queries `item_definitions` + `lots` tables
- Ensure Excel import creates records in `item_definitions` (not just old `items` table)

---

## 📋 EXECUTION PLAN

### Phase 1: Fix Date Parsing (CRITICAL)
1. Create `parseSKTDate()` utility function
2. Handle Excel serial numbers, dd.MM.yyyy strings, yyyy-MM-dd strings
3. Validate date range
4. Apply in frontend before sending to backend

### Phase 2: Fix Duplicate Materials
1. Backend: Modify import to UPSERT material by code
2. Backend: Create LOTs under single material
3. Frontend: Aggregate stock by material code for display
4. Frontend: Add expandable LOT details per material

### Phase 3: Fix LOT Tab
1. Verify data source
2. Ensure import creates `item_definitions` records
3. Test LOT tab displays correctly

### Phase 4: Testing
1. Import sample Excel with known dates
2. Verify dates display correctly
3. Verify materials aggregate correctly
4. Verify LOT tab shows data

---

## 🔧 FILES TO MODIFY

1. `src/utils/dateParser.js` (NEW) - Date parsing utility
2. `src/App.jsx` - Apply date parser in handleExcelUpload
3. `server/index.js` - Fix import-items endpoint logic
4. `src/App.jsx` - Aggregate stock display by material code
5. `src/LotInventory.jsx` - Verify data source

---

## 📊 SAMPLE DATA FOR TESTING

From Screenshot 1 Excel:
```
Row 7: 937236, QIAsymphony DSP DNA Mini Kit, 18102737 (serial)
Row 8: 937236, QIAsymphony DSP DNA Mini Kit, 18103837 (serial)
```

Expected after fix:
- Material: 937236 (ONE row)
- Total Stock: 6 units (3+3)
- LOT 1: 3 units, expires 2027-06-25
- LOT 2: 3 units, expires 2027-06-21

---

## ✅ ACCEPTANCE CRITERIA

1. Import Excel → SKT dates show correct years (2025-2027, not 46218)
2. Same material code → ONE row in stock list with aggregated total
3. LOT Stok Yönetimi → Shows materials with expandable LOT details
4. "Gün Kaldı" shows reasonable values (0-1000 days, not millions)
5. Status "SATIN AL" when total_stock < min_stock (aggregated across all LOTs)
