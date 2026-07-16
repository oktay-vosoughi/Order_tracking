# UPDATE 2026-07-16 — MG-F069 Malzeme Takip Listesi export + "ISO Formları" nav page

## Summary

Adds the ISO **Malzeme Takip Listesi (MG-F069)** export — the
request→approve→receive→dispatch purchase-lifecycle log, one row per
distribution event, scoped to one department + year — and introduces a dedicated
left-nav page **"ISO Formları"** that collects the ISO exports. The existing
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

## Data mapping (MG-F069, title row 1, headers row 2, data row 3+)

Base: `purchases` for the department + `YEAR(requestedAt) = year`, joined by
**foreign keys** (no lot-number text matching):
`purchases → lots (lots.purchaseId) → distribution_lots (dl.lotId) →
distributions (d.id = dl.distributionId)`. One row per distribution event; a
purchase with received-but-undistributed lots → one row per lot (dispatch
columns blank); a purchase with no linked lot → one row falling back to its own
receipt fields.

A=requestNumber, B=itemCode, C=itemName, D=requestedQty, E=requestedAt,
F=`COALESCE(lot.receivedDate, p.receivedDate)`, G=`COALESCE(lot.initialQuantity,
p.receivedQtyTotal)`, H=`COALESCE(lot.expiryDate, p.expiryDate)`,
I=`COALESCE(lot.lotNumber, p.lotNo)`, J=supplierName,
K=`COALESCE(lot.createdBy, p.receivedBy)`, L=distributions.distributedDate,
M=distributions.receivedBy, N=distributions.completedDate, O=approvedBy.
Dates `DD.MM.YYYY`.

**Correctness note:** the join walks primary/foreign keys only, so a distribution
attaches to exactly one lot and a lot to exactly one purchase — a reused lot
number cannot over-match across purchases. (`lots` also enforces a unique
`(itemId, lotNumber)` constraint.) The `COALESCE(lot, purchase)` fallback keeps
receipt columns populated for legacy lots created before the `purchaseId` link
existed.

## Test steps / verification (against local test DB)

- Unit: `node --test server/mgTrackingForm.test.cjs` → 5/5. Full suite
  `node --test server/*.test.cjs` → 35/35. `npm run build` clean.
- Live role/param matrix: ADMIN+dept → 200; SATINAL → 403; missing dept → 400;
  no auth → 401.
- Seeded 1 purchase + 2 distributions (via `lots.purchaseId` +
  `distribution_lots`) for "Moleküler Genetik", downloaded the form, confirmed:
  one row per distribution, purchase/approval columns repeated, dispatch columns
  differing per distribution, usernames shown, dates `DD.MM.YYYY`, Turkish
  filename handled.
- **Over-match regression check:** seeded two purchases of the same item both
  carrying `lotNo = 'MG-LOT-A'` (the field the old heuristic matched on), with
  only the first purchase's lot actually distributed. The distribution attached
  to that purchase only; the second showed blank dispatch columns — confirming
  the FK join cannot leak across purchases. Seed data removed afterward.

## Risks

- v1 covers the year-based material tracking list only. Out of scope:
  CIHAZ-HIZMET (device/service) sheets, İhale (tender) sheet, NOTLAR legend.
- Dispatch columns (L/M/N) come from the `distributions` table. CEP DEPO
  consumption (`cep_depo_*`) is not reflected — a possible future enhancement.
- A purchase's distributions only appear once its lots carry `purchaseId` (set by
  the receive-goods flow). Legacy/manually-created lots without that link still
  show correct request+receipt data via the `COALESCE` fallback, but their
  distributions won't be attributed (by design — attributing them would require
  the very lot-number guessing this change removed).
- Local test data for purchases/distributions is sparse; production has the real
  volume.

## Rollback

Code-only, no DB migration. Revert the commits. `exceljs` already a dependency.
