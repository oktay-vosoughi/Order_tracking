# ACTION TRACKING & EXCEL EXPORT SOLUTION

## Current Status Analysis

### ✅ Already Working
1. **LOT Creation:** `receivedDate` is set to `CURDATE()` when "Teslim Al" is clicked (line 1064)
2. **Database Tables:** All action tables exist:
   - `purchases` (Talep → Onayla → Sipariş Ver → Teslim Al)
   - `receipts` (Teslim Al details with LOT link)
   - `distributions` (Dağıt actions)
   - `usage_records` (Consumption tracking)
   - `waste_records` (Atık actions)

### ❌ Missing Features
1. **Excel Export:** No export functionality for action tabs
2. **Action History View:** Tabs exist but may not show complete data
3. **LOT Traceability:** Need to ensure all actions link to LOTs

## Solution Architecture

### 1. Excel Export Endpoints (Backend)
Add new API endpoints for each action type:
- `/api/export/purchases` → Satın Alma Talepleri
- `/api/export/distributions` → Dağıtım Kayıtları
- `/api/export/receipts` → Teslim Kayıtları
- `/api/export/waste` → Atık Kayıtları
- `/api/export/usage` → Kullanım Kayıtları (from usage_records)

### 2. Frontend Export Buttons
Add "Excel'e Aktar" button to each action tab with proper data formatting

### 3. Data Flow

#### Talep (Request)
```
User clicks "Talep" → 
POST /api/request-purchase → 
INSERT INTO purchases (status='TALEP_EDILDI', requestedBy, requestedAt) →
Export: GET /api/export/purchases?status=TALEP_EDILDI
```

#### Onayla (Approve)
```
User clicks "Onayla" → 
POST /api/approve-purchase → 
UPDATE purchases SET status='ONAYLANDI', approvedBy, approvedAt →
Export: GET /api/export/purchases?status=ONAYLANDI
```

#### Sipariş Ver (Order)
```
User clicks "Sipariş Ver" → 
POST /api/order-purchase → 
UPDATE purchases SET status='SIPARIS_VERILDI', orderedBy, orderedAt, supplierName, poNumber →
Export: GET /api/export/purchases?status=SIPARIS_VERILDI
```

#### Teslim Al (Receive)
```
User clicks "Teslim Al" → 
POST /api/receive-goods → 
INSERT INTO lots (receivedDate=CURDATE(), lotNumber, expiryDate from Excel) →
INSERT INTO receipts (receiptId, purchaseId, lotId, receivedAt, receivedBy, receivedQty, lotNo, expiryDate) →
UPDATE purchases SET status='TESLIM_ALINDI', receivedQtyTotal →
Export: GET /api/export/receipts
```

#### Dağıt (Distribute)
```
User clicks "Dağıt" → 
POST /api/distribute → 
INSERT INTO distributions (distributedBy, distributedDate, receivedBy, quantity, lotId, lotNumber) →
INSERT INTO distribution_lots (track which LOTs used) →
UPDATE lots SET currentQuantity = currentQuantity - quantity →
Export: GET /api/export/distributions
```

### 4. Excel Export Format

#### Satın Alma Talepleri Export
```
Talep No | Malzeme Kodu | Malzeme Adı | Miktar | Talep Eden | Talep Tarihi | Durum | Onaylayan | Onay Tarihi | Sipariş Veren | Sipariş Tarihi | Tedarikçi | PO No
```

#### Teslim Kayıtları Export
```
Teslim No | Talep No | Malzeme Kodu | Malzeme Adı | LOT No | Miktar | Teslim Alan | Teslim Tarihi | SKT | Fatura No
```

#### Dağıtım Kayıtları Export
```
Dağıtım No | Malzeme Kodu | Malzeme Adı | LOT No | Miktar | Dağıtan | Dağıtım Tarihi | Teslim Alan | Departman | Amaç
```

#### Atık Kayıtları Export
```
Atık No | Malzeme Kodu | Malzeme Adı | LOT No | Miktar | Atık Tipi | Sebep | İmha Yöntemi | Kaydeden | Kayıt Tarihi
```

## Implementation Steps

### Step 1: Add Excel Export API Endpoints (Backend)
File: `server/index.js`

### Step 2: Add Export Buttons to Frontend
File: `src/App.jsx` - Add buttons to each action tab

### Step 3: Test Complete Workflow
1. Talep → Onayla → Sipariş Ver → Teslim Al → Dağıt
2. Export each step to Excel
3. Verify all data is captured

## Database Schema Verification

### purchases table ✅
- Tracks: Talep → Onayla → Sipariş Ver → Teslim Al
- Fields: requestedBy, requestedAt, approvedBy, approvedAt, orderedBy, orderedAt, receivedQtyTotal
- Status flow: TALEP_EDILDI → ONAYLANDI → SIPARIS_VERILDI → TESLIM_ALINDI

### receipts table ✅
- Links: purchaseId → lotId
- Fields: receivedAt, receivedBy, receivedQty, lotNo, expiryDate, invoiceNo, attachmentUrl

### distributions table ✅
- Links: itemId, lotId
- Fields: distributedBy, distributedDate, receivedBy, quantity, department, purpose

### lots table ✅
- Fields: receivedDate (set on Teslim Al), expiryDate (from Excel Son Kullanma), lotNumber, currentQuantity

## Expected Behavior After Implementation

1. **Talep Tab:** Shows all purchase requests with status, export to Excel
2. **Teslim Kayıtları Tab:** Shows all received goods with LOT details, export to Excel
3. **Dağıtım Kayıtları Tab:** Shows all distributions with LOT traceability, export to Excel
4. **Atık Kayıtları Tab:** Shows all waste records, export to Excel
5. **Each action properly updates database and is exportable**
