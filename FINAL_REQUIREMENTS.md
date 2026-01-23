# FINAL REQUIREMENTS - Clarified

## Excel Format
Your Excel file has multiple rows for the same material code, each representing a different LOT:

```
Row 2: PCR-001, PCR Master Mix, LOT-2024-001, Qty: 5,  SKT: 2025-12-31
Row 3: PCR-001, PCR Master Mix, LOT-2024-002, Qty: 15, SKT: 2025-06-15
Row 4: PCR-001, PCR Master Mix, LOT-2024-003, Qty: 8,  SKT: 2025-03-20
```

## Tab Behavior Requirements

### 1. "Stok" Tab (Main Stock View)
**Display:** ONE row per material code
**Quantity:** TOTAL of all LOTs

**Example:**
```
Kod      | Malzeme          | Stok  | SKT (earliest)
---------|------------------|-------|---------------
PCR-001  | PCR Master Mix   | 28    | 2025-03-20
360002   | Rezervuar Tek    | 2     | 2029-09-01
```

**Calculation:**
- PCR-001 total = 5 + 15 + 8 = **28**
- Shows earliest expiry date from all LOTs
- Click row → expands to show LOT breakdown

---

### 2. "LOT Stok Yönetimi" Tab
**Display:** ALL rows (one row per LOT)
**Quantity:** Individual LOT quantity

#### "Malzemeler" View (Current - Aggregated)
Shows same as "Stok" tab - ONE row per material with total

#### "LOT'lar" View (Detailed - Per LOT)
Shows ALL LOTs explicitly:

**Example:**
```
LOT No        | Malzeme          | Miktar | SKT        | Durum
--------------|------------------|--------|------------|-------
LOT-2024-001  | PCR Master Mix   | 5      | 2025-12-31 | Aktif
LOT-2024-002  | PCR Master Mix   | 15     | 2025-06-15 | Aktif
LOT-2024-003  | PCR Master Mix   | 8      | 2025-03-20 | Aktif
1019246B01    | Rezervuar Tek    | 2      | 2029-09-01 | Aktif
```

**This view shows:**
- ✅ Each LOT as separate row
- ✅ Explicit LOT number
- ✅ Individual quantity per LOT
- ✅ Individual SKT per LOT
- ✅ Status per LOT

---

## Excel Template
**Updated:** Template now matches Stok format exactly
- Each row = one LOT
- Columns: Malzeme Kodu, Malzeme Adı, Lot No, Mevcut Stok, Son Kullanma, etc.
- Multiple rows with same code = multiple LOTs

**Download:** Click "Şablon İndir" in LOT Stok Yönetimi tab

---

## Implementation Status

### ✅ Completed
1. **"Stok" tab** - Shows ONE row per material with TOTAL quantity
2. **"LOT Stok Yönetimi > LOT'lar"** - Shows ALL lots (one row per LOT)
3. **Excel template** - Updated to match Stok format
4. **Expandable rows** - Click material in Stok tab to see LOT breakdown
5. **Date handling** - ISO format (YYYY-MM-DD) validated
6. **Unified data source** - Both tabs use same database

### Current Behavior
- **Import Excel:** Creates one material master per code + multiple LOTs
- **"Stok" tab:** Displays aggregated view (1 row per material)
- **"LOT Stok Yönetimi > Malzemeler":** Same as Stok (aggregated)
- **"LOT Stok Yönetimi > LOT'lar":** Detailed view (1 row per LOT)

---

## Testing with Your Excel

### Step 1: Upload Your Excel
1. Go to "Stok" tab
2. Click "Excel Yükle"
3. Select your file with multiple PCR-001 rows

### Step 2: Verify "Stok" Tab
**Expected:**
- ✅ ONE row for PCR-001
- ✅ Total quantity = sum of all LOTs (5+15+8=28)
- ✅ Earliest SKT shown (2025-03-20)
- ✅ Click row → expands showing 3 LOTs

### Step 3: Verify "LOT Stok Yönetimi > LOT'lar"
**Expected:**
- ✅ THREE rows for PCR-001
- ✅ Each row shows explicit LOT number
- ✅ Each row shows individual quantity (5, 15, 8)
- ✅ Each row shows individual SKT

---

## Summary

**"Stok" = Aggregated View (Management)**
- One row per material
- Total quantity across all LOTs
- Quick overview for stock management

**"LOT Stok Yönetimi > LOT'lar" = Detailed View (Operations)**
- One row per LOT
- Individual quantities per LOT
- Detailed tracking for FEFO and traceability

Both tabs use the same underlying database - no data divergence.
