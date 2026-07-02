# Design — Explicit Lot / SKT selection at Distribute (Dağıt)

**Date:** 2026-07-02
**Author:** oktai.vosoughi (with Claude)
**Status:** Approved for planning

---

## 1. Problem

Today, both distribution paths pick lots automatically by **FEFO** (earliest expiry
first). But the physical depot is **not** organized or consumed in FEFO order, so the
system silently reports that stock left an earlier-expiry lot when in reality the
distributor pulled from a different physical lot. This makes lot traceability wrong.

**Goal:** At the **Dağıt** step, the distributor (SATINAL_LOJISTIK, plus ADMIN) must
**explicitly choose which lot (Parti) / SKT they are physically distributing from**,
and the system decrements **exactly that lot** — never an auto-FEFO guess.

## 2. Scope

Both distribution flows in the **"Malzeme Dağıt"** modal (`src/App.jsx`):

1. **CEP DEPO "Onayla & Dağıt"** — routes to a lab technician's department pool
   (`approveAndDistributeCepRequest` → `distributeApprovedRequest` →
   `POST /api/cep-depo/distribute`). **Needs new backend work** — this endpoint is
   FEFO-only today.
2. **General "Departman / Genel Dağıtım → Dağıt"** — (`distributeItem` →
   `distribute` → `POST /api/distribute`). Backend already supports manual lot
   selection via `lotId` + `useFefo:false`; only the frontend selector is missing.

**Out of scope:** the CEP DEPO *consume* flow, waste flow, and receive-goods. FEFO
auto-selection code paths remain in the backend as a fallback but the UI will no
longer trigger them.

## 3. Non-goals / decisions locked

- **No FEFO auto-pick at distribute.** Explicit lot selection is **required**.
- **Selection granularity = per individual Parti (lot).** Each dropdown row shows both
  the Parti and its SKT. Since each lot carries exactly one SKT, "choose by lot" and
  "choose by SKT" collapse into one row. Two lots that share an SKT appear as two rows.
  No separate "SKT group spanning multiple lots" mode.
- **One distribution = one lot.** If the requested quantity exceeds the selected lot's
  available amount, the action is **blocked** with a Turkish message telling the user
  to split into separate Dağıt actions. No multi-lot ticking, no spill into other lots.

## 4. Data source (no new endpoint)

Reuse the existing `GET /api/unified-stock/:itemId/lots` (`fetchItemLots(itemId)` in
`src/api.js`). It already returns every lot for an item with `lotNumber` (Parti),
`expiryDate` (SKT), `currentQuantity`, `status`, and a derived `expiryStatus`,
FEFO-ordered.

**Client-side filter for distributable lots:** `status === 'ACTIVE'` AND
`currentQuantity > 0` AND not expired (`expiryDate` null or `>= today`). Expired lots
are **excluded** from the selectable list, mirroring the backend's
`expiryDate >= CURDATE()` guard on the general distribute path.

## 5. UI — "Malzeme Dağıt" modal

When the modal opens for an item, fetch its lots once and hold them in local state.

### 5a. Picker component (shared by both sections)
A `<select>` (or equivalent) labeled **"Parti / SKT Seçimi *"** whose options are one
row per distributable lot:

```
Parti {lotNumber} · SKT {dd.mm.yyyy} · {qty} {birim} mevcut
```

- No "FEFO otomatik" option.
- If the item has exactly **one** distributable lot, it is pre-selected.
- If the item has **zero** distributable lots, show a message and disable Dağıt.
- The **Dağıt** / **Onayla & Dağıt** buttons are disabled until a lot is selected.

### 5b. General distribution section
`distributeForm` gains a `lotId` field. On submit, `distributeItem` validates:
- a lot is selected,
- `quantity > 0`,
- `quantity <= selectedLot.currentQuantity` (else block with message).

Then calls `distribute({ ..., lotId, useFefo: false })`.

### 5c. CEP DEPO request rows
Each pending CEP request row gets its own lot selector (state keyed by
`purchase.id`, mirroring the existing `cepReqQty` pattern). Same quantity-vs-lot
validation. `approveAndDistributeCepRequest` passes the chosen `lotId`.

## 6. Backend changes

### 6a. `POST /api/distribute`
No change. Frontend now always sends `lotId` + `useFefo:false`; the existing manual
branch (index.js ~1607) handles it, including `SELECT ... FOR UPDATE` and the
insufficient-stock check.

### 6b. `POST /api/cep-depo/distribute`  ← new work
Accept an optional `lotId` in the body.
- **When `lotId` present:** `SELECT * FROM lots WHERE id = ? AND itemId = ? FOR UPDATE`.
  Validate it exists, is ACTIVE, and `currentQuantity >= packQty` (else
  `409 INSUFFICIENT_LOT_STOCK` with Turkish message). Deduct only from that lot,
  set `DEPLETED` if it hits zero, and write the single `cep_depo_distribution_lots`
  line for it. All downstream steps (`cep_depo_distributions` header,
  `cep_depo_balances` upsert, `stock_movements`, purchase status update) are
  **unchanged**.
- **When `lotId` absent:** existing FEFO loop, untouched (fallback only).

The whole operation stays inside the existing `withTransaction`.

### 6c. `src/api.js`
Add optional `lotId` to the request bodies of `distributeToCepDepo(...)` and
`distributeApprovedRequest(...)`.

## 7. Error handling

| Condition | Behavior |
|-----------|----------|
| No lot selected | Dağıt button disabled; guard in handler |
| Item has no distributable lots | Message shown; Dağıt disabled |
| quantity > selected lot available | Block, Turkish message: split into separate distributions |
| Lot not found / not ACTIVE (server) | `404 LOT_NOT_FOUND` / `409` with message |
| Concurrent depletion | `SELECT ... FOR UPDATE` + re-check inside txn |

## 8. Testing / DoD

**Definition of Done:**
- In both flows, the distributor must pick a Parti/SKT row before distributing.
- Distributing decrements exactly the chosen lot; other lots untouched.
- Over-quantity is blocked in UI and re-validated server-side.
- CEP DEPO balance, stock_movements, and distribution_lots reflect the chosen lot.
- FEFO fallback still works if `lotId` omitted (backward compatibility).

**Manual test path (dev):**
1. Item with ≥2 lots of different SKT. Open Dağıt.
2. Pick the *later*-expiry lot; distribute a valid qty → only that lot decrements.
3. Try qty > that lot's available → blocked with message.
4. CEP DEPO request row: pick a specific lot → confirm that lot decrements and the
   department pool balance rises by the correct pack/unit amounts.
5. Confirm `cep_depo_distribution_lots` line references the chosen `lotId`.

## 9. Files touched

- `src/App.jsx` — lot state + picker UI in both modal sections; `distributeItem`,
  `approveAndDistributeCepRequest` handlers; `distributeForm` shape.
- `src/api.js` — `distributeToCepDepo` / `distributeApprovedRequest` `lotId` param.
- `server/index.js` — `POST /api/cep-depo/distribute` manual-lot branch.
- `updates/UPDATE_2026-07-02_distribute-lot-skt-selection.md` — change log (per CLAUDE.md §5).

## 10. Risks

- **Coupling:** `/api/distribute` also auto-routes to CEP DEPO when the receiver is a
  lab technician (index.js ~1669). Passing `lotId` there must still feed the correct
  single lot into that mirror logic — verify the `distributionLots` array (now a single
  entry) flows correctly into the `cep_depo_distribution_lots` insert.
- **Backward compatibility:** other callers of `/api/cep-depo/distribute` without
  `lotId` must keep working (FEFO fallback preserved).
- No DB schema change; no migration required.
