# Design: MG-F069 Malzeme Takip Listesi export + "ISO Formları" nav page

**Date:** 2026-07-16
**Author:** Oktay Vosoughi (with Claude)
**Status:** Approved — implementing

---

## 1. Problem

Medipol labs keep a controlled ISO **material tracking list** (`MG-F069 MALZEME
TAKİP LİSTESİ`) tracking each purchase through its whole lifecycle: request →
approval → receipt → depot dispatch → use → depletion. Today it is a hand-kept
multi-sheet Excel. We want the system to export that list, pre-filled from live
data, per department.

Separately, the existing LY-F064 export controls currently live in the **Stok**
top toolbar. As more ISO exports are added, they should move to a dedicated
place. The user asked for a new left-nav page **"ISO Formları"** collecting all
ISO form exports.

## 2. Goal / Definition of Done

- A new left-nav page **"ISO Formları"** (ADMIN + SATINAL_LOJISTIK only) with two
  cards, each a department picker + download button:
  - **LY-F064 – Malzeme Sayım Formu** (the existing export, moved here from the
    Stok toolbar; backend unchanged).
  - **MG-F069 – Malzeme Takip Listesi** (new), plus a **year** selector
    (default: current year).
- New endpoint `GET /api/mg-tracking-form?department=<name>&year=<yyyy>` streams a
  clean single-sheet `.xlsx` titled "MALZEME TAKİP LİSTESİ" with the 15 MG-F069
  columns, filled from live data, scoped to one department + year.
- The LY-F064 controls no longer appear in the Stok toolbar.
- No DB migration.

**Explicitly out of scope (YAGNI):** the CIHAZ-HIZMET (device/service) sheets,
the İhale (tender) sheet, the NOTLAR legend, multi-year-in-one-file, byte-faithful
reproduction of the original 8-sheet workbook, and scheduling/email.

## 3. Chosen approach

**Clean single-sheet workbook built with `exceljs`** (already a dependency).
Rejected byte-faithful template reproduction: the source is 8 sheets / multiple
years / 2600+ rows / embedded images, and the format is a plain table — a fresh
styled sheet is faithful enough for auditors and far more maintainable.

The "who" columns (Depoya Teslim Alan / Kullanım İçin Alan / Onay) output the
**stored username** of the recorded person (blank if none) — honest and
traceable, rather than inventing the hand-written initials the paper form used.

## 4. Backend

### 4.1 Endpoint
`GET /api/mg-tracking-form?department=<name>&year=<yyyy>`

- Middleware: `authRequired` + the existing `canExportIsoForm`
  (`requireRole([ADMIN, SATINAL_LOJISTIK])`).
- `department` required (400 if missing/blank); must be in the caller's
  accessible set (403 otherwise) — reuse `getUserDepartments`. Both allowed roles
  are bypass roles, so this is defensive.
- `year` optional integer; defaults to the current calendar year. Filters on
  `YEAR(requestedAt) = ?`.

### 4.2 Query
Follow real foreign keys (no lot-number text matching), so a reused lot number
can never over-match across purchases:

```
purchases p
LEFT JOIN lots l              ON l.purchaseId = p.id
LEFT JOIN distribution_lots dl ON dl.lotId = l.id
LEFT JOIN distributions d      ON d.id = dl.distributionId
WHERE p.department = ? AND YEAR(p.requestedAt) = ?
ORDER BY p.requestedAt, p.requestNumber, l.receivedDate, d.distributedDate
```

Result: **one row per distribution event**; a purchase with received-but-
undistributed lots yields one row per lot (blank L/M/N); a purchase with no
linked lot yields one row falling back to its own receipt fields. Each join is
to a primary/foreign key, so fan-out is exactly the legitimate one-row-per-
distribution — no ambiguity.

Receipt columns use `COALESCE(lot, purchase)` (see 4.3) so legacy lots that
predate the `lots.purchaseId` link still show the purchase's own recorded
receipt data instead of going blank.

### 4.3 Column mapping (MG-F069, title row 1, headers row 2, data row 3+)

| Col | Header | Source |
|-----|--------|--------|
| A | Talep Numarası | `purchases.requestNumber` |
| B | Malzeme Kodu | `purchases.itemCode` |
| C | Malzeme Tanımı | `purchases.itemName` |
| D | Talep Miktarı | `requestedQty` |
| E | Talep Tarihi | `requestedAt` (DD.MM.YYYY) |
| F | Geliş Tarihi | `receivedDate` (DD.MM.YYYY) |
| G | Gelen Miktar | `receivedQtyTotal` |
| H | Son Kullanma Tarihi | `expiryDate` (DD.MM.YYYY) |
| I | Lot No | `lotNo` |
| J | Dağıtımcı Firma | `supplierName` |
| K | Depoya Teslim Alan | `COALESCE(lots.createdBy, purchases.receivedBy)` (username) |
| L | Depodan Çıkış Tarihi | `distributions.distributedDate` (DD.MM.YYYY) |
| M | Kullanım İçin Alan | `distributions.receivedBy` (username) |
| N | Bittiği Tarih | `distributions.completedDate` (DD.MM.YYYY) |
| O | Onay | `purchases.approvedBy` (username) |

Columns F/G/H/I/K use `COALESCE(lot-level, purchase-level)`: F
`COALESCE(l.receivedDate, p.receivedDate)`, G `COALESCE(l.initialQuantity,
p.receivedQtyTotal)`, H `COALESCE(l.expiryDate, p.expiryDate)`, I
`COALESCE(l.lotNumber, p.lotNo)`.

### 4.4 Rendering
New module `server/mgTrackingForm.cjs`:
- `buildMgRows(records)` — pure: maps joined rows → 15-column arrays, formats
  dates `DD.MM.YYYY`, empty → `''`.
- `buildMgWorkbook({ department, year, rows })` — exceljs: title row (merged A–O,
  bold), header row (bold, bordered, grey fill), data rows (bordered), reasonable
  column widths; returns a Buffer.
- `formatDateTR` reused from `isoCountForm.cjs` (export/share it).

Response headers mirror LY-F064: spreadsheet MIME, `Content-Disposition` with an
ASCII `filename=` fallback + RFC 5987 `filename*` (Turkish-safe), filename
`Malzeme_Takip_MG-F069_<dept>_<year>.xlsx`.

## 5. Frontend

- `src/api.js`: `downloadMgTrackingForm(department, year)` — authenticated blob
  download (same shape as `downloadIsoCountForm`).
- `src/App.jsx`:
  - New nav button **"ISO Formları"** (`activeTab === 'iso_forms'`), rendered only
    for ADMIN / SATINAL_LOJISTIK, icon `FileText`.
  - New page section: two cards. LY-F064 card reuses the existing
    `isoFormDept` state + `handleIsoCountFormExport`. MG-F069 card adds
    `mgFormDept` + `mgFormYear` state and a `handleMgTrackingExport` handler.
  - Remove the LY-F064 dropdown+button block from the Stok toolbar
    (`activeTab === 'stock' && canExportIsoForm`).
  - Department options: `uniqueStockDepartments` (already computed).

## 6. Data flow

```
[ISO Formları page] --(dept, year)--> api.downloadMgTrackingForm
  -> GET /api/mg-tracking-form?department=&year=  (auth + role + dept-access)
     -> SQL: purchases -> lots -> distribution_lots -> distributions (by FK)
     -> buildMgRows -> buildMgWorkbook (exceljs) -> Buffer
  <- browser downloads Malzeme_Takip_MG-F069_<dept>_<year>.xlsx
```

## 7. Error handling

- Missing/blank `department` → **400**.
- Department not in caller's accessible set → **403** (defensive; both allowed
  roles are bypass roles today).
- No matching purchases → **200** with a valid sheet: title + headers + zero data
  rows (still a usable ISO artifact).
- Non-Latin-1 chars in department (e.g. `İ`) handled by the ASCII filename
  fallback + `filename*` (the bug already fixed for LY-F064).

## 8. Testing / verification

- Unit (`server/mgTrackingForm.test.cjs`): date formatting; one row per
  distribution; blank dispatch columns when no distribution; username passthrough;
  empty input → no rows.
- Live (local DB): role/param matrix (200 / 403 / 400); open generated file with
  exceljs and confirm headers + rows. Local data is sparse (2 purchases, no
  distributions), so a temporary purchase + distribution will be seeded for a
  known department to verify the join and row rendering, then removed.

## 9. Files touched

- **New:** `server/mgTrackingForm.cjs`, `server/mgTrackingForm.test.cjs`.
- **Edit:** `server/index.js` (route; reuse `canExportIsoForm`).
- **Edit:** `server/isoCountForm.cjs` (export `formatDateTR` for reuse).
- **Edit:** `src/api.js` (`downloadMgTrackingForm`).
- **Edit:** `src/App.jsx` (new nav item + page; move LY-F064 controls off Stok
  toolbar).
- **New:** `updates/UPDATE_2026-07-16_mg-tracking-form-and-iso-page.md`.

## 10. Rollback

Code-only, no DB migration. Revert the commits. No exceljs change (already a
dependency).
