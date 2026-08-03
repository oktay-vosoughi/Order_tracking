# UPDATE 2026-08-03 — Barcode-scanned distribution to lab technicians

## Summary
Depot personnel can now **scan a box (phone camera or USB scanner) to distribute** it
to a lab technician. Scanning resolves the barcode → item and opens the existing
"Malzeme Dağıt" modal, which already lists that item's pending lab-tech requests
(one row per technician = the pick-list for "two people wanted the same product")
plus a generic/ad-hoc distribution section. Who distributed (`distributedBy`) and
who received (`recipientTechnicianId` + department) are recorded as before, and the
distribution stays linked to the request via `purchaseId`.

Added an **optional two-step receipt confirmation** feature (ADMIN-toggleable):
when ON, a distribution waits for the recipient technician to press "Teslim aldım"
before it is considered acknowledged; when OFF, behavior is unchanged (immediate).

Branch: `feature/barcode-receiving-test` (the branch where "Barkodla Teslim Al" /
"Barkod Eşleştirme" were tested), worktree `/Users/oktay.vav/Documents/Order_tracking/barcode-test`.

## What was reused (no rebuild)
- `BarcodeScanner` + `parseGs1` + `lookupBarcode` (already used by goods-receiving).
- `pendingCepRequestsByItem` grouping + the Dağıt modal's per-request "Onayla & Dağıt".
- `/api/distribute` and `/api/cep-depo/distribute` (already record who→whom→lot→request).

## Files touched
- `src/App.jsx`
  - New "Barkodla Dağıt" nav tab + render block (scanner → `handleDistributeScan`).
  - `handleDistributeScan()`: barcode → item → open Dağıt modal; stashes scanned
    GS1 LOT/SKT in `scanHint`, shown as a banner in the modal to guide parti pick.
  - New "Teslim Onayı" nav tab + render block (recipient's pending receipts).
  - `confirmReceipt()` and `toggleReceiptConfirmation()` handlers.
  - ADMIN "Sistem Ayarları" toggle in the Hesap (account) tab.
  - Loads `/api/settings` on login; `loadAllActionData` also loads pending confirmations.
- `src/api.js`
  - `fetchSettings`, `updateSetting`, `fetchPendingConfirmations`, `confirmCepReceipt`.
- `server/index.js`
  - `getSetting()` helper.
  - `ensureCepDepoTables()`: creates `app_settings` (+ seeds the flag) and adds
    `receivedConfirmedAt` / `receivedConfirmedBy` to `cep_depo_distributions`.
  - Both distribute routes set the confirmation columns per the flag
    (`NOW()`/distributedBy when OFF, `NULL` when ON).
  - New routes: `GET /api/settings`, `PUT /api/settings/:key` (ADMIN),
    `GET /api/cep-depo/pending-confirmations`,
    `POST /api/cep-depo/distributions/:id/confirm` (recipient or bypass role).
- `server/migrations/2026-08-03-distribution-receipt-confirmation.sql` (documentation;
  boot ensures the same schema idempotently).

## DB changes
- New table `app_settings (settingKey PK, settingValue, updatedBy, updatedAt)`;
  seeded `dist_receipt_confirmation = '0'`.
- New columns `cep_depo_distributions.receivedConfirmedAt DATETIME NULL`,
  `receivedConfirmedBy VARCHAR(100) NULL`.
- No changes to `purchases`, `distributions`, `lots`, or balances logic.

## Rollback SQL
```sql
DROP TABLE IF EXISTS app_settings;
ALTER TABLE cep_depo_distributions DROP COLUMN receivedConfirmedBy;
ALTER TABLE cep_depo_distributions DROP COLUMN receivedConfirmedAt;
```
(Code rollback: `git revert` / discard the commit. The scan tab and confirm tab
disappear; distribution routes fall back to their prior single-step behavior.)

## Test steps
1. Boot server (creates `app_settings` + columns). Log in as ADMIN/SATINAL_LOJISTIK.
2. As a lab tech, create a CEP DEPO request (dağıtım talebi) for an item; approve it.
3. Open **Barkodla Dağıt**, scan a box of that item (or type its barcode + Enter).
   → the Dağıt modal opens with the tech's request row. Pick the parti, "Onayla & Dağıt".
   → verify `cep_depo_distributions` row: `distributedBy` = you, `recipientTechnicianId`
     = the tech, `purchaseId` = the request; the request is `TESLIM_ALINDI`.
4. Scan an item with **two** pending requests → both rows show; distributing one closes
   only that request.
5. Scan an item with **no** request → use the generic "Departman / Genel Dağıtım" section
   (ad-hoc). Scan an unregistered barcode → "Barkod kayıtlı değil" message.
6. Two-step: ADMIN → Hesap → toggle "Teslim onayı" ON. Distribute again → the tech sees
   it under **Teslim Onayı**; "Teslim aldım" sets `receivedConfirmedAt`. Toggle OFF →
   distributions auto-confirm (column set at distribute time).

## Risks / notes
- Camera scanning needs HTTPS/localhost; USB keyboard-wedge scanners work anywhere.
- Barcode must be enrolled (Barkod Eşleştirme) to resolve to an item; unenrolled codes
  are reported, not silently dropped.
- Two-step confirmation credits the CEP DEPO balance and closes the request at
  **distribute** time (stock physically leaves the depot then); the confirmation is a
  receipt signature on `cep_depo_distributions`, not an inventory gate.
- `ALTER ... ADD COLUMN` in the migration is not idempotent on MySQL < 8.0.29; boot-time
  `ensureColumn` is the idempotent path (safe to ignore "Duplicate column" from the .sql).
