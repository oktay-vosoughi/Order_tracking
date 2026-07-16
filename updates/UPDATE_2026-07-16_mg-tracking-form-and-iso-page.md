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

Base: `purchases` for the department + `YEAR(requestedAt) = year`, `LEFT JOIN
distributions ON itemId AND lotNumber = lotNo` (only when `lotNo` is non-empty).
One row per matching distribution; a purchase with none → one row, dispatch
columns blank.

A=requestNumber, B=itemCode, C=itemName, D=requestedQty, E=requestedAt,
F=receivedDate, G=receivedQtyTotal, H=expiryDate, I=lotNo, J=supplierName,
K=receivedBy, L=distributions.distributedDate, M=distributions.receivedBy,
N=distributions.completedDate, O=approvedBy. Dates `DD.MM.YYYY`.

Note: distributions have no FK to purchases, so the join is heuristic on
`itemId + lotNumber = lotNo`. Acceptable for v1 (the list is keyed by request).

## Test steps / verification (against local test DB)

- Unit: `node --test server/mgTrackingForm.test.cjs` → 5/5. Full suite
  `node --test server/*.test.cjs` → 35/35. `npm run build` clean.
- Live role/param matrix: ADMIN+dept → 200; SATINAL → 403; missing dept → 400;
  no auth → 401.
- Seeded 1 purchase + 2 distributions for "Moleküler Genetik", downloaded the
  form, confirmed: 2 rows (one per distribution), purchase/approval columns
  repeated, dispatch columns differing per distribution, usernames shown, dates
  `DD.MM.YYYY`, Turkish filename handled. Seed data removed afterward.

## Risks

- Heuristic distributions↔purchases join (item + lot). If a lot number is reused
  across purchases, rows could over-match; unlikely in practice.
- v1 covers the year-based material tracking list only. Out of scope:
  CIHAZ-HIZMET (device/service) sheets, İhale (tender) sheet, NOTLAR legend.
- Local test data for purchases/distributions is sparse; production has the real
  volume.

## Rollback

Code-only, no DB migration. Revert the commits. `exceljs` already a dependency.
