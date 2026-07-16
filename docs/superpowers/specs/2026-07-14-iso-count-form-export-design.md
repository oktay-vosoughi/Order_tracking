# Design: ISO Malzeme Sayım Formu (LY-F064) Export

**Date:** 2026-07-14
**Author:** Oktay Vosoughi (with Claude)
**Status:** Proposed — awaiting review

---

## 1. Problem

Medipol labs must produce a physical stock-count form for ISO quality records on the
**1st and 15th of each month**. Today this is a manual Excel file maintained by hand
(`kaltie form/LY-F064_0_MALZEME_SAYIM_FORMU-Günlük Takip_ÇALISMA.xlsx`). We want the
system to generate that exact controlled form, pre-filled from live stock data, so staff
only have to physically count, adjust, and sign.

## 2. Goal / Definition of Done

- An **on-demand button** in the UI generates the **LY-F064** count form as an `.xlsx`,
  pre-filled from the database, **scoped to one department per file**.
- The generated file is byte-faithful to the controlled LY-F064 template (borders,
  header block, column headers, logo) — only the data rows and the count date are filled.
- Sign-off fields (**Sayımı Yapan**, **Onay**, **Açıklama**) are left **blank** for
  hand-signing after the physical count.
- The feature is available **only to `ADMIN` and `SATINAL_LOJISTIK`** roles, enforced on
  both the API and the UI.
- No database migration. No scheduler (manual trigger only).

**Explicitly out of scope (YAGNI):** automatic scheduling/cron, email delivery,
per-form archival in the DB, the second (`03.03.2026`) template, ZIP-of-all-departments.
These can be added later if needed.

## 3. Chosen Approach

**Server endpoint + `exceljs` template-fill.**

Reasons:
- LY-F064 is a *controlled ISO document*; auditors expect its exact appearance. Reusing
  the real `.xlsx` as a template and writing only into data cells preserves all
  formatting. The free SheetJS (`xlsx`) build already in the repo **cannot write cell
  styling**, so it cannot reproduce the controlled form — this is why we add `exceljs`.
- Lot-level expiry strings and department scoping are trivial server-side in SQL.
- The controlled template file lives in the repo as a managed asset.

Rejected alternatives: client-side `exceljs` (ships template + lib to the browser,
re-implements dept scoping); client-side SheetJS (loses all borders/fonts — unacceptable
for a controlled document).

## 4. Components

### 4.1 Controlled template asset
- Copy `kaltie form/LY-F064_0_MALZEME_SAYIM_FORMU-Günlük Takip_ÇALISMA.xlsx` into the repo
  at `server/templates/LY-F064_MALZEME_SAYIM_FORMU.xlsx` as the canonical template.
- The template's `Sayfa1` sheet is the form; the `kullanım dışı` sheet is ignored/kept.

### 4.2 New dependency
- Add **`exceljs`** to `server/package.json` (server-side only). Justified by the
  controlled-document formatting requirement; does not touch the frontend "no new
  libraries" constraint (which concerns React state libs).

### 4.3 Backend endpoint
`GET /api/iso-count-form?department=<name>`

- Middleware: `authRequired` + a new named guard
  `canExportIsoForm = requireRole([ROLES.ADMIN, ROLES.SATINAL_LOJISTIK])`.
- `department` query param required; must be one of the departments the user can access
  (reuse `getUserDepartments` / `buildItemDepartmentFilter`). Reject others with 403/400.
- Query active `item_definitions` for that department joined to `lots`, producing per-item:
  catalogNo, name, brand, unit, storageLocation/storageTemp, minStock, ideal_stock,
  max_stock, the summed shelf quantity, and a per-lot expiry breakdown string.
- Load the template with `exceljs`, write header date + data rows, stream back as a
  download with `Content-Disposition: attachment; filename="..."` and the correct
  spreadsheet MIME type.

### 4.4 Frontend
- New `api.js` export `downloadIsoCountForm(department)`: does an authenticated `fetch`
  for the blob (the existing `apiFetch` only returns JSON), builds an object URL, and
  triggers an `<a download>` click. All HTTP stays inside `api.js` (API-boundary rule).
- UI: a **department dropdown** (populated from the user's accessible departments) plus an
  **"ISO Sayım Formu İndir"** button, placed in the existing export area of `App.jsx`.
  Button/section rendered only when `role ∈ {ADMIN, SATINAL_LOJISTIK}`.

## 5. Data flow

```
[ISO Sayım Formu İndir] --(dept)--> api.downloadIsoCountForm(dept)
   -> GET /api/iso-count-form?department=dept  (auth + role + dept-access check)
      -> SQL: active items for dept + lot aggregation
      -> exceljs: load server/templates/LY-F064...xlsx
                  set count date cell; clear old data rows;
                  write rows from row 10, copying row-10 cell style so borders extend
      -> stream .xlsx buffer
   <- browser downloads  Malzeme_Sayim_LY-F064_<dept>_<YYYY-MM-DD>.xlsx
```

## 6. Column mapping (LY-F064 `Sayfa1`)

Header on row 9 (1-indexed); data begins row 10.

| Col | Header | Source |
|-----|--------|--------|
| A | Sıra No | 1-based row index |
| B | Katolog Numarası | `item_definitions.catalogNo` |
| C | Malzeme Adı | `name` |
| D | Marka | `brand` |
| E | Depo | `SUM(currentQuantity)` over **all ACTIVE lots with qty > 0**, **including expired** (physically on the shelf) |
| F | Birim | `unit` |
| G | Buzdolabı/Dolap | `storageLocation`, fallback `storageTemp` |
| H | Son Kullanma Tarihi | per-lot breakdown `"DD.MM.YYYYxQTY …"` over ACTIVE lots (incl. expired); `Yok` if none dated |
| I | Kritik Stok Seviyesi | `minStock` |
| J | İdeal Stok Seviyesi (3 aylık) | `ideal_stock` |
| K | Maksimum Stok Seviyesi | `max_stock` |
| L | Stok Durumu | `SATINAL` if shelf qty `< COALESCE(ideal_stock, minStock)`, else `YETERLİ` |

**Header block:** write today's date into the "Sayımın Yapıldığı Tarih" cell (row 3,
col G). Leave **Sayımı Yapan**, **Onay**, and **Açıklama** empty.

**Decisions locked per user:**
- "Depo" and the SKT column **include expired lots** (physical count). Revisit later if
  the excluded-expired view is preferred.
- Access restricted to **ADMIN** and **SATINAL_LOJISTIK** only (not SATINAL).

## 7. Edge cases & error handling

- **More items than template data rows:** copy the style of the first template data row to
  any rows added beyond the template's pre-formatted range, so borders/format extend.
- **Fewer items than template rows:** clear leftover pre-filled/sample rows below the data.
- **Empty department (no items):** return the form with a header + zero data rows (still a
  valid ISO artifact), not an error.
- **Invalid/unauthorized `department`:** `400` (missing/blank) or `403` (not in the user's
  accessible set).
- **Missing template file on disk:** `500` with a clear server log; do not silently return
  an empty workbook.
- **Turkish characters / date formats:** dates formatted `DD.MM.YYYY`; ensure UTF-8 file
  name handling in `Content-Disposition`.

## 8. Testing / verification

1. As `ADMIN`, download the form for a department with a known item set; open in Excel and
   confirm: header block intact, borders present, count date filled, sign-off cells blank,
   and each data column matches the DB (spot-check catalogNo, shelf qty, expiry string,
   status).
2. Item with multiple lots (incl. one expired) → "Depo" includes the expired qty and the
   SKT column lists all lots.
3. Item with no dated lots → SKT column shows `Yok`.
4. As `SATINAL` and as `LAB_TECHNICIAN`/`OBSERVER` → button hidden and endpoint returns
   `403`.
5. Department the user cannot access → `403`.
6. Empty department → valid empty form, no crash.

## 9. Files touched

- **New:** `server/templates/LY-F064_MALZEME_SAYIM_FORMU.xlsx` (controlled template asset)
- **Edit:** `server/index.js` (new guard + `GET /api/iso-count-form` route)
- **Edit:** `server/package.json` / lockfile (add `exceljs`)
- **Edit:** `src/api.js` (add `downloadIsoCountForm`)
- **Edit:** `src/App.jsx` (department dropdown + export button, role-gated)
- **New:** `updates/UPDATE_2026-07-14_iso-count-form-export.md` (change log per CLAUDE.md §5)

## 10. Rollback

No DB changes → rollback is code-only: revert the commits and remove `exceljs` from
`server/package.json`. No data migration to undo.
