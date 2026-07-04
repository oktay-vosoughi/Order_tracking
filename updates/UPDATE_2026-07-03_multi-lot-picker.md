## UPDATE_2026-07-03_multi-lot-picker

- **Summary:** Replace single lot dropdown with multi-row `[lot select | qty | ✕]` picker in all three distribution UIs (CEP DEPO modal, General Dağıt modal, Dağıtım tab table). Backend validates and deducts each named lot exactly — no auto-spillover in explicit mode.
- **Files touched:**
  - `src/api.js` — `distributeToCepDepo`, `distributeApprovedRequest`: added `lots` param to signature and JSON body
  - `server/index.js` — `POST /api/distribute`: added `lots` to destructure; added explicit multi-lot branch before `if (lotId && !useFefo)`. `POST /api/cep-depo/distribute`: added explicit multi-lot branch before `if (lotId)`.
  - `src/App.jsx` — replaced `cepReqLot` state with `cepReqLots`; added `getCepLotRows`, `setCepLotRow`, `addCepLotRow`, `removeCepLotRow` helpers; replaced `distributeForm.lotId` with `distributeForm.lotRows`; added `addDistLotRow`, `removeDistLotRow`, `setDistLotRow` helpers; rewrote `approveAndDistributeCepRequest` and `distributeItem` handlers; rewrote all three lot-picker UI sections.
- **DB changes:** none
- **Rollback SQL:** n/a
- **Test steps:**
  1. Open Dağıt modal for an item with ≥2 active lots.
  2. General Dağıtım section: enter Miktar=10, add two lot rows (e.g. Lot A qty=6, Lot B qty=4). Counter shows "Toplam: 10 / 10 koli" in green. Click Dağıt — succeeds.
  3. Mismatch test: set Miktar=10, lotRows total=9 — Dağıt button is disabled.
  4. CEP DEPO Talepleri section: add two lot rows for a request, set quantities summing to requestedQty. "Onayla & Dağıt" enables. Confirm dialog shows per-lot breakdown.
  5. Dağıtım tab: same multi-row picker in table cell. Works identically.
  6. Backend rejects if a named lot has insufficient stock (409 INSUFFICIENT_LOT_STOCK with lot name in message).
- **Risks:**
  - Old single-lot `lotId` path in both backend routes is still intact — `distribute` calls without `lots` array continue to work via existing spillover branch.
  - `cepReqLots` state does not auto-reset when changing the active item in the modal. Each purchaseId's rows persist in state until cleared on success or page reload — same behavior as old `cepReqLot`.
