# UPDATE 2026-07-15 — ISO Malzeme Sayım Formu (LY-F064) export

## Summary

Implements the on-demand export of the controlled ISO stock-count form
**LY-F064 (Malzeme Sayım Formu)** as an `.xlsx`, pre-filled from live stock and
scoped to **one department per file**. Implements the design in
`docs/superpowers/specs/2026-07-14-iso-count-form-export-design.md`.

The generated file reuses the real controlled `.xlsx` as a template (via
`exceljs`), so borders, header block, logo and column headers are byte-faithful;
only the count date and data rows are written. Sign-off fields (**Sayımı Yapan**,
**Onay**, **Açıklama**) are left blank for hand-signing after the physical count.

Access is restricted to **ADMIN** and **SATINAL_LOJISTIK** (not SATINAL),
enforced on both API and UI.

## Files touched

- **New:** `server/templates/LY-F064_MALZEME_SAYIM_FORMU.xlsx` — controlled
  template asset (copied from `kaltie form/…ÇALISMA.xlsx`).
- **New:** `server/isoCountForm.cjs` — pure row-building helpers
  (`buildIsoRows`, `formatExpiryBreakdown`, `stockStatusLabel`, `formatDateTR`)
  + `fillIsoCountForm` (exceljs template fill → Buffer).
- **New:** `server/isoCountForm.test.cjs` — 8 unit tests for the pure logic.
- **Edit:** `server/index.js` — `require` the new module; add `canExportIsoForm`
  guard; add `GET /api/iso-count-form?department=<name>` route.
- **Edit:** `src/api.js` — add `downloadIsoCountForm(department)` (authenticated
  blob download; all HTTP stays inside `api.js`).
- **Edit:** `src/App.jsx` — role-gated department dropdown + "ISO Sayım Formu"
  button in the stock toolbar; `handleIsoCountFormExport` handler.
- **Edit:** `.gitignore` — un-ignore `server/templates/*.xlsx` (the repo-wide
  `*.xlsx` rule would otherwise exclude the controlled template asset).
- **Edit:** `package.json` / `package-lock.json` — add `exceljs` (server-side
  formatting; SheetJS cannot write cell styling).

## DB changes

None. No migration, no schema change. Read-only queries against
`item_definitions`, `item_departments`, and `lots`.

## Column mapping (LY-F064 `Sayfa1`, data from row 10)

| Col | Header | Source |
|-----|--------|--------|
| A | Sıra No | 1-based index |
| B | Katolog Numarası | `item_definitions.catalogNo`, fallback `code` (the system "Kod" is the catalog number; `catalogNo` is unused/empty in the DB) |
| C | Malzeme Adı | `name` |
| D | Marka | `brand` |
| E | Depo | `SUM(currentQuantity)` over ACTIVE lots qty>0 (**incl. expired**) |
| F | Birim | `unit` |
| G | Buzdolabı/Dolap | `storageLocation`, fallback `storageTemp` |
| H | Son Kullanma Tarihi | per-lot `DD.MM.YYYYX<qty>` (FEFO, uppercase `X` = qty multiplier); undated portion of a mixed item appended as `YokX<qty>`; `Yok` if no lot is dated |
| I | Kritik Stok Seviyesi | `minStock` |
| J | İdeal Stok Seviyesi (3 aylık) | `ideal_stock` |
| K | Maksimum Stok Seviyesi | `max_stock` |
| L | Stok Durumu | `SATINAL` if shelf < `COALESCE(ideal_stock, minStock)`, else `YETERLİ` |

Item scoping: `id.isGlobal = 1 OR EXISTS(item_departments d WHERE d.department = ?)`.

## Test steps / verification (done against local test DB)

Unit: `node --test server/isoCountForm.test.cjs` → 9/9 pass. Full suite
`node --test server/*.test.cjs` → 30/30 pass.

HTTP matrix (minted JWTs, local server):
- ADMIN + valid dept → **200**; SATINAL_LOJISTIK + valid dept → **200**
- SATINAL / OBSERVER / LAB_TECHNICIAN → **403**
- missing `department` → **400**; no auth → **401**
- empty/non-existent department → **200** with a valid header-only form (no crash)

Generated-file checks (opened with exceljs):
- Logo image preserved; title, column headers and cell borders intact.
- `G3` count date filled (`15.07.2026`); `Sayımı Yapan` / `Onay` / `Açıklama` blank.
- Row/data count matched the DB (65 items for "Moleküler Mikro").
- Spot-check "WCP 1001…": shelf qty 59, min 5 / ideal 10 / max 20, status YETERLİ,
  and its 2023 (expired) lot correctly included in Depo + SKT column.
- Multi-lot item shows FEFO-ordered `DD.MM.YYYYxQTY` breakdown; item with no dated
  lots shows `Yok`.

## Follow-up refinements (2026-07-16)

Post-review fixes after comparing the generated form against the hand-maintained
`ÇALISMA.xlsx`:

- **Column B (Katalog Numarası) now falls back to `code`.** `catalogNo` is empty
  for every item in the DB; the system "Kod" *is* the catalog number, so column B
  uses `catalogNo || code` and is now populated.
- **SKT column matches the hand convention.** Uppercase `X` as the quantity
  multiplier, and the undated portion of a mixed item is written as `YokX<qty>`
  (previously the undated quantity was silently dropped, so the SKT column no
  longer reconciled with the "Depo" total). Verified live: e.g. `01.10.2027X44
  YokX5` with Depo `49` = 44 + 5.
- **Fixed a Turkish-character crash in the download filename.** Departments with
  characters outside Latin-1 (e.g. `İ` U+0130 in "SİTOGENETİK") threw
  `ERR_INVALID_CHAR` from `res.setHeader('Content-Disposition', …)` → HTTP 500.
  The plain `filename=` fallback is now ASCII-sanitized; the real Unicode name is
  carried by the RFC 5987 `filename*=UTF-8''…` parameter (which browsers prefer).

**Columns M and N:** in the hand-maintained sheet these are *unofficial*
annotation columns (no headers in the controlled form, which is A–L) holding
free-text physical-count notes like `SABIT DEPO` ("in the fixed depot"), `AÇIK`
("opened package"), or an `X` mark. They are **not derivable from the system** and
are left blank for hand-annotation, like the sign-off fields.

## Risks

- Template file is a controlled ISO document; keep it in sync if the official
  LY-F064 layout changes (row/column positions are hard-coded to the current
  template: headers row 9, data from row 10, header date cell `G3`).
- Column G (Buzdolabı/Dolap) renders blank because `storageLocation`/`storageTemp`
  are unpopulated in the DB; the export can't synthesize it — it needs data entry
  on each item. (Column B was similarly blank until the `code` fallback above.)
- `exceljs` is a new server dependency (~large). Server-side only; does not affect
  the frontend bundle.

## Rollback

Code-only (no DB migration to undo):

```
git revert <commit(s)>
# then remove exceljs if desired:
#   npm remove exceljs
# and remove server/templates/LY-F064_MALZEME_SAYIM_FORMU.xlsx
```
