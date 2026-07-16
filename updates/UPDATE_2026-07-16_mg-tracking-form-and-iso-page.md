# UPDATE 2026-07-16 — MG-F069 Malzeme Takip Listesi export + "ISO Formları" nav page

## Summary

Adds the ISO **Malzeme Takip Listesi (MG-F069)** export — a two-sheet `.xlsx`
scoped to one department + year — and introduces a dedicated left-nav page
**"ISO Formları"** that collects the ISO exports.

- **Sheet 1 "Malzeme Takip Listesi":** one row per talep (purchase request) for
  the department + year, showing its request→receive lifecycle columns plus a
  **Durum** (status) column, so *every* request appears with its stage — not just
  received ones. Durum labels match the Satın Alma Talepleri screen exactly
  (EBYS bekleme / Onaylandı / Sipariş Verildi / Kısmen Geldi / Tamamlandı /
  Reddedildi). Department is resolved as `COALESCE(NULLIF(p.department,''),
  item.department)` so taleps saved with a blank department (but a valid item
  department) are no longer dropped.
- **Sheet 2 "Dağıtım Listesi":** one row per CEP DEPO distribution (dağıt) for
  the department + year — date, material, quantity in the stock unit, who
  distributed, recipient technician, linked talep number, notes. The existing
LY-F064 (Malzeme Sayım Formu) controls move off the Stok top toolbar into this
page. Implements
`docs/superpowers/specs/2026-07-16-mg-f069-and-iso-forms-page-design.md`.

Output is a clean single-sheet `.xlsx` built with `exceljs` (not a byte-faithful
reproduction of the original 8-sheet workbook). The "who" columns show the stored
username of the recorded person.

## Files touched

- **New:** `server/mgTrackingForm.cjs` — `buildMgRows` (pure row builder) +
  `buildMgWorkbook` (exceljs single sheet). Reuses `formatDateTR` from
  `isoCountForm.cjs`.
- **New:** `server/mgTrackingForm.test.cjs` — 5 unit tests.
- **Edit:** `server/index.js` — `GET /api/mg-tracking-form?department=&year=`
  (guarded by the existing `canExportIsoForm`).
- **Edit:** `src/api.js` — `downloadMgTrackingForm(department, year)`.
- **Edit:** `src/App.jsx` — new "ISO Formları" nav item + page (two cards:
  LY-F064 and MG-F069); LY-F064 dropdown/button removed from the Stok toolbar.
- **New:** this change log.

## DB changes

None. Read-only queries against `purchases` + `distributions`.

## Data mapping (each sheet: title row 1, headers row 2, data row 3+)

**Sheet 1 (Malzeme Takip Listesi)** — one row per talep, from `purchases p LEFT
JOIN item_definitions i WHERE COALESCE(NULLIF(p.department,''), i.department) = ?
AND YEAR(p.requestedAt) = ?` (no distribution join, so no lot-number matching to
get wrong):
A=requestNumber, B=itemCode, C=itemName, D=requestedQty, E=requestedAt,
F=receivedDate, G=receivedQtyTotal, H=expiryDate, I=lotNo, J=supplierName,
K=receivedBy, L=approvedBy, M=Durum. Durum maps the status enum to the same label
the UI shows (src/mobileUi.mjs): TALEP_EDILDI→"EBYS bekleme", ONAYLANDI→
"Onaylandı", SIPARIS_VERILDI→"Sipariş Verildi", KISMI_TESLIM/KISMEN_GELDI→
"Kısmen Geldi", TESLIM_ALINDI/GELDI→"Tamamlandı", REDDEDILDI→"Reddedildi".
Dates `DD.MM.YYYY`.

**Sheet 2 (Dağıtım Listesi)** — one row per CEP DEPO dağıt:
`cep_depo_distributions cd LEFT JOIN item_definitions i ON i.id = cd.itemId
LEFT JOIN purchases p ON p.id = cd.purchaseId WHERE cd.department = ? AND
YEAR(cd.distributedAt) = ?`:
A=distributedAt, B=item code, C=item name, D=packQty (Miktar, stock unit),
E=`COALESCE(packageUnit, unit)`, F=distributedBy, G=recipient technician,
H=linked requestNumber (via the real `purchaseId` FK), I=notes.

**Correctness note:** sheet 1 no longer joins distributions at all, and sheet 2
resolves the talep via the `cep_depo_distributions.purchaseId` foreign key — so
the earlier lot-number over-match risk is gone entirely (no text matching on
either sheet).

## Test steps / verification (against local test DB)

- Unit: `node --test server/mgTrackingForm.test.cjs` → 6/6 (tracking rows,
  distribution rows, status labels, empty input). Full suite
  `node --test server/*.test.cjs` → 36/36. `npm run build` clean.
- Live role/param matrix: ADMIN+dept → 200; SATINAL → 403; missing dept → 400;
  no auth → 401.
- Live two-sheet check ("Moleküler Mikro", 2026): seeded a TALEP_EDILDI and a
  TESLIM_ALINDI purchase → sheet 1 showed both with correct Durum ("Talep Edildi"
  / "Teslim Alındı") and blank receipt cols for the request-only one. Sheet 2
  listed the 21 real CEP DEPO distributions; rows whose item resolves show code /
  name / packQty / stock unit / dağıtan / recipient. Seed removed afterward.
- Note: in the local copy some CEP DEPO rows reference deleted items/purchases
  (12/21 items, 2/21 purchases resolve) → those cells are blank via LEFT JOIN;
  correct behavior, populated in production where the rows exist.

## Risks

- v1 covers the year-based lists only. Out of scope: CIHAZ-HIZMET (device/service)
  sheets, İhale (tender) sheet, NOTLAR legend.
- Sheet 2 draws from `cep_depo_distributions` (the active dağıt path). The classic
  `distributions` table is not included (it is empty in practice).
- Sheet 2's item/talep columns depend on the referenced `item_definitions` /
  `purchases` rows still existing; deleted references render blank (LEFT JOIN).
- Local test data for purchases is sparse; production has the real volume.

## Rollback

Code-only, no DB migration. Revert the commits. `exceljs` already a dependency.
