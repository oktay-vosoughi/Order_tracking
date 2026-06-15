# Excel Import Guide - LOT-Based Inventory System

## 📋 Excel Format Requirements

### Required Columns (Minimum)
| Column Name | Turkish | Example | Notes |
|-------------|----------|---------|-------|
| Malzeme Kodu | Malzeme Kodu | PCR-001 | **Required** - Unique item code |
| Malzeme Adı | Malzeme Adı | PCR Master Mix | **Required** - Item name |

### Optional Columns (Recommended)
| Column Name | Turkish | Example | Notes |
|-------------|----------|---------|-------|
| Kategori | Kategori | Reagent | Item category |
| Departman | Departman | Molecular Micro | Department (from DEPARTMENTS list) |
| Birim | Birim | kutu | Unit (adet, ml, gr, etc.) |
| Min Stok | Min Stok | 5 | Minimum stock level |
| Mevcut Stok | Mevcut Stok | 10 | Current stock quantity |
| Lot No | Lot No | LOT-2024-001 | LOT/Parti number |
| Son Kullanma | Son Kullanma | 2025-12-31 | Expiry date (YYYY-MM-DD) |
| Marka | Marka | Thermo Fisher | Brand |
| Tedarikçi | Tedarikçi | Thermo Fisher | Supplier |
| Katalog No | Katalog No | AB-12345 | Catalog number |
| Konum | Konum | Ana Depo | Location |
| Buzdolabı/Dolap | Buzdolabı/Dolap | Dolap A-3 | Storage location |
| Saklama Sıcaklığı | Saklama Sıcaklığı | -20°C | Storage temperature |
| Kimyasal Tipi | Kimyasal Tipi | Nötr | Chemical type |

---

## 📦 Excel Templates

### Template 1: Basic Items (No Stock)
```
| Malzeme Kodu | Malzeme Adı | Kategori | Departman | Birim | Min Stok |
|--------------|-------------|----------|-----------|-------|----------|
| PCR-001      | PCR Master Mix | Reagent | Molecular Micro | kutu  | 5        |
| DNA-001      | DNA Extraction Kit | Kit | Molecular Genetic | kit   | 3        |
| PIP-001      | Pipet 10ml | Lab Cam | Genel    | adet  | 50       |
```

### Template 2: Items with Stock (Creates LOTs)
```
| Malzeme Kodu | Malzeme Adı | Departman | Birim | Min Stok | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-----------|-------|----------|-------------|--------|--------------|
| PCR-001      | PCR Master Mix | Molecular Micro | kutu  | 5        | 10          | LOT123 | 2025-12-31   |
| DNA-001      | DNA Extraction Kit | Molecular Genetic | kit   | 3        | 5           | DNA456 | 2025-06-30   |
| PIP-001      | Pipet 10ml | Genel    | adet  | 50       | 100         | PIP789 | 2026-12-31   |
```

### Template 3: Complete Item Details
```
| Malzeme Kodu | Malzeme Adı | Kategori | Departman | Birim | Min Stok | Mevcut Stok | Lot No | Son Kullanma | Marka | Tedarikçi | Katalog No | Konum | Buzdolabı/Dolap | Saklama Sıcaklığı |
|--------------|-------------|----------|-----------|-------|----------|-------------|--------|--------------|-------|-----------|------------|-------|------------------|------------------|
| PCR-001      | PCR Master Mix | Reagent | Molecular Micro | kutu  | 5        | 10          | LOT123 | 2025-12-31   | Thermo | Thermo Fisher | AB-12345 | Ana Depo | Dolap A-3 | -20°C |
| DNA-001      | DNA Extraction Kit | Kit | Molecular Genetic | kit   | 3        | 5           | DNA456 | 2025-06-30   | Qiagen | Qiagen | QIA-001 | Ana Depo | Dolap B-2 | 4°C |
```

---

## 🔄 How LOT Creation Works

### Case 1: Items with LOT Number
If you provide `Lot No` and `Mevcut Stok > 0`:
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Master Mix | 10          | LOT123 | 2025-12-31   |
```
**Result:** Creates LOT "LOT123" with 10 units

### Case 2: Items without LOT Number
If you provide `Mevcut Stok > 0` but no `Lot No`:
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No |
|--------------|-------------|-------------|--------|
| PCR-001      | PCR Master Mix | 10          |        |
```
**Result:** Creates auto-LOT "INITIAL-PCR-001-1642678400000" with 10 units

### Case 3: Multiple Receipts for Same Item
You can import the same item multiple times:
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Master Mix | 10          | LOT123 | 2025-12-31   |
| PCR-001      | PCR Master Mix | 15          | LOT456 | 2026-03-15   |
| PCR-001      | PCR Master Mix | 8           | LOT789 | 2025-06-30   |
```
**Result:** Item PCR-001 has 3 LOTs with total 33 units

---

## 📊 Multiple LOTs for Same Product

### Example Workflow

**Initial Import:**
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Master Mix | 10          | LOT-001 | 2025-12-31   |
```
**System State:**
- PCR-001: 10 units (LOT-001)

**Second Import (New Shipment):**
```
| Malzeme Kodu | Malzeme Adı | Mevcut Stok | Lot No | Son Kullanma |
|--------------|-------------|-------------|--------|--------------|
| PCR-001      | PCR Master Mix | 15          | LOT-002 | 2026-03-15   |
```
**System State:**
- PCR-001: 25 units total
  - LOT-001: 10 units (exp. 2025-12-31)
  - LOT-002: 15 units (exp. 2026-03-15)

**FEFO Consumption:**
- When you consume 5 units, system uses LOT-001 first (earliest expiry)
- Remaining: 20 units (5 from LOT-001, 15 from LOT-002)

---

## 📝 Column Details

### Date Formats
- **Son Kullanma (Expiry):** YYYY-MM-DD format required
  - ✅ `2025-12-31`
  - ✅ `2025-06-30`
  - ❌ `31/12/2025`
  - ❌ `31-12-2025`

### Department Values
Use exact values from the system:
- Molecular Micro
- Molecular Genetic
- Mikrobiyoloji
- Histoloji
- Genel
- Kalite Kontrol
- R&D
- etc.

### Units
Common units in the system:
- `adet` (pieces)
- `kutu` (box)
- `ml` (milliliters)
- `gr` (grams)
- `mg` (milligrams)
- `L` (liters)
- `kg` (kilograms)

---

## ⚠️ Important Notes

### 1. Duplicate Codes
- Each `Malzeme Kodu` must be unique
- If code exists, item will be updated, not duplicated

### 2. Stock Quantities
- `Mevcut Stok` creates initial LOTs only
- For ongoing stock management, use "Teslim Al" workflow

### 3. LOT Numbers
- LOT numbers must be unique per item
- Same LOT number can exist for different items
- Example: LOT-001 for PCR-001 and LOT-001 for DNA-001 is OK

### 4. Validation Rules
| Field | Required | Validation |
|-------|----------|------------|
| Malzeme Kodu | ✅ | Unique, not empty |
| Malzeme Adı | ✅ | Not empty |
| Mevcut Stok | ❌ | Must be ≥ 0 if provided |
| Min Stok | ❌ | Must be ≥ 0 if provided |
| Son Kullanma | ❌ | YYYY-MM-DD format if provided |

---

## 🚀 Step-by-Step Import Process

### 1. Prepare Excel File
1. Open Excel
2. Use column headers from the templates above
3. Fill in your data
4. Save as `.xlsx` or `.xls`

### 2. Import to System
1. Login to the system
2. Click "Excel Yükle" button
3. Select your file
4. Review import results

### 3. Verify Results
- Check "Stok" tab for items
- Check "LOT Stok Yönetimi" for LOT details
- Check "Genel Stok Görünümü" for analytics

---

## 🔍 Troubleshooting

### Common Errors

**"Excel dosyasında geçerli veri bulunamadı"**
- Check that you have at least "Malzeme Kodu" and "Malzeme Adı" columns
- Ensure headers match exactly (case-sensitive)

**"LOT numarası zorunludur"**
- This error occurs during "Teslim Al", not Excel import
- For Excel import, LOT numbers are optional

**"Duplicate code"**
- Check for duplicate `Malzeme Kodu` values
- Each code must be unique across all items

### Tips for Success
1. **Start small:** Import 5-10 items first
2. **Validate dates:** Use YYYY-MM-DD format
3. **Check departments:** Use exact department names
4. **Backup data:** Keep original Excel file
5. **Review results:** Check LOT Stok Yönetimi after import

---

## 📄 Sample Excel File Structure

Download the template from the system or create one like this:

```
Malzeme Kodu	Malzeme Adı	Kategori	Departman	Birim	Min Stok	Mevcut Stok	Lot No	Son Kullanma	Marka	Tedarikçi
PCR-001	PCR Master Mix	Reagent	Molecular Micro	kutu	5	10	LOT-001	2025-12-31	Thermo	Thermo Fisher
DNA-001	DNA Extraction Kit	Kit	Molecular Genetic	kit	3	5	DNA-001	2025-06-30	Qiagen	Qiagen
PIP-001	Pipet 10ml	Lab Cam	Genel	adet	50	100		PIP-001	2026-12-31	BrandX	SupplierY
```

This will create:
- 3 item definitions
- 3 LOTs with stock
- Complete inventory ready for use
