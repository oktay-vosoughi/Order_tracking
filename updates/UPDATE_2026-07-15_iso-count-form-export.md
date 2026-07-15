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
| B | Katolog Numarası | `item_definitions.catalogNo` |
| C | Malzeme Adı | `name` |
| D | Marka | `brand` |
| E | Depo | `SUM(currentQuantity)` over ACTIVE lots qty>0 (**incl. expired**) |
| F | Birim | `unit` |
| G | Buzdolabı/Dolap | `storageLocation`, fallback `storageTemp` |
| H | Son Kullanma Tarihi | per-lot `DD.MM.YYYYxQTY` (FEFO), `Yok` if none dated |
| I | Kritik Stok Seviyesi | `minStock` |
| J | İdeal Stok Seviyesi (3 aylık) | `ideal_stock` |
| K | Maksimum Stok Seviyesi | `max_stock` |
| L | Stok Durumu | `SATINAL` if shelf < `COALESCE(ideal_stock, minStock)`, else `YETERLİ` |

Item scoping: `id.isGlobal = 1 OR EXISTS(item_departments d WHERE d.department = ?)`.

## Test steps / verification (done against local test DB)

Unit: `node --test server/isoCountForm.test.cjs` → 8/8 pass. Full suite
`node --test server/*.test.cjs` → 29/29 pass.

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

## Risks

- Template file is a controlled ISO document; keep it in sync if the official
  LY-F064 layout changes (row/column positions are hard-coded to the current
  template: headers row 9, data from row 10, header date cell `G3`).
- `catalogNo` is empty for all items in the current DB, so column B renders blank
  — this is faithful to the data, not a defect.
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
