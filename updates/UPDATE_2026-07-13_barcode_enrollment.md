# UPDATE 2026-07-13 — Barkod Eşleştirme (Bulk Barcode Enrollment Screen)

## Summary
Added a dedicated bulk-enrollment screen ("Barkod Eşleştirme") that lets a user work
through the full item catalog, select an item, scan its barcode, and immediately see
a ✓ + running counter as items get mapped in `item_barcodes`. This complements the
2026-07-07 barcode-assisted receiving flow: that flow learns mappings opportunistically
during receiving, one item at a time as goods arrive; this screen exists to let a user
front-load enrollment of the whole catalog in one sitting, with a "sadece eksik"
(missing-only) filter and automatic advance to the next unmapped item after each scan,
and a ✕ delete action to undo a mis-scan. No existing endpoint's behavior changed —
this is purely additive: one new read endpoint (`GET /api/item-barcodes`, list-all) and
one new delete endpoint (`DELETE /api/barcodes/:id`) alongside the pre-existing
`POST /api/barcodes` (mapping creation, already shipped 2026-07-07).

## Files touched
- `server/index.js` — `GET /api/item-barcodes` (list all barcode→item mappings,
  `{ barcodes: [{id, itemId, barcode, barcodeType}] }`, ordered by `createdAt DESC`)
  and `DELETE /api/barcodes/:id` (remove one mapping by id; `404 BARCODE_NOT_FOUND`
  if the id doesn't exist; `200 {ok:true}` on success). Both gated by the existing
  `canReceiveGoods` middleware (ADMIN, SATINAL_LOJISTIK, or `canReceive` flag), same
  as the pre-existing `POST /api/barcodes` and `GET /api/barcodes/:code`.
- `src/api.js` — `fetchItemBarcodes()` and `deleteBarcode(id)` exports (only HTTP
  boundary, per project convention); reuses the existing `registerBarcode(...)` for
  writes.
- `src/BarcodeEnroll.jsx` — new screen: loads `item_definitions` + `item_barcodes`,
  builds an itemId → mapped-barcodes index, shows a searchable/filterable item list
  (search by name/code/catalogNo, "sadece eksik" toggle), a selected-item panel with
  a `BarcodeScanner` input, a ✓ + counter on successful scan, a 409 conflict message
  when the scanned code is already mapped to a different item, a ✕ per mapped barcode
  to delete it (returning that item to "eksik"/missing), and auto-advance to the next
  missing item after a successful enrollment.
- `src/App.jsx` — route/nav entry for the new "Barkod Eşleştirme" screen.

## DB changes
**NONE.** Reuses the `item_barcodes` table created by the 2026-07-07 migration
(`server/migrations/2026-07-07-item-barcodes.sql`). No new columns, no new tables, no
migration to run on production for this change.

### Rollback
Not applicable at the DB level (no schema change). To roll back the feature itself,
revert the four files above; `item_barcodes` rows created via this screen are
indistinguishable from rows created via the receiving flow (same table, same shape) and
do not need cleanup on rollback.

## Test steps

### A. API end-to-end (executed against the local test DB, 2026-07-13)
Server: `npm run server` on port 5000 (already running from a prior session on this
branch), local MySQL (`order_Tracking`). Reused the scratch seed script from the
2026-07-07/receiving e2e work to upsert a throwaway `e2e_admin` (role ADMIN,
bcrypt-hashed password), used only for auth and deleted afterward. Existing item used
for tests: `id=3ce95b95-ae84-4f66-8e87-15c696f8f95f` ("10 cc.'lik enjektör", ITEM_A);
a second existing item `id=8e6e001f-649e-44ae-b75d-8b646907f0d9` (ITEM_B) was used only
as the "different item" in the conflict test.

1. **Baseline list** — `GET /api/item-barcodes` → **PASS**: `200`,
   `{"barcodes":[]}` (array, empty at the time of the run).
2. **Create mapping** — `POST /api/barcodes {barcode:"04053228028253",
   itemId:ITEM_A, barcodeType:"GTIN"}` → **PASS**: `200`,
   `{"id":"06738691-4c34-430c-80eb-fce15e84cc67","itemId":"3ce95b95-...","barcode":
   "04053228028253","barcodeType":"GTIN"}`. Re-`GET /api/item-barcodes` → **PASS**:
   row present with `itemId=ITEM_A`.
3. **Conflict** — `POST /api/barcodes` same barcode, `itemId=ITEM_B` → **PASS**:
   `409`, `{"error":"BARCODE_EXISTS","mappedItem":{"id":"3ce95b95-...",
   "name":"10 cc.'lik enjektör"}}`.
4. **Delete** — `DELETE /api/barcodes/06738691-4c34-430c-80eb-fce15e84cc67` →
   **PASS**: `200 {"ok":true}`. Re-`GET /api/item-barcodes` → **PASS**:
   `{"barcodes":[]}` (row gone).
5. **Delete nonexistent** — `DELETE /api/barcodes/nonexistent-id-xyz` → **PASS**:
   `404 {"error":"BARCODE_NOT_FOUND"}`.
6. **Parser regression** — `node --test server/gs1.test.js` → **PASS**: 13/13
   (unchanged; this feature does not touch the GS1 parser).

All 6 assertions passed. Test row (`04053228028253` mapping) and the `e2e_admin` user
were deleted afterward; deletion verified (`0` rows remaining for both). The server
was stopped after the run. Full request/response evidence is in
`.superpowers/sdd/task-3-report.md`.

### B. In-browser checklist (manual — Türkçe, bir insan tarafından yapılmalı)
`npm run server` + `npm run dev` çalışırken, ADMIN veya SATINAL_LOJISTIK olarak giriş
yapıp **Barkod Eşleştirme** ekranını açın:
1. Ürün listesinden barkodu olmayan ("eksik") bir ürünü seçin → barkodunu okutun →
   ekranda ✓ görünmeli ve eşleştirilen ürün sayacı 1 artmalı.
2. Aynı barkodu farklı bir ürün seçiliyken tekrar okutun → "zaten eşleştirilmiş"
   (409 BARCODE_EXISTS) mesajı görünmeli, mevcut eşleşme değişmemeli.
3. Az önce eşleştirdiğiniz barkodun yanındaki ✕ ile eşleşmeyi silin → ürün tekrar
   "eksik" listesine dönmeli ve sayaç 1 azalmalı.
4. **"sadece eksik"** filtresini açın → yalnızca barkodu olmayan ürünler listelenmeli;
   filtreyi kapatınca tüm ürünler tekrar görünmeli.
5. Bir ürünü başarıyla eşleştirdikten sonra ekranın otomatik olarak bir sonraki
   eksik ürüne geçtiğini doğrulayın (elle seçim yapmadan).
6. `node --test server/gs1.test.js` çalıştırıp 13/13 geçtiğini son bir kez doğrulayın.

## Risks
- Purely additive: `GET /api/item-barcodes` is a read-only list query, and
  `DELETE /api/barcodes/:id` only removes a row from `item_barcodes` — it never
  touches `lots`, `receipts`, `purchases`, or any stock quantity. Deleting a mapping
  cannot affect on-hand stock; it only makes that item "eksik" again for future
  barcode lookups/receiving.
- `POST /api/receive-goods` and the 2026-07-07 barcode-assisted receiving flow
  (`BarcodeReceive.jsx`, `GET /api/barcodes/:code`, `POST /api/barcodes`) are
  completely untouched by this change; the new screen is a separate consumer of the
  same `item_barcodes` table and the same pre-existing write endpoint.
- Both new endpoints are gated by the same `canReceiveGoods` role check as the
  existing barcode endpoints, so no new role/permission surface was introduced.
- `item_barcodes.barcode` remains globally unique (from the 2026-07-07 migration),
  so the enrollment screen inherits the same conflict-on-reuse behavior verified in
  API test step 3 above — no silent double-mapping is possible.
