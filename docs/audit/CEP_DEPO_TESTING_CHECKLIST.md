# CEP DEPO — Manual Testing Checklist

> Companion to `CEP_DEPO_DESIGN.md` and `CEP_DEPO_IMPLEMENTATION_REPORT.md`.
> No automated test framework is configured for this repo, so the verification
> below is a **manual** smoke test. Replace `BASE` with your API base URL,
> e.g. `http://localhost:4000/api`. Use the JWT returned by login as
> `Authorization: Bearer <token>` on all calls.

## 0. Pre-flight

- [ ] Start MySQL.
- [ ] Start the API server. Verify the log shows `[ensureCepDepo] CEP DEPO schema verified.`
- [ ] Verify in MySQL: `SHOW TABLES LIKE 'cep_depo%';` returns 4 tables; `SHOW TABLES LIKE 'stock_movements';` returns 1.
- [ ] Verify columns: `DESCRIBE item_definitions;` shows `packageUnit`, `consumptionUnit`, `unitsPerPackage`, `consumptionUnitType`. `DESCRIBE lots;` shows the same three override columns. `DESCRIBE purchases;` shows `requestedFor`, `overrideReason`, `isCepDepoRequest`.

## 1. Roles

- [ ] Bootstrap or login as ADMIN.
- [ ] Promote a user to `LAB_TECHNICIAN` via `PATCH /api/users/:id { role: 'LAB_TECHNICIAN' }` **or** use the seed `labtech1` / `0000`.
- [ ] Confirm `GET /api/users` lists at least one ADMIN, SATINAL, SATINAL_LOJISTIK, OBSERVER, LAB_TECHNICIAN.
- [ ] Confirm `OBSERVER` users still exist and were **not** auto-converted.

## 2. Item master with pack / unit / test capacity

- [ ] As ADMIN, edit an item via the UI Item form (or `PUT /api/item-definitions/:id`) and set:
  - `packageUnit = 'KUTU'`
  - `consumptionUnit = 'TEST'`
  - `unitsPerPackage = 100`
  - `consumptionUnitType = 'TEST'`
- [ ] Verify `SELECT id, packageUnit, unitsPerPackage, consumptionUnitType FROM item_definitions WHERE id = '...';` returns the new values.

## 3. Distribute Main → CEP DEPO

- [ ] As SATINAL_LOJISTIK (or ADMIN), `POST /api/cep-depo/distribute { labTechnicianId: <id>, itemId: '<id>', packQty: 2 }` for an item that has at least 2 packs in `lots`.
- [ ] Expected response: `{ cepDistributionId, packQty: 2, unitQty: 200, splits: 1 }` (200 = 2 × 100 unit factor).
- [ ] Verify `cep_depo_balances` has a row with `(labTechnicianId, itemId)` → `packQty=2, unitQty=200, status='ACTIVE'`.
- [ ] Verify the corresponding `lots.currentQuantity` decreased by 2.
- [ ] Verify a row in `stock_movements` with `movementType='DISTRIBUTE_CEP'`, `fromLocation='MAIN_DEPOT'`, `toLocation='CEP_DEPO'`.

## 4. Request-block (lab technician)

- [ ] Login as the LAB_TECHNICIAN that just received stock.
- [ ] `POST /api/purchases { itemId: '<same item>', requestedQty: 1 }` → expect **409 CEP_DEPO_HAS_STOCK** with a Turkish message and `remainingPackQty: 2, remainingUnitQty: 200`.
- [ ] `POST /api/purchases { itemId: '<a DIFFERENT item with no CEP balance>', requestedQty: 1 }` → expect **200 OK** and a `purchases` row with `isCepDepoRequest=1`, `requestedFor=<lab tech username>`.

## 5. Override (admin / satinal)

- [ ] Login as SATINAL.
- [ ] `POST /api/purchases { itemId: '<the blocked item>', requestedQty: 1, requestedFor: '<labtech username>' }` (no `overrideReason`) → expect **400 OVERRIDE_REASON_REQUIRED**.
- [ ] Same call with `overrideReason: "Acil ihtiyaç"` → expect **200 OK**.
- [ ] Verify the new purchase row has `requestedFor=<labtech username>`, `overrideReason='Acil ihtiyaç'`.
- [ ] Verify a row in `stock_movements` with `movementType='REQUEST_OVERRIDE'`, `notes='Acil ihtiyaç'`, `requestId=<purchase id>`.
- [ ] Login as SATINAL_LOJISTIK and try the same override call → expect **403 OVERRIDE_FORBIDDEN**.

## 6. Consume

- [ ] Login as the LAB_TECHNICIAN.
- [ ] `POST /api/cep-depo/consume { itemId: '<item>', consumptionUnitType: 'TEST', quantity: 30 }`.
- [ ] Expected: `unitQty 200 → 170`, `packQty 2 → 1.7`. Status stays `ACTIVE`.
- [ ] Verify `cep_depo_consumptions` row with `quantity=30, unitDelta=30, packDelta≈0.30`.
- [ ] Verify `stock_movements` row with `movementType='CONSUME'`, `fromLocation='CEP_DEPO'`, `toLocation='CONSUMED'`.
- [ ] `POST /api/cep-depo/consume { itemId: '<item>', consumptionUnitType: 'TEST', quantity: 9999 }` → expect **409 INSUFFICIENT_CEP_BALANCE**.
- [ ] As another LAB_TECHNICIAN, try to consume from the first technician's stock → expect **409 INSUFFICIENT_CEP_BALANCE** (because their own balance is empty).

## 7. Return

- [ ] As LAB_TECHNICIAN, `POST /api/cep-depo/return { itemId: '<item>', packQty: 1 }`.
- [ ] Verify the most recently received lot for that item has its `currentQuantity` increased by 1 (and status flipped to ACTIVE if it was DEPLETED).
- [ ] Verify the technician's `cep_depo_balances.packQty` decreased by 1.
- [ ] Verify a `stock_movements` row with `movementType='RETURN_CEP'`.

## 8. UI smoke

- [ ] Login as LAB_TECHNICIAN. Click the **CEP DEPO** tab. Confirm "CEP DEPO Bakiyem" lists my balances; the consume / return / request forms render and post correctly.
- [ ] Login as SATINAL_LOJISTIK. Click **CEP DEPO**. Confirm the all-balances table shows entries for every technician; the "Ana Depodan CEP DEPOya Dağıt" form works; the override form is **not** shown (only ADMIN + SATINAL).
- [ ] Login as SATINAL. Confirm the override form is shown.
- [ ] Login as OBSERVER. Confirm balances + movements are visible but the distribute / override forms are not shown.
- [ ] Confirm the **Kullanıcılar** dropdown now includes "LAB_TECHNICIAN".

## 9. Negative paths

- [ ] `POST /api/cep-depo/distribute` to a user whose role is NOT `LAB_TECHNICIAN` → expect **400 LAB_TECHNICIAN_REQUIRED**.
- [ ] `POST /api/cep-depo/distribute` for a `packQty` larger than total lot stock → expect **409 INSUFFICIENT_MAIN_STOCK**.
- [ ] `POST /api/cep-depo/consume` with `consumptionUnitType: 'INVALID'` → expect **400 INVALID_UNIT_TYPE**.
- [ ] As OBSERVER, `POST /api/cep-depo/distribute` → expect **403 FORBIDDEN**.

## 10. Cleanup

- [ ] Optional: `DELETE FROM users WHERE username = 'labtech1';` after smoke testing in production.
- [ ] Optional: re-run the migration. The `IF NOT EXISTS` and column existence guards must keep it idempotent.
