# CEP DEPO & LAB TECHNICIAN — Design

> Scope: additive redesign layered on top of the existing `lab-equipment-tracker`
> app. The audit baseline (roles, tables, workflow) lives in the sibling files
> in `docs/audit/`. Read `USER_ROLES_AND_PERMISSIONS.md` and
> `FULL_WORKFLOW_ANALYSIS.md` first.
>
> Decisions locked with product owner (see conversation log):
> 1. **LAB_TECHNICIAN is a NEW role.** OBSERVER is kept as a read-only auditor
>    role; existing OBSERVER users are **not** auto-migrated.
> 2. **Two depots kept distinct.** MAIN_DEPOT (existing `lots` table) and
>    CEP_DEPO (new per-technician balance). Every movement between them is
>    logged with requester / receiver / operator / timestamp.
> 3. **Pack / unit / test-capacity** lives on `item_definitions` as default and
>    may be overridden on `lots` (per-receipt override).
> 4. **Override on request-block:** ADMIN **or** SATINAL may file a request on
>    a lab technician's behalf with mandatory `overrideReason` (logged).
> 5. Implementation delivered all-in-one: migration + backend + UI.

## 1. Glossary

| Term | Meaning |
|---|---|
| **Main Depot** | Existing warehouse stock. Physically stored as `lots` rows (`currentQuantity`). Source of truth for raw on-hand stock. |
| **CEP DEPO** | *"Pocket depot"* — a virtual per-lab-technician local stock bucket. One balance row per (technician, item). |
| **Pack** | Primary procurement unit (box, bottle, kit). Stored as `currentQuantity` in `lots`. |
| **Unit / Test capacity** | Number of usable "shots" per pack. Example: 1 pack = 100 tests. |
| **Consumption unit type** | `PACK` \| `UNIT` \| `TEST`. Describes what a lab technician subtracts when they record usage. |
| **Distribution (to CEP DEPO)** | Movement of stock from Main Depot → a specific lab technician's CEP DEPO. Replaces/augments "department distribution" for lab technicians. |
| **Consumption** | Lab technician records actual usage; decrements their CEP DEPO. |
| **Return** | Lab technician returns unused stock back to Main Depot. |

## 2. User roles after this change

| Role | Summary | CEP DEPO? |
|---|---|:-:|
| `ADMIN` | All powers. Can override request-block. Can force-adjust CEP DEPO balances. | N/A |
| `SATINAL` | Approves purchase requests. Can distribute from Main Depot → CEP DEPO. Can file request on behalf of a lab technician with override reason. | N/A |
| `SATINAL_LOJISTIK` | Places supplier orders + receives goods. Can distribute from Main Depot → CEP DEPO. | N/A |
| `LAB_TECHNICIAN` *(new)* | Owns a CEP DEPO. Creates requests **only if** CEP DEPO balance for that item is zero. Records consumption. Returns unused stock. | ✅ owns one |
| `OBSERVER` | Unchanged. Read-only auditor. Sees CEP DEPO data but cannot write. | 👁 read-only |

### 2.1 Permission delta (only new/changed rows vs baseline)

| Endpoint | ADMIN | SATINAL | SATINAL_LOJISTIK | LAB_TECHNICIAN | OBSERVER |
|---|:-:|:-:|:-:|:-:|:-:|
| `GET /api/cep-depo/balances` (all technicians) | ✅ | ✅ | ✅ | ❌ | 👁 |
| `GET /api/cep-depo/my-balances` | ✅ | ✅ | ✅ | ✅ (own) | ✅ |
| `POST /api/cep-depo/distribute` (Main → CEP) | ✅ | ✅ | ✅ | ❌ | ❌ |
| `POST /api/cep-depo/consume` | ✅ (any tech, adjust) | ❌ | ❌ | ✅ (own) | ❌ |
| `POST /api/cep-depo/return` | ✅ | ✅ | ✅ | ✅ (own) | ❌ |
| `GET /api/cep-depo/movements` | ✅ | ✅ | ✅ | ✅ (own) | 👁 |
| `POST /api/purchases` (request) | ✅ | ✅ (may carry `requestedFor` + `overrideReason`) | ✅ | ✅ (blocked if own CEP balance > 0) | ❌ |

## 3. Business rules (authoritative)

1. **Ownership.** A lab technician consumes **only** from their own CEP DEPO. The backend enforces `labTechnicianId = req.user.id` on `/consume`.
2. **Main Depot drains on distribution, not on request/approval.** Existing receive-goods semantics unchanged. Stock only leaves Main Depot when `POST /api/cep-depo/distribute` completes.
3. **CEP DEPO += on distribution.** One row in `cep_depo_balances` per (labTechnicianId, itemId); upsert-increment on distribution.
4. **CEP DEPO -= on consumption / return.** Never allowed to go negative (DB `CHECK` + server guard).
5. **Request-block.** A `LAB_TECHNICIAN` creating a request for `itemId` is **blocked** if `cep_depo_balances.remainingUnitQty > 0` or `remainingPackQty > 0` for (req.user.id, itemId). Error code `CEP_DEPO_HAS_STOCK` with a Turkish message.
6. **Override.** `ADMIN` or `SATINAL` may post `POST /api/purchases` with `{ requestedFor: <labTechnicianUsername>, overrideReason: "..." }`. In that case the block is skipped; the row stores both users and the reason. Audit row is written to `stock_movements` with `movementType = 'REQUEST_OVERRIDE'` and a `notes` copy of the reason.
7. **Every stock change writes exactly one `stock_movements` row** inside the same transaction. Movement types:
   `RECEIVE` (supplier → main), `DISTRIBUTE_CEP` (main → cep), `CONSUME` (cep → consumed), `RETURN_CEP` (cep → main), `ADJUSTMENT` (admin correction), `WASTE` (main|cep → wasted), `REQUEST_OVERRIDE` (audit-only, no stock delta).
8. **Pack / unit math.**
   `effectiveUnitsPerPackage = COALESCE(lots.unitsPerPackage, item_definitions.unitsPerPackage, 1)`.
   `effectiveConsumptionUnitType = COALESCE(lots.consumptionUnitType, item_definitions.consumptionUnitType, 'PACK')`.
   Backend converts pack ↔ unit using this factor on every movement so the UI can show both numbers.

## 4. Data model additions

```text
item_definitions  (ALTER — defaults for pack/unit/test)
 + packageUnit          VARCHAR(50)     -- e.g. 'KUTU', 'SISE', 'KIT'
 + consumptionUnit      VARCHAR(50)     -- e.g. 'TEST', 'ML', 'ADET'
 + unitsPerPackage      INT             -- e.g. 100 (tests per pack)
 + consumptionUnitType  VARCHAR(16)     -- 'PACK' | 'UNIT' | 'TEST' (default 'PACK')

lots  (ALTER — per-lot override)
 + packageUnit          VARCHAR(50)     NULL (override)
 + unitsPerPackage      INT             NULL (override)
 + consumptionUnitType  VARCHAR(16)     NULL (override)

purchases  (ALTER — support override flow)
 + requestedFor         VARCHAR(100)    NULL  -- lab tech username when filed on behalf
 + overrideReason       TEXT            NULL  -- required when requestedFor is set by non-self
 + isCepDepoRequest     TINYINT(1)      DEFAULT 1  -- distinguishes lab-tech requests from legacy department requests

cep_depo_balances  (NEW — per-technician per-item snapshot)
  id                    VARCHAR(64) PK
  labTechnicianId       BIGINT UNSIGNED NOT NULL  (users.id)
  labTechnicianUsername VARCHAR(100) NOT NULL
  itemId                VARCHAR(64) NOT NULL
  packQty               DECIMAL(12,2) NOT NULL DEFAULT 0  -- packs currently held
  unitQty               DECIMAL(14,2) NOT NULL DEFAULT 0  -- remaining units/tests
  status                VARCHAR(20) NOT NULL DEFAULT 'ACTIVE'  -- ACTIVE | ZERO
  createdAt             DATETIME
  updatedAt             DATETIME
  UNIQUE (labTechnicianId, itemId)

cep_depo_distributions  (NEW — header per main→cep event)
  id                    VARCHAR(64) PK
  labTechnicianId       BIGINT UNSIGNED NOT NULL
  labTechnicianUsername VARCHAR(100) NOT NULL
  itemId                VARCHAR(64) NOT NULL
  packQty               DECIMAL(12,2) NOT NULL     -- total packs handed out
  unitQty               DECIMAL(14,2) NOT NULL     -- total units issued = packQty * effectiveUnitsPerPackage
  purchaseId            VARCHAR(64) NULL           -- originating request, if any
  distributedBy         VARCHAR(100) NOT NULL      -- operator username (satinalma/admin)
  distributedAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  notes                 TEXT NULL

cep_depo_distribution_lots  (NEW — which lots fed a distribution; FEFO split)
  id                    VARCHAR(64) PK
  cepDistributionId     VARCHAR(64) NOT NULL
  lotId                 VARCHAR(64) NOT NULL
  lotNumber             VARCHAR(100) NULL
  packQty               DECIMAL(12,2) NOT NULL
  unitQty               DECIMAL(14,2) NOT NULL

cep_depo_consumptions  (NEW — lab tech usage events)
  id                    VARCHAR(64) PK
  labTechnicianId       BIGINT UNSIGNED NOT NULL
  labTechnicianUsername VARCHAR(100) NOT NULL
  itemId                VARCHAR(64) NOT NULL
  consumptionUnitType   VARCHAR(16) NOT NULL       -- PACK | UNIT | TEST
  quantity              DECIMAL(14,2) NOT NULL     -- in the chosen unit
  packDelta             DECIMAL(12,2) NOT NULL     -- signed change to balance (negative)
  unitDelta             DECIMAL(14,2) NOT NULL     -- signed change to balance (negative)
  testCount             INT NULL                   -- how many examinations done (optional)
  notes                 TEXT NULL
  performedAt           DATETIME DEFAULT CURRENT_TIMESTAMP

stock_movements  (NEW — unified ledger, write-once)
  id                    VARCHAR(64) PK
  movementType          VARCHAR(32) NOT NULL       -- RECEIVE | DISTRIBUTE_CEP | CONSUME | RETURN_CEP | ADJUSTMENT | WASTE | REQUEST_OVERRIDE
  itemId                VARCHAR(64) NOT NULL
  fromLocation          VARCHAR(32) NOT NULL       -- SUPPLIER | MAIN_DEPOT | CEP_DEPO | NONE
  toLocation            VARCHAR(32) NOT NULL       -- MAIN_DEPOT | CEP_DEPO | CONSUMED | WASTE | NONE
  packQty               DECIMAL(12,2) NOT NULL DEFAULT 0
  unitQty               DECIMAL(14,2) NOT NULL DEFAULT 0
  performedByUserId     BIGINT UNSIGNED NULL
  performedByUsername   VARCHAR(100) NULL
  labTechnicianId       BIGINT UNSIGNED NULL
  requestId             VARCHAR(64) NULL           -- purchases.id
  refId                 VARCHAR(64) NULL           -- lot / distribution / consumption id
  notes                 TEXT NULL
  createdAt             DATETIME DEFAULT CURRENT_TIMESTAMP
```

## 5. End-to-end flow (request → distribute → consume)

```mermaid
sequenceDiagram
  autonumber
  participant LT as Lab Technician
  participant UI
  participant API
  participant DB
  participant SA as Satınalma (SATINAL / LOJISTIK)

  LT->>UI: "Request 2 packs of Item X"
  UI->>API: POST /api/purchases { itemId, requestedQty:2 }
  API->>DB: SELECT cep_depo_balances WHERE (lt, item)
  alt remaining > 0
    API-->>UI: 409 CEP_DEPO_HAS_STOCK
    UI-->>LT: "You still have X in CEP DEPO…"
  else balance zero
    API->>DB: INSERT purchases TALEP_EDILDI (isCepDepoRequest=1)
    API-->>UI: 200 { purchase }
  end

  SA->>API: POST /api/purchases/:id/approve
  SA->>API: POST /api/cep-depo/distribute { purchaseId, labTechnicianId, packQty }
  API->>DB: TX { FEFO deduct lots; INSERT cep_depo_distributions; UPSERT cep_depo_balances; INSERT stock_movements }
  API-->>SA: 200 { distribution }

  LT->>UI: "I used 10 tests"
  UI->>API: POST /api/cep-depo/consume { itemId, consumptionUnitType:'TEST', quantity:10 }
  API->>DB: TX { UPDATE cep_depo_balances; INSERT cep_depo_consumptions; INSERT stock_movements }
  API-->>UI: 200 { balance }
```

## 6. UI surface

- **New tab `CEP DEPO`** visible to `ADMIN`, `SATINAL`, `SATINAL_LOJISTIK`, `LAB_TECHNICIAN`, `OBSERVER`. All content renders from the new `src/CepDepo.jsx` component and switches views by role:
  - **Lab technician view:** "My CEP DEPO" — balance list per item (packs + units), consume form, return form, history.
  - **Satınalma / Admin view:** "All CEP DEPO" — cross-technician balances, distribute-to-technician form (with FEFO preview), full movement log.
  - **Observer view:** read-only "All CEP DEPO" + movement log.
- Existing tabs unchanged except:
  - "Talepler" now shows `requestedFor` and `overrideReason` columns.
  - Item-edit form gains `packageUnit`, `consumptionUnit`, `unitsPerPackage`, `consumptionUnitType` (optional).

## 7. Error codes (new)

| Code | HTTP | Meaning |
|---|---|---|
| `CEP_DEPO_HAS_STOCK` | 409 | Lab technician still has balance for the requested item. |
| `OVERRIDE_REASON_REQUIRED` | 400 | `requestedFor` set without `overrideReason`. |
| `OVERRIDE_FORBIDDEN` | 403 | Non-admin / non-satinal tried to use `requestedFor`. |
| `INSUFFICIENT_CEP_BALANCE` | 409 | Consumption / return exceeds current CEP DEPO balance. |
| `INSUFFICIENT_MAIN_STOCK` | 409 | Distribution requested more than available FEFO stock. |
| `LAB_TECHNICIAN_REQUIRED` | 400 | Distribution target user is not LAB_TECHNICIAN. |

## 8. Out of scope / future work

- Cron job to auto-flip `cep_depo_balances.status = 'ZERO'` when both quantities reach zero (currently handled inline).
- Reading existing legacy `distributions` rows and retro-classifying them as CEP or department — left for a separate migration when the product owner confirms mapping rules.
- Mobile UI — reuses the existing desktop React tree.
