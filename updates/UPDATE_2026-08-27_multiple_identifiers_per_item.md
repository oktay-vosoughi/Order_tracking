# UPDATE 2026-08-27 — Multiple Identifiers per Item

## Summary
- The barcode enrollment screen now keeps the selected product active after a successful scan, allowing glass, plastic, or other package variants to be registered consecutively against one stock item.
- Staff can also type an alternate catalog number and press Enter to register it as another identifier for the same item.
- The screen shows both the number of products with an identifier and the total identifier count, and provides an explicit action to continue to the next missing product.
- Registered barcodes are now searchable in the main Stock list, LOT Stock item/lot views, Barcode Enrollment, and CEP DEPO balance/movement views.

## Scope / project
- Repository: `Order_tracking`.
- Scope: barcode enrollment, shared product search, stock API responses, and stock/LOT Stock search screens.
- Stock, lots, purchases, and existing barcode API behavior are unchanged.

## Files touched
- `src/BarcodeEnroll.jsx` — supports consecutive identifiers for one selected product and clarifies the package/catalog alias workflow.
- `src/barcodeEnrollment.mjs` — pure filtering and next-missing selection helpers.
- `src/barcodeEnrollment.test.mjs` — regression coverage for multiple identifiers and missing-only behavior.
- `src/itemSearch.mjs` — shared name/code/catalog/barcode product matching.
- `src/itemSearch.test.mjs` — regression coverage for barcode-based product search.
- `src/App.jsx` — main Stock search now matches registered barcodes.
- `src/LotInventory.jsx` — item and lot views can find a product through its registered barcode.
- `src/CepDepo.jsx` — balance and movement filters can find a product through any registered barcode.
- `server/index.js` — item-definition and unified-stock responses include each item's registered `barcodes[]`.
- `docs/04-backend-and-api.md` — documents the `barcodes[]` response field.
- `docs/05-database-model.md` — documents the existing `item_barcodes` table and uniqueness rule.
- `updates/UPDATE_2026-08-27_multiple_identifiers_per_item.md` — implementation, rollback, and test notes.

## DB changes (if any)
- None. The existing `item_barcodes` table already supports many barcode rows pointing to one `item_definitions` row.
- No migration is required.
- Rollback SQL: not applicable.

## How to revert
1. Revert the changes to `src/BarcodeEnroll.jsx`.
2. Remove `src/barcodeEnrollment.mjs` and `src/barcodeEnrollment.test.mjs`.
3. Restart the frontend with `npm run dev`.
4. Verify that the former automatic-advance behavior returns after the first successful scan.

Existing `item_barcodes` rows do not need to be deleted when reverting. Removing a mapping would change future barcode recognition and is therefore intentionally not part of rollback.

## Test steps performed
- `npm test` — passed: 97 tests, 0 failures.
- `npm run build` — run as part of final verification.
- Regression tests verify that:
  - a selected product remains visible in the missing-only view after its first identifier;
  - the manual next action skips products that already have identifiers;
  - the manual next action respects catalog-number search.
  - product search matches either of multiple registered barcodes;
  - a full GS1 scan matches the product's stored GTIN even when the scan also contains LOT/SKT data;
  - name, item-code, and catalog-number search continue to work.

## Manual QA checklist
1. Enable the `Barkodlu Mal Kabul` module and open **Barkod Eşleştirme** as an authorized user.
2. Select one product and scan its glass-package barcode; confirm it appears as a green identifier chip.
3. Without selecting the product again, scan its plastic-package barcode; confirm both chips remain under the same product.
4. Type an alternate catalog number in the same input and press Enter; confirm it becomes a third identifier.
5. Scan any of those identifiers in **Barkodla Teslim Al**; each should resolve to the same product.
6. Select another product and try to reuse one of the identifiers; confirm the API returns the existing conflict message and does not remap it.
7. Paste either registered barcode into the search field on **Stok**, **LOT Stok**, **Barkod Eşleştirme**, and the CEP DEPO balance/movement views; confirm the same product is returned in each screen.

## Risks / open questions
- An alternate catalog number registered here is stored as an `OTHER` identifier in the existing `item_barcodes` table; the primary `item_definitions.catalogNo` field is not replaced.
- Identifier values remain globally unique. One barcode or catalog alias cannot point to two products.
- Browser-level manual QA still requires a running API and database with the barcode module enabled.
