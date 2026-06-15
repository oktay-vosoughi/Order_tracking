# 🔄 Migration Guide - Existing Inventory with Multiple LOTs

## Your Scenario: Multiple LOTs per Item

You have existing items in stock, and each item may have different LOT numbers. This is the **correct approach** for the unified LOT system.

---

## 📊 Excel Format for Migration

### Format: One Row per LOT

**Important:** Each LOT gets its own row, even if it's the same item.

```
| Malzeme Kodu | Malzeme Adı | Departman | Birim | Min Stok | Mevcut Stok | Lot No | Son Kullanma | Marka | Tedarikçi |
|--------------|-------------|-----------|-------|----------|-------------|--------|--------------|-------|-----------|
| PCR-001      | PCR Master Mix | Molecular Micro | kutu  | 5        | 10          | LOT-2024-001 | 2025-12-31 | Thermo | Thermo Fisher |
| PCR-001      | PCR Master Mix | Molecular Micro | kutu  | 5        | 15          | LOT-2024-002 | 2026-03-15 | Thermo | Thermo Fisher |
| PCR-001      | PCR Master Mix | Molecular Micro | kutu  | 5        | 8           | LOT-2024-003 | 2025-06-30 | Thermo | Thermo Fisher |
| DNA-001      | DNA Extraction Kit | Molecular Genetic | kit   | 3        | 20          | DNA-LOT-001 | 2025-08-20 | Qiagen | Qiagen |
| DNA-001      | DNA Extraction Kit | Molecular Genetic | kit   | 3        | 12          | DNA-LOT-002 | 2025-11-15 | Qiagen | Qiagen |
```

**Result after import:**
- PCR-001: 3 LOTs, Total 33 units (10+15+8)
- DNA-001: 2 LOTs, Total 32 units (20+12)

---

## 🎯 Real-World Example

### Your Current Inventory:

**Item: PCR Master Mix (Code: PCR-001)**
- Shelf 1: 10 boxes, LOT-2024-001, expires 2025-12-31
- Shelf 2: 15 boxes, LOT-2024-002, expires 2026-03-15
- Freezer: 8 boxes, LOT-2024-003, expires 2025-06-30

**Item: DNA Extraction Kit (Code: DNA-001)**
- Cabinet A: 20 kits, DNA-LOT-001, expires 2025-08-20
- Cabinet B: 12 kits, DNA-LOT-002, expires 2025-11-15

### Excel Format:

```excel
Malzeme Kodu | Malzeme Adı          | Departman | Birim | Min Stok | Mevcut Stok | Lot No       | Son Kullanma | Konum    | Buzdolabı/Dolap
-------------|----------------------|-----------|-------|----------|-------------|--------------|--------------|----------|----------------
PCR-001      | PCR Master Mix       | Molecular Micro | kutu  | 5        | 10          | LOT-2024-001 | 2025-12-31   | Ana Depo | Raf 1
PCR-001      | PCR Master Mix       | Molecular Micro | kutu  | 5        | 15          | LOT-2024-002 | 2026-03-15   | Ana Depo | Raf 2
PCR-001      | PCR Master Mix       | Molecular Micro | kutu  | 5        | 8           | LOT-2024-003 | 2025-06-30   | Ana Depo | Freezer
DNA-001      | DNA Extraction Kit   | Molecular Genetic | kit   | 3        | 20          | DNA-LOT-001  | 2025-08-20   | Ana Depo | Dolap A
DNA-001      | DNA Extraction Kit   | Molecular Genetic | kit   | 3        | 12          | DNA-LOT-002  | 2025-11-15   | Ana Depo | Dolap B
```

---

## 📋 Step-by-Step Migration Process

### Step 1: Prepare Your Excel File

1. **Open Excel** (or use the template: `Malzeme_Import_Sablonlari.xlsx`)
2. **Create columns** (minimum required):
   - Malzeme Kodu *(required)*
   - Malzeme Adı *(required)*
   - Mevcut Stok *(required for LOT creation)*
   - Lot No *(required if you have LOT numbers)*
   - Son Kullanma *(recommended)*

3. **Fill data - ONE ROW PER LOT:**
   ```
   Row 1: PCR-001, PCR Master Mix, 10, LOT-001, 2025-12-31
   Row 2: PCR-001, PCR Master Mix, 15, LOT-002, 2026-03-15
   Row 3: PCR-001, PCR Master Mix, 8,  LOT-003, 2025-06-30
   ```

### Step 2: Import to System

1. **Login** to http://localhost:3001
2. **Click "Excel Yükle"** button (top right)
3. **Select your Excel file**
4. **Wait for confirmation**

### Step 3: Verify Results

**Check "Stok" tab:**
- PCR-001 shows **total quantity** (33 units)
- Status automatically calculated

**Check "LOT Stok Yönetimi" tab:**
- Expand PCR-001
- See all 3 LOTs individually
- Each LOT shows quantity and expiry

**Check "Genel Stok Görünümü":**
- Analytics updated with LOT data
- Department distribution
- Expiry warnings

---

## ⚠️ Important Rules

### ✅ DO:
1. **One row per LOT** - Each LOT number gets its own row
2. **Repeat item info** - Same item code/name on multiple rows is OK
3. **Unique LOT numbers** - Each LOT number must be unique per item
4. **Include expiry dates** - Critical for FEFO logic

### ❌ DON'T:
1. **Don't combine LOTs** - Don't put "LOT-001, LOT-002" in one cell
2. **Don't sum quantities** - Don't put total quantity in one row
3. **Don't leave LOT empty** - If you have LOT numbers, include them

---

## 🔍 What If I Don't Have LOT Numbers?

### Option 1: Create LOT Numbers (Recommended)
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Kit     | 10          | SHELF-A-001 | 2025-12-31 |
| PCR-001      | PCR Kit     | 15          | SHELF-B-001 | 2026-03-15 |
```

### Option 2: Let System Auto-Generate
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Kit     | 10          |        | 2025-12-31   |
```
System creates: `INITIAL-PCR-001-[timestamp]`

**But if you have multiple batches, use Option 1!**

---

## 📊 Complete Migration Template

### Full Column List (All Optional Except First 2):

```
Malzeme Kodu          ← REQUIRED
Malzeme Adı           ← REQUIRED
Kategori              ← Optional (Reagent, Kit, Lab Cam, etc.)
Departman             ← Optional (Molecular Micro, Molecular Genetic, Genel, etc.)
Birim                 ← Optional (kutu, adet, ml, etc.)
Min Stok              ← Optional (minimum stock level)
Mevcut Stok           ← Required for LOT creation
Lot No                ← Required if you have LOT numbers
Son Kullanma          ← Recommended (YYYY-MM-DD format)
Açılış Tarihi         ← Optional (opening date)
Marka                 ← Optional (brand)
Tedarikçi             ← Optional (supplier)
Katalog No            ← Optional (catalog number)
Konum                 ← Optional (location)
Buzdolabı/Dolap       ← Optional (storage location)
Saklama Sıcaklığı     ← Optional (storage temperature)
Kimyasal Tipi         ← Optional (chemical type)
MSDS/SDS              ← Optional (MSDS URL)
```

---

## 💡 Example: Complete Migration

### Your Inventory Sheet:

```excel
Malzeme Kodu | Malzeme Adı | Kategori | Departman | Birim | Min Stok | Mevcut Stok | Lot No | Son Kullanma | Marka | Tedarikçi | Konum | Buzdolabı/Dolap
-------------|-------------|----------|-----------|-------|----------|-------------|--------|--------------|-------|-----------|-------|----------------
PCR-001      | PCR Master Mix | Reagent | Molecular Micro | kutu | 5 | 10 | LOT-2024-001 | 2025-12-31 | Thermo | Thermo Fisher | Ana Depo | Dolap A-3
PCR-001      | PCR Master Mix | Reagent | Molecular Micro | kutu | 5 | 15 | LOT-2024-002 | 2026-03-15 | Thermo | Thermo Fisher | Ana Depo | Dolap A-3
PCR-001      | PCR Master Mix | Reagent | Molecular Micro | kutu | 5 | 8  | LOT-2024-003 | 2025-06-30 | Thermo | Thermo Fisher | Ana Depo | Freezer B
DNA-001      | DNA Extraction Kit | Kit | Molecular Genetic | kit | 3 | 20 | DNA-LOT-001 | 2025-08-20 | Qiagen | Qiagen | Ana Depo | Dolap B-2
DNA-001      | DNA Extraction Kit | Kit | Molecular Genetic | kit | 3 | 12 | DNA-LOT-002 | 2025-11-15 | Qiagen | Qiagen | Ana Depo | Dolap B-2
PIP-001      | Pipet 10ml | Lab Cam | Genel | adet | 50 | 100 | PIP-2024-001 | 2026-12-31 | BrandX | SupplierY | Ana Depo | Raf C-1
```

### After Import:
- **3 items** created in system
- **6 LOTs** created
- **Total stock:** 165 units across all items
- **FEFO enabled:** System will consume earliest expiry first

---

## 🚀 Quick Checklist

Before importing:
- [ ] One row per LOT
- [ ] Each LOT has unique LOT number
- [ ] Expiry dates in YYYY-MM-DD format
- [ ] Min Stok set for each item
- [ ] Department names match system (Molecular Micro, Molecular Genetic, Genel, etc.)
- [ ] File saved as .xlsx or .xls

After importing:
- [ ] Check "Stok" tab - see total quantities
- [ ] Check "LOT Stok Yönetimi" - see individual LOTs
- [ ] Check "Genel Stok Görünümü" - see analytics
- [ ] Verify expiry dates are correct
- [ ] Test FEFO consumption

---

## 🎯 Your Next Steps

1. **Prepare your Excel** following the format above
2. **Save as .xlsx**
3. **Go to system** → Click "Excel Yükle"
4. **Import your file**
5. **Verify in LOT Stok Yönetimi tab**

**The system will automatically:**
- Create item definitions
- Create LOTs for each row
- Calculate total stock
- Set up FEFO consumption
- Generate analytics

**You're ready to migrate! 🚀**
