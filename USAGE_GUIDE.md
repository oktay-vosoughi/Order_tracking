# Laboratory Warehouse Management System - Usage Guide

## 🔧 Fixed Issues

### ✅ Issue 1: Opening Date (Açılış Tarihi) Logic - FIXED

**Previous Behavior:** Opening date was set when item was added to inventory

**New Behavior:** 
- Opening date is **automatically set** when an item is first distributed/used
- When you distribute an item for the first time, the system sets `openingDate` to the distribution date
- This reflects the real-world scenario: items are "opened" when they're taken from storage for use

**Workflow:**
1. Receive item → No opening date yet
2. First distribution → Opening date automatically set to today
3. Subsequent distributions → Opening date remains unchanged (shows when it was first opened)

---

## 📦 How the Waste Management (Atık) System Works

### Creating a Waste Record

**Step-by-Step:**

1. **Navigate to Stock Tab**
   - Find the item you want to dispose of

2. **Click "Atık" Button** on the item row
   - A waste form modal will appear

3. **Fill in Waste Details:**
   - **Atık Miktarı (Waste Quantity):** Amount to dispose (cannot exceed current stock)
   - **Atık Tipi (Waste Type):** Select from:
     - 🔴 **Miadı Dolmuş** (Expired) - For items past expiry date
     - ⚠️ **Kontamine** (Contaminated) - For contaminated chemicals
     - 💔 **Hasarlı** (Damaged) - For damaged items
     - 🔙 **Geri Çağrılmış** (Recalled) - For recalled products
   - **Sebep (Reason):** Why the item is being disposed
   - **Bertaraf Yöntemi (Disposal Method):** How it will be disposed (e.g., "Kimyasal atık bertaraf firması")
   - **Sertifika No (Certification Number):** Disposal certification number

4. **Click "Atık Kaydı Oluştur"**
   - System automatically:
     - ✅ Creates waste record
     - ✅ Reduces stock by waste quantity
     - ✅ Updates item status if stock falls below minimum
     - ✅ Records who disposed it and when
     - ✅ Marks item with waste status if expired

### Viewing Waste Records

**Option 1: Atık Tab**
- Click the **"Atık"** tab in the navigation
- Shows all waste records with:
  - Waste ID
  - Item code and name
  - Quantity disposed
  - Waste type
  - Disposal date
  - Who disposed it

**Option 2: Excel Export**
- Click **"Dışa Aktar"** (Export) button
- Excel file includes **"Atık Kayıtları"** sheet with complete waste history

### Waste Record Details

Each waste record includes:
```
- Waste ID (WASTE-timestamp)
- Item ID, Code, Name
- Quantity disposed
- Waste Type (Expired/Contaminated/Damaged/Recalled)
- Reason for disposal
- Disposal method
- Disposed by (username)
- Disposal date (timestamp)
- Certification number
```

---

## 📋 Complete Workflow Examples

### Example 1: Receiving and Using a Chemical

1. **Purchase Request**
   - Create purchase request for "HCl 1L"
   - Approver approves
   - Admin orders from supplier

2. **Receiving**
   - Item arrives
   - Click "Teslim Al" (Receive)
   - Enter: Quantity, Lot No, **Expiry Date**, Invoice No
   - Stock increases

3. **First Use (Distribution)**
   - Researcher needs HCl
   - Click "Dağıt" (Distribute)
   - Enter: Quantity, Received By, Purpose
   - **System automatically sets Opening Date** ✅
   - Stock decreases

4. **Subsequent Uses**
   - More distributions occur
   - Opening date remains the same (shows when first opened)

5. **Expiry Monitoring**
   - System shows color-coded expiry warnings
   - FEFO mode sorts by expiry date
   - Expiry alert dashboard shows items approaching expiry

6. **Disposal (if expired)**
   - Click "Atık" button
   - Select "Miadı Dolmuş" (Expired)
   - Enter disposal details
   - Stock reduced, waste record created

### Example 2: Handling Contaminated Chemical

1. **Contamination Detected**
   - Lab discovers chemical is contaminated
   - Item still in stock but unusable

2. **Create Waste Record**
   - Find item in stock list
   - Click "Atık" button
   - Select **"Kontamine"** as waste type
   - Enter reason: "Bulaşma tespit edildi"
   - Enter disposal method: "Kimyasal atık firması - ABC Ltd"
   - Enter certification number if available

3. **Result**
   - Stock automatically reduced
   - Waste record created with full audit trail
   - Can be tracked in Atık tab and Excel export

---

## 🎨 Visual Indicators

### Expiry Status Colors

- 🔴 **Red (Pulsing):** Expired or ≤7 days remaining (CRITICAL)
- 🟠 **Orange:** ≤30 days remaining (WARNING)
- 🟡 **Yellow:** ≤90 days remaining (ATTENTION)
- 🟢 **Green:** >90 days remaining (GOOD)
- ⚪ **Gray:** No expiry date set

### Chemical Type Icons

- 🔥 **Flame:** Flammable chemicals
- 💧 **Droplet:** Storage location indicator
- ⚠️ **Warning:** Incompatible chemical warning
- 📄 **Document:** MSDS/SDS link available

---

## 🔍 Finding Items

### Search
- Type in search box to find by:
  - Item name
  - Item code
  - Any text in the item

### Filters (Stock Tab)
- **Tümü:** All items
- **Stokta:** Items with sufficient stock
- **Satın Al:** Items below minimum stock

### FEFO Mode
- Toggle **"FEFO"** button
- Items automatically sorted by expiry date (earliest first)
- Best for prioritizing items that will expire soon

---

## 📊 Reports and Export

### Expiry Alert Report (SKT Uyarı Raporu)

**Access:**
- Red pulsing button appears when critical items exist
- Click **"SKT Uyarı"** or **"SKT Raporu"** button

**Shows:**
- Summary statistics (Expired, Critical, Warning, Attention)
- Detailed tables for each category
- Item code, name, stock, expiry date, remaining days, location

### Excel Export

**Click "Dışa Aktar" to get 6 sheets:**

1. **Stok Takip** - Complete inventory with all laboratory fields
2. **Satın Alma Talepleri** - Purchase requests and orders
3. **Dağıtım Kayıtları** - Distribution history
4. **Teslim Kayıtları** - Receipt details with lot and expiry
5. **Atık Kayıtları** - Waste disposal records ✅
6. **SKT Uyarı Raporu** - Expiring items report ✅

---

## ⚠️ Important Safety Features

### Chemical Compatibility Warnings

When adding a new chemical:
- System checks existing items in the same storage location
- Warns if incompatible chemicals are stored together
- Example: "⚠️ UYARI: Asit ve Baz birlikte saklanamaz!"
- You can proceed with confirmation or cancel

**Incompatible Pairs:**
- Acid ↔ Base
- Oxidizer ↔ Flammable
- Oxidizer ↔ Reactive
- Acid ↔ Reactive

### MSDS/SDS Access

- Add MSDS URL when creating items
- Click MSDS link to view safety data sheet
- Opens in new tab for easy reference

---

## 👥 User Roles

### REQUESTER
- Create purchase requests
- View stock
- Create distributions
- View reports

### APPROVER
- All REQUESTER permissions
- Approve/reject purchase requests
- Create waste records

### ADMIN
- All permissions
- Create orders
- Receive items
- Manage users
- Delete items

---

## 🎯 Best Practices

### Daily Operations
1. ✅ Check expiry alert button daily
2. ✅ Use FEFO mode when distributing items
3. ✅ Record opening dates (automatic on first distribution)
4. ✅ Update waste records immediately when disposing items

### Weekly Tasks
1. ✅ Review items approaching expiry (≤30 days)
2. ✅ Check minimum stock levels
3. ✅ Verify MSDS links are accessible

### Monthly Tasks
1. ✅ Export full Excel report for records
2. ✅ Review waste disposal records
3. ✅ Audit chemical storage compatibility
4. ✅ Generate expiry alert report for management

---

## 🆘 Troubleshooting

### "Opening date not set automatically"
- Opening date is only set on **first distribution**
- If item was distributed before the update, manually add opening date in edit form

### "Cannot create waste record"
- Check that waste quantity doesn't exceed current stock
- Ensure you have APPROVER or ADMIN role

### "Chemical compatibility warning"
- Review storage locations
- Separate incompatible chemicals
- Update storage location if needed

### "Expiry alert not showing"
- Ensure expiry date is set in item details
- Check that expiry date is in correct format (YYYY-MM-DD)
- Refresh the page

---

## 📞 Support

For issues or questions:
1. Check this guide first
2. Review LABORATORY_FEATURES.md for technical details
3. Contact system administrator

---

**Last Updated:** January 5, 2026
**Version:** 2.0 (with Opening Date Fix and Waste Management)
