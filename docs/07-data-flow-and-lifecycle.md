# 07 — Data Flow & Lifecycle

Traces the main flows end-to-end: what fires in the UI, which endpoint it calls, which SQL runs, and which tables mutate.

## 1. Login / bootstrap

```
<App.jsx>
  fetchMe()  ──►  GET /api/auth/me
      │            └─ authRequired
      │
      ├── 401 and users table empty → show BOOTSTRAP form
      │     bootstrapAdmin(u,p) ──► POST /api/auth/bootstrap
      │       └─ INSERT users (role='ADMIN') + JWT
      │
      ├── 401 and users exist → show LOGIN form
      │     login(u,p) ──► POST /api/auth/login
      │       └─ bcrypt.compare + JWT
      │
      └── 200 → store user, load data for active tab
```

Token lives in `localStorage['auth_token']`; sent on every request via `apiFetch`.

## 2. Item definition create (admin/satinal)

```
UI Add form
  createItemDefinition(payload) ──► POST /api/item-definitions
     └─ INSERT item_definitions (id = generateId(), status='ACTIVE')
     └─ 409 DUPLICATE_CODE on unique key violation
UI refetch: fetchUnifiedStock() ──► GET /api/unified-stock
```

Mutates: `item_definitions`.

## 3. Lot create (manual or via receipt)

**Manual**:
```
POST /api/lots { itemId, lotNumber, initialQuantity, expiryDate, ... }
  INSERT lots (currentQuantity = initialQuantity, status='ACTIVE')
```

**Via receipt** (preferred for tracked purchases):
```
POST /api/receive-goods { purchaseId, receivedQty, lotNumber, expiryDate, ... }
  within one transaction:
    - INSERT or UPDATE lots
    - INSERT receipts (links purchaseId + lotId)
    - UPDATE purchases SET receivedQtyTotal = ..., status = KISMI_TESLIM | TESLIM_ALINDI
```

Mutates: `lots`, `receipts`, `purchases`.

## 4. Purchase request lifecycle

```
createPurchaseRequest ─► POST /api/purchases
  INSERT purchases (status='TALEP_EDILDI')

approvePurchase ─► POST /api/purchases/:id/approve   (canApprove)
  UPDATE purchases SET status='ONAYLANDI', approvedBy, approvedAt, approvalNote

rejectPurchase  ─► POST /api/purchases/:id/reject    (canReject)
  UPDATE purchases SET status='REDDEDILDI', rejectedBy, rejectedAt, rejectionReason

orderPurchase   ─► POST /api/purchases/:id/order     (canOrder)
  UPDATE purchases SET status='SIPARIS_VERILDI', supplierName, poNumber, orderedQty, orderedBy, orderedAt

(receive-goods)                                      (canOrder)
  see §3 — flips status to KISMI_TESLIM / TESLIM_ALINDI
```

Mutates: `purchases` (+ `receipts`, `lots` on receive).

## 5. Distribution / consumption (FEFO)

```
UI Distribute form
  distribute({ itemId, quantity, receivedBy, department, purpose, useFefo:true })
    POST /api/distribute   (canDistribute)
      withTransaction:
        - INSERT distributions (status='PENDING')
        - SELECT lots WHERE itemId AND status='ACTIVE' AND currentQuantity>0
            ORDER BY expiry-null last, expiryDate ASC, receivedDate ASC
            FOR UPDATE
        - loop: UPDATE lots SET currentQuantity -= take, status='DEPLETED' if 0
        - loop: INSERT distribution_lots (lotId, quantityUsed)
        - loop: INSERT usage_records (lotId, itemId, quantityUsed, usedBy)

UI Confirm: confirmDistribution(id) ─► POST /api/distribute/:id/confirm
  UPDATE distributions SET status='COMPLETED', completedBy, completedDate
```

Mutates: `distributions`, `distribution_lots`, `lots`, `usage_records`.

**Invariant**: `SUM(distribution_lots.quantityUsed) == distributions.quantity`.

## 6. Waste / disposal

```
recordWasteWithLot({ itemId, lotId, quantity, wasteType, reason, disposalMethod })
  POST /api/waste-with-lot   (canDistribute)
    withTransaction:
      - SELECT lot FOR UPDATE → assert currentQuantity >= quantity
      - UPDATE lots SET currentQuantity -= quantity, status='DEPLETED' if 0
      - INSERT waste_records
```

Mutates: `lots`, `waste_records`.

## 7. Lot adjustments (manual correction)

```
POST /api/lot-adjustments { lotId, adjustmentType, quantityChange, reason }
  UPDATE lots SET currentQuantity += quantityChange (signed)
  INSERT lot_adjustments (audit row)
```

- `quantityChange` may be negative (LOSS, DAMAGE) or positive (FOUND, CORRECTION).
- Verify whether the endpoint wraps this in a transaction.

## 8. Import pipeline (Excel → DB)

```
<Excel file picker in App.jsx>
  xlsx.read → rows
    buildLotImportPayload(rows)   (src/utils/lotExcelImporter.js)
      └ normalizes headers, dates via parseSKTDate, quantities
  importItems(payload)
    POST /api/import-items
      for each item:
        - INSERT item_definitions (skip/409 if code exists — verify)
        - INSERT lots (one or more; LEGACY-STOK vs HISTORICAL per memory)
```

Mutates: `item_definitions`, `lots`.

**Pitfalls**:
- Excel dates may arrive as serial numbers (e.g. 45000) — handled in `parseSKTDate`.
- If import-items endpoint lacks a role guard, OBSERVER can import — flag.

## 9. Attachments

```
client → base64-encode file → POST to host entity (receipt/lot/etc.)
  INSERT attachments (fileData = LONGTEXT base64, entityType, entityId)

GET /api/attachments/:entityType/:entityId
  SELECT * FROM attachments WHERE ...
```

- Body size cap: `5mb` (`express.json({ limit: '5mb' })`).
- Large files will 413.

## 10. Reporting / analytics pull

- Dashboard: `fetchAnalyticsOverview()` → `/api/analytics/overview` — multiple parallel SUM/COUNT queries.
- Tab filters call `/api/reports/*` endpoints.
- Views `v_stock_summary`, `v_purchase_summary` may be used server-side — verify availability in your DB.

## 11. Destructive flows (admin only)

- `POST /api/clear-all` — wipes nearly all tables. Used by "Tümünü Temizle" button.
- `DELETE /api/item-definitions/:id` — deletes item + cascades lots (which cascades usage_records, distribution_lots, lot_adjustments).
- `POST /api/state` — DELETE+INSERT rewrite of purchases/receipts/distributions/waste. Do not invoke unless doing a full migration.

## 12. Typical failure modes to watch

| Symptom | Likely cause |
|---|---|
| "Talep var" warning but no pending purchase visible | active purchase filter in UI (TALEP_EDILDI|ONAYLANDI); check `purchases.status`. |
| Stock shows 0 but lots exist | lots have `status != 'ACTIVE'` or `currentQuantity <= 0` or `expiryDate < today`. |
| FEFO chose a later-expiry lot | earlier-expiry lot had `status != 'ACTIVE'` or `currentQuantity == 0`. |
| 409 DUPLICATE_LOT on receipt | a lot with same `lotNumber` already exists for this item — consider updating the existing lot instead. |
| 413 Payload Too Large on attachment | file > 5 MB. Increase `express.json({ limit })` consciously or reject upload. |
| 500 after schema change | forgot to update one of: migration, `server/index.js` SQL, `src/api.js`, `App.jsx` form. |
