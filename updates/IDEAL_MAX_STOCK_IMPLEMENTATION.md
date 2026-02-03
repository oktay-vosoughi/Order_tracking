# Ideal and Max Stock Implementation Guide

## Overview
This document describes the implementation of `ideal_stock` and `max_stock` fields for inventory management.

## Database Changes

### Migration File
**Location**: `server/migrations/add_ideal_max_stock.sql`

**What it does**:
- Adds `ideal_stock DECIMAL(10,2) NULL` column to `item_definitions` table
- Adds `max_stock DECIMAL(10,2) NULL` column to `item_definitions` table
- Creates indexes for performance optimization
- Backward compatible - existing rows will have NULL values

### Running the Migration

```bash
# Navigate to server directory
cd server

# Run the migration
node run-migration.js add_ideal_max_stock.sql
```

**Expected output**:
```
Connected to database...
Running migration: add_ideal_max_stock.sql...
Executed X statements successfully
✅ Migration completed successfully!
```

## Backend Changes

### Files Modified
**File**: `server/index.js`

#### POST /api/item-definitions
- **Line ~552**: Added `ideal_stock, max_stock` to request body destructuring
- **Line ~560**: Added columns to INSERT statement
- **Line ~562**: Added values to parameter array (defaults to NULL if not provided)

#### PUT /api/item-definitions/:id
- **Line ~577**: Added `ideal_stock, max_stock` to request body destructuring
- **Line ~588-589**: Added columns to UPDATE statement with COALESCE
- **Line ~601**: Added values to parameter array

**Behavior**:
- Both fields are optional
- Accept numeric values (will be stored as DECIMAL(10,2))
- Return NULL if not provided
- Existing API clients remain compatible

## Frontend Changes

### Files Modified
**File**: `src/LotInventory.jsx`

#### Table Header (Line ~330)
Added two new column headers between "Min" and "LOT":
- `İdeal` - Ideal stock level
- `Maks` - Maximum stock level

#### Table Data Rows (Lines ~344-345)
Added two new data cells displaying:
- `item.ideal_stock` formatted to 2 decimals, or "—" if NULL
- `item.max_stock` formatted to 2 decimals, or "—" if NULL

#### Expanded Row (Line ~357)
Updated `colSpan` from 9 to 11 to accommodate new columns

**Display Logic**:
```javascript
{item.ideal_stock != null ? Number(item.ideal_stock).toFixed(2) : '—'}
{item.max_stock != null ? Number(item.max_stock).toFixed(2) : '—'}
```

## Testing Checklist

### 1. Database Migration
- [ ] Run migration script successfully
- [ ] Verify columns exist: `DESCRIBE item_definitions;`
- [ ] Check indexes created: `SHOW INDEX FROM item_definitions;`

### 2. Backend API Testing

#### Create Item with Stock Levels
```bash
curl -X POST http://localhost:4000/api/item-definitions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST-001",
    "name": "Test Item",
    "minStock": 10,
    "ideal_stock": 50,
    "max_stock": 100
  }'
```

**Expected**: Item created with all stock levels

#### Create Item without Stock Levels
```bash
curl -X POST http://localhost:4000/api/item-definitions \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "TEST-002",
    "name": "Test Item 2",
    "minStock": 5
  }'
```

**Expected**: Item created with ideal_stock and max_stock as NULL

#### Update Item Stock Levels
```bash
curl -X PUT http://localhost:4000/api/item-definitions/ITEM_ID \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "ideal_stock": 75,
    "max_stock": 150
  }'
```

**Expected**: Item updated with new stock levels

### 3. Frontend Testing

#### Visual Verification
- [ ] Navigate to "LOT Stok Yönetimi" page
- [ ] Verify table shows columns in order: Kod, Malzeme Adı, Kategori, Departman, Birim, Toplam Stok, Min, **İdeal**, **Maks**, LOT, İşlem
- [ ] Items with ideal_stock/max_stock show formatted numbers (e.g., "50.00")
- [ ] Items without ideal_stock/max_stock show "—"
- [ ] Table alignment is correct
- [ ] Expanded LOT details still work (colSpan 11)

#### Create New Item via UI
- [ ] Click "Yeni Malzeme" button
- [ ] Fill in basic fields (code, name, etc.)
- [ ] Leave ideal/max stock empty
- [ ] Submit and verify item appears with "—" in İdeal/Maks columns

### 4. Data Validation

#### Check Database
```sql
SELECT code, name, minStock, ideal_stock, max_stock 
FROM item_definitions 
LIMIT 10;
```

**Expected**: See mix of NULL and numeric values

#### Check API Response
```bash
curl http://localhost:4000/api/item-definitions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**Expected**: JSON includes `ideal_stock` and `max_stock` fields

## Edge Cases Handled

1. **NULL values**: Display as "—" instead of "null" or "0"
2. **Decimal precision**: Always show 2 decimal places (e.g., 50.00)
3. **Backward compatibility**: Existing items without these fields work fine
4. **Optional fields**: API doesn't require these fields on create/update
5. **Column alignment**: Table remains properly aligned with new columns

## Notes

- These columns are **ONLY** displayed in the LotInventory.jsx items table
- They are **NOT** shown in:
  - Stock detail pages
  - Distribution pages
  - Purchase request pages
  - Other inventory views
- The implementation follows the same pattern as the existing `minStock` field
- No validation is enforced (e.g., ideal > min, max > ideal) - this is intentional for flexibility

## Rollback (if needed)

If you need to remove these columns:

```sql
USE `order_Tracking`;
ALTER TABLE `item_definitions` DROP INDEX `idx_item_ideal_stock`;
ALTER TABLE `item_definitions` DROP INDEX `idx_item_max_stock`;
ALTER TABLE `item_definitions` DROP COLUMN `ideal_stock`;
ALTER TABLE `item_definitions` DROP COLUMN `max_stock`;
```

Then revert the code changes in `server/index.js` and `src/LotInventory.jsx`.
