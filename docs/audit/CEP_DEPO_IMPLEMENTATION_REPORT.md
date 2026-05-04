# CEP DEPO — Implementation Report

> Companion to `CEP_DEPO_DESIGN.md`. Lists exactly what changed, where, and how
> to verify. All decisions made with the product owner are encoded here.

## 1. Decisions in effect

| # | Decision | Source |
|---|---|---|
| 1 | `LAB_TECHNICIAN` is a **new** role. `OBSERVER` is kept untouched. Existing OBSERVER users are **not** auto-migrated. | Conversation Q1 |
| 2 | Two depots are kept distinct: **MAIN_DEPOT** (existing `lots`) and **CEP_DEPO** (new per-technician balance). Every movement is logged with operator + technician + timestamp + (optional) request id. | Conversation Q2 |
| 3 | Pack/unit/test-capacity has a **default on `item_definitions`** and **per-receipt override on `lots`**. Resolver: `lots.unitsPerPackage > item_definitions.unitsPerPackage > 1`. | Conversation Q3 |
| 4 | Request-block override is permitted for **ADMIN or SATINAL** with mandatory `overrideReason`. Override creates a `REQUEST_OVERRIDE` row in `stock_movements`. | Conversation Q4 |
| 5 | Delivered as a single all-in-one cycle. | Conversation Q5 |

## 2. Files added

| Path | Purpose |
|---|---|
| `docs/audit/CEP_DEPO_DESIGN.md` | Full design spec (workflow, ER, business rules, error codes, sequence diagram). |
| `docs/audit/CEP_DEPO_IMPLEMENTATION_REPORT.md` | This file. |
| `docs/audit/CEP_DEPO_TESTING_CHECKLIST.md` | Manual + scripted test plan. |
| `server/migrations/add_cep_depo_system.sql` | Idempotent SQL migration (alters + new tables + LAB_TECHNICIAN seed user). |
| `src/CepDepo.jsx` | New React panel rendering lab-tech, satınalma, admin and observer views. |

## 3. Files modified

| Path | Change |
|---|---|
| `server/index.js` | Added `LAB_TECHNICIAN` to `ROLES` + `ALL_ROLES`; added `canDistributeToCepDepo`, `canOverrideRequestBlock`, `isLabTechnicianRole`. Replaced `POST /api/purchases` with version that enforces CEP DEPO balance block + override flow. Added `ensureCepDepoTables()` (idempotent column/table creation). Added new endpoints `/api/cep-depo/{balances,my-balances,distribute,consume,return,movements,distributions,consumptions}` and `/api/lab-technicians`. Hooked startup. Updated user-create / user-patch valid-role lists. |
| `src/api.js` | Added wrappers: `fetchLabTechnicians`, `fetchCepDepoBalances`, `fetchMyCepDepoBalances`, `distributeToCepDepo`, `consumeFromCepDepo`, `returnFromCepDepo`, `fetchCepDepoMovements`, `fetchCepDepoDistributions`, `fetchCepDepoConsumptions`, `createPurchaseRequestForLabTech`. |
| `src/App.jsx` | Added `isLabTechnician` flag, role chip class, ROLE_LABELS entry, dropdown option in user-create, **CEP DEPO** tab button (visible to all), and `<CepDepo />` content panel. Imports `CepDepo`. |
| `docs/audit/USER_ROLES_AND_PERMISSIONS.md` | Added §4.5 with the LAB_TECHNICIAN role row and the permission-delta table. |

## 4. Database tables / columns added

### Altered
- `item_definitions` + `packageUnit`, `consumptionUnit`, `unitsPerPackage`, `consumptionUnitType` (default `'PACK'`).
- `lots` + `packageUnit`, `unitsPerPackage`, `consumptionUnitType` (per-lot override).
- `purchases` + `requestedFor`, `overrideReason`, `isCepDepoRequest`.

### New
- `cep_depo_balances` — per-technician/per-item snapshot. Unique key `(labTechnicianId, itemId)`.
- `cep_depo_distributions` — header per main→cep event.
- `cep_depo_distribution_lots` — FEFO split lines.
- `cep_depo_consumptions` — lab-tech usage events.
- `stock_movements` — unified ledger. Movement types: `RECEIVE`, `DISTRIBUTE_CEP`, `CONSUME`, `RETURN_CEP`, `ADJUSTMENT`, `WASTE`, `REQUEST_OVERRIDE`.

The migration is idempotent. It is applied automatically on server boot via `ensureCepDepoTables()`; the SQL file is also kept for DBA review or manual replay.

## 5. New endpoints (auth required on all)

| Method | Path | Roles allowed |
|---|---|---|
| GET | `/api/lab-technicians` | All authenticated |
| GET | `/api/cep-depo/balances` | All; LAB_TECHNICIAN sees only own |
| GET | `/api/cep-depo/my-balances` | All (own row only) |
| POST | `/api/cep-depo/distribute` | ADMIN, SATINAL, SATINAL_LOJISTIK |
| POST | `/api/cep-depo/consume` | LAB_TECHNICIAN (own), ADMIN (any technician) |
| POST | `/api/cep-depo/return` | LAB_TECHNICIAN (own), ADMIN, SATINAL, SATINAL_LOJISTIK |
| GET | `/api/cep-depo/movements` | All; LAB_TECHNICIAN filtered to own |
| GET | `/api/cep-depo/distributions` | All; LAB_TECHNICIAN filtered to own |
| GET | `/api/cep-depo/consumptions` | All; LAB_TECHNICIAN filtered to own |

`POST /api/purchases` is now **role-gated inside the handler** (instead of `canRequest` middleware) so LAB_TECHNICIAN can request, but with the CEP DEPO balance check.

### 5.1 `/api/distribute` auto-routing to CEP DEPO

The existing department-distribution endpoint now accepts two optional fields and performs CEP DEPO bookkeeping automatically when the receiver is a `LAB_TECHNICIAN`:

| Field | Meaning |
|---|---|
| `purchaseId` | If set, the linked request is marked `TESLIM_ALINDI` and `receivedQtyTotal` is incremented. |
| `labTechnicianId` | Explicit target. If omitted, the server resolves `receivedBy` as a username and checks whether that user has role `LAB_TECHNICIAN`. |

When a lab technician is resolved, in the **same transaction** as the main-depot deduction the endpoint also:

1. Writes a `cep_depo_distributions` header row and one `cep_depo_distribution_lots` line per FEFO split.
2. Upserts `cep_depo_balances` for `(labTechnicianId, itemId)` (packs + units; units derived via `resolveUnitFactor`).
3. Writes a `stock_movements` row with `movementType='DISTRIBUTE_CEP'`, `fromLocation='MAIN_DEPOT'`, `toLocation='CEP_DEPO'`.
4. Marks the `distributions` row as `COMPLETED` and appends `[CEP DEPO]` to `purpose` so the legacy pending-distribution list doesn't keep showing it.
5. If `purchaseId` was passed, also marks the purchase as `TESLIM_ALINDI`.

The response now includes a `cep` field (null for non-lab-tech receivers):

```json
{
  "distributionId": "...",
  "distributionLots": [...],
  "totalDistributed": 2,
  "cep": {
    "routedToCepDepo": true,
    "cepDistributionId": "...",
    "labTechnicianId": 7,
    "labTechnicianUsername": "labtech1",
    "packQty": 2,
    "unitQty": 200
  }
}
```

This means the existing **Dağıt** button in the UI "just works" for approved lab-tech requests — if the approver picks a LAB_TECHNICIAN username as `receivedBy`, the stock lands in that technician's CEP DEPO automatically. No frontend change required for this behavior, though passing `purchaseId` explicitly (recommended) also closes the request in the same step.

## 6. Business rules now enforced

1. Lab tech consume → only own CEP DEPO. (`/cep-depo/consume` reads `req.user.id`.)
2. Main depot decrements only on `/cep-depo/distribute` (FEFO, transactional).
3. CEP DEPO increments only on `/cep-depo/distribute` (upsert into `cep_depo_balances`).
4. CEP DEPO decrements on `/cep-depo/consume` and `/cep-depo/return`. Never goes negative (server guard + `Math.max(0, …)`).
5. Lab tech request blocked if `cep_depo_balances.packQty > 0` or `unitQty > 0` for that item. Error: `409 CEP_DEPO_HAS_STOCK` with Turkish message + remaining quantities.
6. Every movement writes one `stock_movements` row inside the same transaction.
7. Pack ↔ unit conversion uses `lots.unitsPerPackage > item_definitions.unitsPerPackage > 1`.
8. UI shows `packQty`, `unitQty`, and `consumptionUnitType` per balance.
9. Distribution to CEP DEPO is restricted to ADMIN / SATINAL / SATINAL_LOJISTIK.
10. OBSERVER kept untouched; LAB_TECHNICIAN is a brand-new role with no auto-migration.

## 7. How to deploy

1. Pull the changes.
2. Run `npm install` (no new deps were added; existing tree suffices).
3. Start the server normally (`node server/index.js` or your existing process manager). On startup, the server logs `[ensureCepDepo] CEP DEPO schema verified.` once the new schema is in place. **No manual migration step is required**, but the SQL file at `server/migrations/add_cep_depo_system.sql` is the canonical reference if you prefer DBA-managed migrations.
4. Build the frontend (`npm run build`) and deploy as usual.
5. As an admin, navigate to **Kullanıcılar** and either:
   - promote some existing users to `LAB_TECHNICIAN`, **or**
   - use the seed user `labtech1` (password `0000`) created by the migration for smoke testing.

## 8. Open assumptions / questions for product owner

1. **`labtech1` seed.** The migration inserts a sample lab technician user (`labtech1` / `0000`). Delete it in production. Tracked in TESTING_CHECKLIST.
2. **Existing department distributions.** The legacy `distributions` table is **not** migrated to `cep_depo_distributions`. Past department-level handouts continue to live in the old table; the new model is forward-only. Confirm this is acceptable.
3. **Return crediting.** When a lab tech returns stock without specifying `lotId`, the server picks the most recently received lot for the item (or creates a `RETURN-…` lot if none exists). Confirm this matches operational policy.
4. **Pack ↔ unit rounding.** Consumptions in `UNIT`/`TEST` derive a fractional `packDelta = qty / factor`. Balances are stored as `DECIMAL(12,2)` and `DECIMAL(14,2)`; `Math.max(0, …)` prevents negatives. If you need integer-only packs, raise this for a follow-up rule.
5. **Override audit retention.** `REQUEST_OVERRIDE` rows in `stock_movements` are write-once and indexed by `requestId`; no `clear-all` endpoint touches `stock_movements`. Confirm this is acceptable for compliance.

## 9. Out of scope (explicit non-goals)

- Replacing or rewriting the existing FEFO `/api/distribute` (department handout) flow.
- Migrating legacy `distributions` rows.
- A mobile-only UI.
- Cron-based status flips for `cep_depo_balances.status` (handled inline).
- A dedicated permission for "CEP DEPO read-only auditor" — covered by existing OBSERVER + the `/api/cep-depo/*` GET endpoints.
