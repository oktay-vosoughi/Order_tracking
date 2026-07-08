# UPDATE 2026-07-07 — Barkodla Teslim Al (GS1 Barcode-Assisted Goods Receiving)

## Summary
Added a barcode-first goods receiving flow. A GS1-128 / GS1 DataMatrix scan (from a
USB keyboard-wedge scanner or the device camera via ZXing) resolves the scanned GTIN
to an item, prefills LOT number and SKT (expiry date) from the barcode's AI(10)/AI(17)
fields, and shows any open purchases for that item so the user can pick one and
receive the goods. Unknown barcodes surface a "Barkod tanınmadı" search-and-match
("Eşleştir") flow that learns the GTIN → item mapping (`item_barcodes` table) so the
same barcode resolves instantly on the next scan. `POST /api/receive-goods` itself
was **not** changed — the barcode flow only supplies its inputs (itemId, lotNumber,
expiryDate) faster.

## Files touched
- `server/gs1.js` — dependency-free GS1-128/DataMatrix element-string parser (AI 01
  GTIN, AI 10 lot, AI 17 expiry); handles AIM prefixes (`]C1`/`]d2`/`]Q3`/`]e0`),
  human-readable `(01)...(17)...(10)...` form, and raw element strings with ASCII 29
  (GS) separators.
- `server/gs1.test.js` — 13 unit tests for the parser (`node --test`).
- `server/index.js` — `GET /api/barcodes/:code` (lookup by GTIN/EAN/raw code, returns
  parsed AI fields + matched item + open purchases in `SIPARIS_VERILDI`/`KISMI_TESLIM`)
  and `POST /api/barcodes` (learn a barcode → item mapping; idempotent for the same
  item, `409 BARCODE_EXISTS` if already mapped to a different item).
- `server/migrations/2026-07-07-item-barcodes.sql` + `run-2026-07-07-item-barcodes.cjs`
  — creates the `item_barcodes` table and a standalone runner script.
- `src/gs1.js` — ESM copy of the parser bundled by Vite for the frontend (kept in
  sync with `server/gs1.js` by hand; no shared module between the two runtimes).
- `src/api.js` — `lookupBarcode(code)` and `registerBarcode({ barcode, itemId,
  barcodeType })` exports (only HTTP boundary, per project convention).
- `src/BarcodeScanner.jsx` — reusable scan input: accepts USB keyboard-wedge input
  (fast keystrokes + Enter) and, optionally, opens the device camera via
  `@zxing/browser`/`@zxing/library` for a live GS1 DataMatrix/128 decode.
- `src/BarcodeReceive.jsx` — new "Barkodla Teslim Al" screen: scan → resolve (known
  barcode) or search-and-match (unknown barcode, writes the mapping) → prefilled
  LOT/SKT/open-purchase picker → quantity → `Teslim Al`.
- `src/App.jsx` — route/nav entry for the new screen; existing Teslim Al modal also
  gained an optional scan-to-prefill path with a product-mismatch warning when a
  scanned barcode is already mapped to a different item than the one being received.
- `package.json` / `package-lock.json` — new dependencies `@zxing/browser` (^0.2.1)
  and `@zxing/library` (^0.23.0) for camera-based decoding.

## DB changes
New table `item_barcodes` (barcode → itemId mapping, unique on `barcode`, FK to
`item_definitions(id)` with `ON DELETE CASCADE`).

**Must be run on production (SkvcLabInvWeb01) at deploy time:**
```bash
node server/migrations/run-2026-07-07-item-barcodes.cjs
```

### Rollback SQL
```sql
DROP TABLE item_barcodes;
```
(No other schema was touched; `POST /api/receive-goods`, `lots`, `purchases`,
`receipts` are all pre-existing and unmodified.)

## Test steps

### A. API end-to-end (executed against the local test DB, 2026-07-07)
Ran without a browser at the API level (same data-flow assertions as the manual
browser click-through below). Server: `npm run server` on port 5000, local MySQL
(`order_Tracking`). A throwaway `e2e_admin` (role ADMIN, bcrypt-hashed password) was
seeded via a scratch script, used only for auth, and deleted afterward along with all
test rows.

1. **Unknown GS1 scan** — `GET /api/barcodes/010409999999999010LOTA%1D17271200`
   (raw element string: AI01 GTIN `04099999999990`, AI10 lot `LOTA`, GS, AI17 expiry
   `271200`) → **PASS**: `404 BARCODE_NOT_FOUND` with
   `parsed.gtin="04099999999990"`, `parsed.lotNumber="LOTA"`,
   `parsed.expiryDate="2027-12-31"`.
2. **Learn** — `POST /api/barcodes {barcode:"04099999999990", itemId:<ITEM>,
   barcodeType:"GTIN"}` → **PASS**: `200`. Re-`GET` the same scan URL → **PASS**:
   `200`, `matchedBy="barcode"`, `item.id=<ITEM>`, `openPurchases` array present.
3. **Open purchase** — created a purchase request for `<ITEM>` and drove
   `POST /api/purchases/:id/approve` with `{supplierName, orderedQty:10}` (legacy
   approve+order path) → **PASS**: reached `SIPARIS_VERILDI` with `orderedQty=10`.
4. **Receive lot A** — `POST /api/receive-goods {purchaseId, itemId, lotNumber:
   "E2E-LOTA", quantity:4, expiryDate:"2027-12-31", receivedBy:"e2e"}` → **PASS**:
   `200`, `lot.currentQuantity="4.00"`, `purchase.status="KISMI_TESLIM"`.
5. **Receive lot B** (same product, different lot) — same call with
   `lotNumber:"E2E-LOTB", quantity:3` → **PASS**: `200`, a **different** `lot.id`,
   `currentQuantity="3.00"`.
6. **Top-up lot A** — same call again with `lotNumber:"E2E-LOTA", quantity:2` →
   **PASS**: `200`, **same** `lot.id` as step 4, `currentQuantity="6.00"`,
   `initialQuantity="6.00"` (existing-lot top-up, no third row).
7. **Duplicate mapping conflict** — `POST /api/barcodes` with the same barcode and a
   *different* itemId → **PASS**: `409 BARCODE_EXISTS` with the currently-mapped
   item. Re-`POST` with the *original* itemId → **PASS**: `200` (idempotent
   re-registration).
8. **Parser regression** — `node --test server/gs1.test.js` → **PASS**: 13/13.

All test rows (barcode mapping, lots `E2E-LOTA`/`E2E-LOTB`, their receipts, the test
purchase, and the `e2e_admin` user) were deleted afterward and deletion was verified
(`0` rows remaining for each).

### B. In-browser checklist (manual — left for a human with a camera/scanner)
With `npm run server` + `npm run dev` running, logged in as ADMIN:
1. Bir ürün için `SIPARIS_VERILDI` durumunda açık bir satın alma talebi bulun/oluşturun.
2. **Barkodla Teslim Al** ekranını açın, `(01)04099999999990(17)271200(10)LOT-A` barkodunu
   okutun → "Barkod tanınmadı" mesajı görünmeli → ürünü arayın → **Eşleştir** → ekran
   ürüne, açık siparişine, LOT `LOT-A` ve SKT `2027-12-31` alanları önceden doldurulmuş
   şekilde geçmeli → miktarı girin → **Teslim Al**. LOT Stok sekmesinde yeni `LOT-A`
   satırını doğru miktar/SKT ile doğrulayın.
3. Aynı ürün için `(01)04099999999990(17)281200(10)LOT-B` okutun (öğrenilmiş barkod) →
   anında eşleşmeli → teslim alın → **ikinci** bir `LOT-B` satırı oluşmalı, `LOT-A`
   değişmemeli.
4. `LOT-A` barkodunu tekrar okutup 1 birim daha teslim alın → `LOT-A.currentQuantity`
   artmalı, üçüncü bir satır oluşmamalı.
5. Teslim Al modalını başka bir sipariş üzerinden açın, bir GS1 barkodu okutun → LOT/SKT
   alanları dolmalı; farklı bir ürüne kayıtlı bir barkodu okutunca ürün uyuşmazlığı
   uyarısı görünmeli.
6. Kamera ile tarama **HTTPS gerektirir** — production'da (SkvcLabInvWeb01) kamera modu
   sadece HTTPS üzerinden test edilmeli; USB barkod okuyucu (klavye-emülasyon) HTTP'de de
   çalışır, bu nedenle üretimde HTTPS'e kadar öncelikli test yolu USB okuyucudur.
7. `node --test server/gs1.test.js` son bir kez çalıştırıp 13/13 geçtiğini doğrulayın.

## Risks
- **USB scanner configuration:** many keyboard-wedge scanners do NOT transmit the
  GS1 FNC1/GS control character (ASCII 29) as a keystroke by default. If GS is
  dropped, a GS1-128 element string where the lot number is followed by another AI
  (e.g. `(01)…(10)LOTA(GS)(17)271200`) parses with the lot absorbing the trailing
  AIs (lot becomes `LOTA17271200`). During hardware verification, compare the
  prefilled LOT/SKT against the printed label; if GS is stripped, configure the
  scanner to transmit it (or to emit AIM symbology prefixes `]C1`/`]d2`) — see the
  scanner vendor's programming guide.
- Camera-based scanning requires HTTPS in the browser (`getUserMedia` is blocked on
  plain HTTP for non-localhost origins) — will not work on production
  (SkvcLabInvWeb01) until it's served over HTTPS. The USB keyboard-wedge scanner path
  is unaffected (it's just keystrokes + Enter, no camera API).
- New runtime dependencies `@zxing/browser` and `@zxing/library` — only loaded by the
  camera-scan code path; no effect on existing bundle behavior if camera scanning is
  never invoked.
- `POST /api/receive-goods` itself is untouched by this feature; all new behavior is
  additive (new table, two new routes, new frontend screens/components).
- `item_barcodes.barcode` is globally unique — a barcode can only ever map to one
  item. If a supplier reuses a GTIN across genuinely different catalog items, the
  learning flow will surface `409 BARCODE_EXISTS` rather than silently allowing a
  second mapping; the user must resolve the conflict manually (this was verified in
  API test step 7 above).
