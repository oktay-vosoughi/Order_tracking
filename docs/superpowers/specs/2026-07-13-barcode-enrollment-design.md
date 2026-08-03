# Barcode Enrollment ("Barkod Eşleştirme") — Design Spec

**Date:** 2026-07-13
**Branch:** `feature/barcode-receiving` (extends the barcode-receiving feature)
**Status:** Approved by user (design conversation 2026-07-13 — chose the scan-through screen)

## Problem

The database currently has **no barcodes** for any of the ~300 items. The existing barcode-learning flow only attaches a barcode *during receiving*, which requires an open purchase — unusable for a proactive one-time sweep of the whole catalog. We need a dedicated screen to walk the shelves with a phone or 2D scanner and attach each item's barcode to its existing item record, so that from go-live every receiving scan is recognized immediately (no per-item "tanınmadı" step).

## Requirements (from design conversation)

- A dedicated **"Barkod Eşleştirme"** screen (scan-through, not Excel).
- Search/select an item → scan its barcode (USB wedge or camera) → mapping saved.
- Live progress: "X / N barkodlı" and a per-item ✓/eksik indicator.
- Filter to show only items still missing a barcode, to power through the remainder.
- Fix mis-scans: remove a wrong barcode from an item.
- A product not in `item_definitions` is **out of scope for creation here** — the screen only maps barcodes to existing items; surface "sistemde yok" guidance pointing to the existing add-item flow. (User must create the item first, then it appears in the list.)
- Reuse the existing `POST /api/barcodes` (stores GTIN for GS1, raw otherwise) and `BarcodeScanner` component.
- UI Turkish; identifiers English; HTTP via `src/api.js`; `?` placeholders; gated to receive-capable roles (ADMIN / SATINAL_LOJISTIK / `canReceive`).

## Definition of Done

1. New sidebar tab "Barkod Eşleştirme" visible only to receive-capable roles; renders a searchable item list with a header progress counter "X / N barkodlı".
2. Selecting an item and scanning a code (wedge or camera) attaches the barcode to that item via `POST /api/barcodes`; the row immediately shows ✓ and the scanned code; the progress counter updates.
3. A barcode already mapped to a different item returns 409 and the screen shows "Bu barkod zaten şu ürüne kayıtlı: <name>" without corrupting either mapping.
4. Each mapped barcode has a ✕ to remove it (`DELETE /api/barcodes/:id`); after removal the item returns to "eksik".
5. A "sadece eksik" filter hides already-enrolled items.
6. After a successful scan the selection auto-advances to the next missing item (fast sweep), unless the "sadece eksik" filter is off and the user prefers manual selection.

## Design

### Backend — two new endpoints in `server/index.js`, near the existing barcode routes

- **`GET /api/item-barcodes`** (`authRequired, canReceiveGoods`): returns `{ barcodes: [{ id, itemId, barcode, barcodeType }] }` — all mappings, for the enrollment view to join against the item list. No per-item filtering needed for 300 rows.
- **`DELETE /api/barcodes/:id`** (`authRequired, canReceiveGoods`): deletes one mapping by id; 404 `BARCODE_NOT_FOUND` if the id doesn't exist; 200 `{ ok: true }` on success. Single-row delete, no transaction.
- Reuse existing `POST /api/barcodes` unchanged (already handles 409 `BARCODE_EXISTS`, idempotent 200, `barcodeType` whitelist, GTIN-vs-raw via the caller).
- `src/api.js` gains `fetchItemBarcodes()` and `deleteBarcode(id)`. `registerBarcode` already exists.

### Frontend — `src/BarcodeEnroll.jsx` (new), wired into `src/App.jsx`

- On mount: `fetchItemDefinitions()` (returns `{ items }`) + `fetchItemBarcodes()`; build `barcodesByItem: Map<itemId, [{id, barcode}]>`.
- **Header:** `Barkod Eşleştirme` + counter `{enrolledCount} / {items.length} barkodlı`.
- **Controls:** search input (name / code / catalogNo); "Sadece eksik" checkbox.
- **Scanner:** one `<BarcodeScanner autoFocus={false} onScan={...} />` at the top, bound to the currently **selected** item. If no item is selected when a scan arrives, show "Önce bir ürün seçin".
- **List:** filtered rows; clicking a row selects it (highlighted). Each row shows name, code, catalogNo, its current barcode chips (each with ✕), and a ✓/"eksik" badge. The selected row is visually distinct.
- **On scan:** `registerBarcode({ barcode: storageKey(parseGs1(code)), itemId: selected.id, barcodeType })` — same key logic as the receive learn flow, so a GS1 DataMatrix stores the stable GTIN. On success: update local map, show ✓, then auto-advance selection to the next item with no barcode (respecting the current filter/search order). On 409: show the conflicting item's name. On other error: Turkish error message.
- **Delete:** ✕ on a chip calls `deleteBarcode(id)`, updates the map, reverts the row to "eksik".
- **New-item note:** a static line — "Listede olmayan bir ürünü önce 'Stok' ekranından ekleyin; sonra burada barkodunu eşleştirebilirsiniz."
- Re-entrancy: guard the scan/save/delete handlers with a `busy` flag (same pattern as BarcodeReceive) so rapid scans can't race.

### Capture methods

Same `BarcodeScanner` as the rest of the feature: USB/2D keyboard-wedge works everywhere; camera (QR + DataMatrix + 1D) works on localhost and on HTTPS. No change here.

## Out of scope

Inline item creation, Excel import (deferred — user chose scan-through), editing barcodeType by hand, bulk delete, scan-event audit log.

## Test plan

- API: `GET /api/item-barcodes` returns mappings; `DELETE /api/barcodes/:id` removes one and 404s on a bad id; `POST` conflict still 409.
- Screen: enroll a GS1 code (stores GTIN, row ✓, counter +1); enroll a plain code; try the same code on a second item → 409 message; remove a chip → row back to eksik; "sadece eksik" filter hides enrolled; auto-advance moves to next missing item.

## Risks

- Reuses the unmodified `POST /api/barcodes`; only additive read + delete endpoints. `receive-goods` and stock untouched.
- 300-item list rendered client-side — fine at this size; no pagination needed.
- Deleting a barcode only removes the mapping, never touches lots/stock.
