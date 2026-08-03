# Barcode-Based Goods Receiving — Design Spec

**Date:** 2026-07-07
**Branch:** `feature/barcode-receiving`
**Status:** Approved by user (design conversation 2026-07-07)

## Problem

When cargo arrives, staff manually navigate to the purchase, open the "Teslim Al" modal, and type the lot number and expiry date by hand. Lab reagent packages usually carry barcodes (mixed types: GS1-128/DataMatrix with embedded lot+expiry, plain EAN-13, or supplier catalog codes). Scanning should identify the product, prefill lot/expiry when the barcode encodes them, and create a **new lot of the same product** through the existing receive flow.

## Requirements (from design conversation)

- **Barcode types:** mixed/unknown → parse GS1 Application Identifiers when present; otherwise treat the raw code as a product identifier only.
- **Hardware:** both USB/Bluetooth keyboard-wedge scanners **and** mobile phone camera scanning.
- **Flows:** both a scan-first receiving screen ("Barkodla Teslim Al") **and** a scan field inside the existing Teslim Al modal.
- **Data model:** new `item_barcodes` table — many barcodes per item, learned over time.
- UI text in Turkish; code identifiers in English; no new state libraries; raw `mysql2/promise` with `?` placeholders; multi-row mutations in `withTransaction`.

## Definition of Done

1. Scanning a GS1-128/DataMatrix code on the scan-first screen identifies the item, lists its open purchases (`SIPARIS_VERILDI`/`KISMI_TESLIM`), prefills lot number + expiry, and receiving creates a lot via the existing `/api/receive-goods` (new lotNumber → new lot row; existing lotNumber → quantity added).
2. Scanning a plain EAN/unknown-format code identifies the item via `item_barcodes` (or `catalogNo` fallback); lot/expiry entered manually.
3. Unknown barcode → learning flow: user searches/picks the item, mapping saved, rescan resolves instantly.
4. Scan field in the Teslim Al modal prefills lot/expiry and warns on product mismatch.
5. GS1 parser has unit tests covering AI (01), (10), (17), FNC1/GS separators, and non-GS1 fallback.
6. USB scanner works with zero configuration; camera scanning works on HTTPS deployments.

## Design

### 1. Database — one migration

```sql
CREATE TABLE item_barcodes (
  id VARCHAR(64) PRIMARY KEY,
  itemId VARCHAR(64) NOT NULL,
  barcode VARCHAR(128) NOT NULL,
  barcodeType VARCHAR(16) NOT NULL DEFAULT 'OTHER', -- 'GTIN' | 'OTHER'
  createdBy VARCHAR(255) NOT NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_item_barcodes_barcode (barcode),
  KEY idx_item_barcodes_item (itemId),
  CONSTRAINT fk_item_barcodes_item FOREIGN KEY (itemId) REFERENCES item_definitions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

Migration file: `server/migrations/2026-07-07_item_barcodes.sql`. Rollback: `DROP TABLE item_barcodes;`. No existing table changes.

### 2. GS1 parser — pure utility

`server/gs1.js` (CommonJS) + `src/utils/gs1.js` (ESM) — same logic, small enough to duplicate rather than add a build bridge.

- Input: raw scan string. Output: `{ gtin, lotNumber, expiryDate, raw, isGs1 }`.
- Handles: `]C1`/`]d2`/`]Q3` AIM symbology prefixes; AI **(01)** GTIN-14 (fixed 14), AI **(17)** expiry YYMMDD (fixed 6, day `00` → last day of month), AI **(10)** lot (variable, terminated by GS char `\x1d` or end); parenthesized human-readable form `(01)...(17)...(10)...`; unknown AIs skipped safely (known fixed-length table; variable AIs consume to GS).
- Non-GS1 input → `{ raw, isGs1: false }` (treated as plain product code).
- Expiry `YYMMDD` → `20YY-MM-DD` (GS1 spec: years 00–50 → 20xx; this system won't see 19xx dates).

### 3. Backend — two endpoints in `server/index.js`

- **`GET /api/barcodes/:code`** (authRequired): parse code → candidate keys = [full raw string, GTIN if GS1, GTIN without leading zero / EAN-13 form]. Lookup order: `item_barcodes.barcode IN (keys)` → fallback `item_definitions.catalogNo IN (keys)`. On hit: return `{ item, parsed: {lotNumber, expiryDate}, openPurchases }` where openPurchases = that item's purchases with status `SIPARIS_VERILDI` or `KISMI_TESLIM`. On miss: 404 `{ error: 'BARCODE_NOT_FOUND', parsed }`.
- **`POST /api/barcodes`** (authRequired + `canReceiveGoods`): body `{ barcode, itemId, barcodeType }`. Validates item exists; `INSERT ... ON DUPLICATE KEY UPDATE itemId = VALUES(itemId)` is **not** used — duplicate barcode returns 409 `BARCODE_EXISTS` with the currently-mapped item so the user decides. Single-row insert; no transaction needed.
- `/api/receive-goods` is **unchanged**.
- New `src/api.js` exports: `lookupBarcode(code)`, `registerBarcode(data)`.

### 4. Scan capture — `src/components/BarcodeScanner.jsx`

One component, two capture methods, one `onScan(rawString)` callback:

- **Keyboard-wedge (USB/BT scanner):** focused text input; Enter key submits the buffer. Autofocus + refocus-on-blur while the scan screen is active so the dock worker never touches the keyboard.
- **Camera:** "📷 Kamerayla Tara" button → `@zxing/browser` (new npm dependency, bundled by Vite) reading from `getUserMedia` video; decodes EAN-13/8, Code128 (GS1-128), DataMatrix, QR. Requires HTTPS (or localhost) — if `navigator.mediaDevices` is unavailable, the button shows a Turkish tooltip explaining HTTPS is required and only manual/wedge input works.
- Camera stream stopped on unmount/close (no leaked camera lock).

### 5. UI — two entry points (Turkish)

- **"Barkodla Teslim Al" screen** (new tab/section in App.jsx, visible to roles with receive capability — ADMIN, SATINAL_LOJISTIK): scan → item card + parsed lot/SKT + open purchase list → user picks purchase, adjusts quantity (default: remaining qty), confirms → calls existing `receiveGoods()` → success toast, auto-reset for next scan. Unknown code → inline "Barkod tanınmadı" panel with item search → pick item → `registerBarcode()` → continue receive in same flow.
- **Teslim Al modal:** small scan input at top; on scan, if resolved item ≠ purchase's item → red warning "Barkod farklı ürüne ait: <name>"; else prefill `lotNo` and `expiryDate` fields.

### 6. Deployment note

Mobile camera scanning requires the production site (SkvcLabInvWeb01) to be served over **HTTPS**. USB scanner and all other features work over HTTP. SSL setup is an ops task outside this branch.

## Out of scope

Label printing, scanning in distribution/consumption flows, scan-event audit log, offline mode.

## Test plan

- Unit tests (node built-in `node:test`): GS1 parser cases — bracket AIM prefix, GS-separated variable AI, parenthesized form, expiry day-00, plain EAN fallback.
- Manual: GS1 scan → new lot with correct lotNumber/SKT; second scan same product different lot → second lot row; same lot rescan → quantity added to existing lot; unknown → learn → rescan hits; modal prefill + mismatch warning; camera denied/HTTP → graceful fallback message.

## Risks

- `receive-goods` route untouched → core stock risk minimal.
- ZXing is the only new runtime dependency (frontend only).
- Barcode collisions across items are surfaced (409), never silently remapped.
- App.jsx is monolithic (~2800 lines); new screen adds to it — keep the screen self-contained and the scanner in its own component file.
